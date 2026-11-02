/*
 * Farmington App - synced mode (Firebase Firestore).
 *
 * Used when firebase-config.js has real values. Every phone listens to the
 * same Firestore collection, so a change on one phone shows on all the others
 * within a second or two.
 *
 * Offers the same four functions as store-local.js: start, add, take, reset.
 *
 * How the important parts work:
 * - Live updates: onSnapshot() calls us every time anything in the collection
 *   changes, on any phone.
 * - Safe counting: take() runs inside a Firestore transaction. Firestore reads
 *   the latest request, we check how many are left, and the write only goes
 *   through if nobody changed the request in between. If someone did,
 *   Firestore re-runs it with the fresh numbers. So two drivers tapping at the
 *   same moment can never log more people than are left.
 * - Weak signal: Firestore keeps a copy of the data on the phone (offline
 *   persistence). New requests made offline are saved on the phone and sent
 *   when the connection returns. A transaction needs the server, so a "Picked
 *   up" tap made offline is kept in a small waiting list on the phone and run
 *   (still as a safe transaction) as soon as the phone is back online.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./logic.js"));
  else root.FarmFirebaseStore = factory(root.FarmLogic);
})(this, function (L) {
  "use strict";

  // Firebase web SDK, loaded straight from Google's official CDN.
  var SDK_VERSION = "12.19.0";
  var SDK_BASE = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/";

  // Name of the Firestore collection that holds the demo requests.
  var COLLECTION = "farmingtonDemo";

  // Where "Picked up" taps made while offline wait to be sent.
  var QUEUE_KEY = "farmingtonApp.waitingTaps.v1";

  // True when firebase-config.js has been filled in.
  function isConfigured(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    var keys = ["apiKey", "authDomain", "projectId", "appId"];
    return keys.every(function (k) {
      return typeof cfg[k] === "string" && cfg[k] && cfg[k].indexOf("PASTE_") !== 0;
    });
  }

  // Opens Firestore with offline persistence switched on.
  // If a browser can't keep an offline copy (some private modes), Firestore
  // quietly falls back to memory and the app still works while online.
  function connect(config, sdkApp, sdkFs) {
    var app = sdkApp.initializeApp(config);
    return sdkFs.initializeFirestore(app, {
      localCache: sdkFs.persistentLocalCache({ tabManager: sdkFs.persistentMultipleTabManager() })
    });
  }

  // Firestore error codes that mean "no connection" rather than a real problem.
  function isConnectionError(e) {
    return !!e && (e.code === "unavailable" || e.code === "deadline-exceeded");
  }

  // fs:   the Firestore functions (from the CDN, or a fake one in tests)
  // db:   the database from connect()
  // opts: { storage, isOnline(), onOnline(fn), onOffline(fn) }
  function createFirebaseStore(fs, db, opts) {
    var col = fs.collection(db, COLLECTION);
    var h = null;
    var fromCache = false;
    var seeded = false;
    var flushing = false;
    var queue = loadQueue();

    function loadQueue() {
      try {
        var q = JSON.parse(opts.storage.getItem(QUEUE_KEY));
        if (Array.isArray(q)) return q;
      } catch (e) { /* nothing waiting */ }
      return [];
    }

    function saveQueue() {
      try { opts.storage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch (e) { /* ignore */ }
    }

    function sendStatus() {
      if (!h) return;
      h.onStatus({ mode: "sync", offline: !opts.isOnline() || fromCache, pending: queue.length });
    }

    // Writes the sample requests with fixed ids (seed-1, seed-2 ...).
    function seedBatch(batch) {
      L.seedRequests(Date.now()).forEach(function (r) {
        var data = Object.assign({}, r);
        delete data.id;
        batch.set(fs.doc(db, COLLECTION, r.id), data);
      });
    }

    // The safe "log people" step. Runs as a Firestore transaction.
    function runTake(id, n, driver, at) {
      var ref = fs.doc(db, COLLECTION, id);
      return fs.runTransaction(db, function (tx) {
        return tx.get(ref).then(function (snap) {
          var r = snap.exists() ? snap.data() : null;
          var result = L.applyTake(r, n, driver, at); // throws if nobody is left
          tx.update(ref, result.update);
          return result;
        });
      });
    }

    function enqueue(id, n, driver) {
      queue.push({ id: id, n: n, driver: driver, at: Date.now() });
      saveQueue();
      sendStatus();
      return { queued: true, n: n };
    }

    // Sends the taps that waited while offline, one at a time, oldest first.
    function flush() {
      if (flushing || !queue.length || !opts.isOnline()) return Promise.resolve();
      flushing = true;
      var item = queue[0];
      return runTake(item.id, item.n, item.driver, item.at).then(function (result) {
        queue.shift();
        if (h) {
          h.onNotice(result.n < item.n
            ? "Synced: only " + result.n + " of " + item.n + " were still left, so " + result.n + " logged."
            : "Synced: " + result.n + " logged.");
        }
      }, function (e) {
        if (isConnectionError(e)) return "stop"; // still no connection: try again later
        queue.shift();
        if (h) h.onNotice("Could not log " + item.n + ": " + e.message);
      }).then(function (stop) {
        saveQueue();
        flushing = false;
        sendStatus();
        if (stop !== "stop") return flush();
      });
    }

    return {
      mode: "sync",

      start: function (handlers) {
        h = handlers;
        fs.onSnapshot(col, { includeMetadataChanges: true }, function (snap) {
          fromCache = snap.metadata.fromCache;
          var list = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });

          // Very first visit to an empty database: add the sample data.
          if (!fromCache && !list.length && !seeded) {
            seeded = true;
            var b = fs.writeBatch(db);
            seedBatch(b);
            b.commit().catch(function (e) { h.onError(e); });
          }

          h.onData(list);
          sendStatus();
          if (!fromCache) flush();
        }, function (e) { h.onError(e); });

        opts.onOnline(function () { sendStatus(); flush(); });
        opts.onOffline(sendStatus);
        sendStatus();
      },

      add: function (input) {
        var r = L.makeRequest(input, Date.now());
        // Saved on the phone straight away and sent to the server when it can.
        // We don't wait for the server, so this also works with no signal.
        fs.setDoc(fs.doc(col), r).catch(function (e) { h.onError(e); });
        return Promise.resolve(r);
      },

      take: function (id, n, driver) {
        if (!opts.isOnline()) return Promise.resolve(enqueue(id, n, driver));
        return runTake(id, n, driver, Date.now()).catch(function (e) {
          if (isConnectionError(e)) return enqueue(id, n, driver);
          throw e;
        });
      },

      // Deletes every document in the collection and writes the sample data.
      // One batch holds up to 500 changes, plenty for a demo.
      reset: function () {
        if (!opts.isOnline()) {
          return Promise.reject(L.fail("offline", "Reset needs a connection. Try again when online."));
        }
        return fs.getDocs(col).then(function (snap) {
          var b = fs.writeBatch(db);
          snap.docs.forEach(function (d) { b.delete(d.ref); });
          seedBatch(b); // a set after a delete in the same batch wins, so seeds come back fresh
          return b.commit();
        }).then(function () {
          queue = []; // waiting taps pointed at the old data
          saveQueue();
          sendStatus();
        });
      },

      // Only for the tests: lets them wait until waiting taps are sent.
      _flush: flush
    };
  }

  return {
    SDK_BASE: SDK_BASE,
    COLLECTION: COLLECTION,
    isConfigured: isConfigured,
    connect: connect,
    createFirebaseStore: createFirebaseStore
  };
});
