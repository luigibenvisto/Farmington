/*
 * A small in-memory stand-in for Firebase Firestore, used ONLY by the tests.
 * The real app never loads this file.
 *
 * One "backend" plays the role of the Firestore server. Each phone is a
 * "client" of that backend with its own listeners and its own online/offline
 * switch. It copies the Firestore behaviour the app relies on:
 *   - onSnapshot listeners on every client fire after each change (async,
 *     like a network round trip), with metadata.fromCache while offline;
 *   - runTransaction is optimistic: it records the version of every document
 *     it read and only commits if none changed meanwhile, otherwise it re-runs
 *     the whole function (up to 5 tries), as real Firestore does;
 *   - transactions fail with code "unavailable" while offline;
 *   - setDoc while offline is applied on the phone at once and sent to the
 *     backend when the client comes back online.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FakeFirestore = factory();
})(this, function () {
  "use strict";

  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }

  function createBackend() {
    var docs = {}; // "collection/id" -> { data, version }
    var version = 0;
    var clients = [];
    var autoId = 0;
    var stats = { commits: 0, conflicts: 0 };

    // Applies writes if every read document is still at the version that was read.
    function commit(writes, reads) {
      for (var path in reads) {
        var cur = docs[path] ? docs[path].version : 0;
        if (cur !== reads[path]) { stats.conflicts++; return false; }
      }
      writes.forEach(function (w) {
        if (w.op === "delete") delete docs[w.path];
        else if (w.op === "set") docs[w.path] = { data: clone(w.data), version: ++version };
        else if (w.op === "update") {
          if (!docs[w.path]) throw err("not-found", "No document to update: " + w.path);
          docs[w.path] = { data: Object.assign(clone(docs[w.path].data), clone(w.data)), version: ++version };
        }
      });
      stats.commits++;
      clients.forEach(function (c) { c._changed(); });
      return true;
    }

    function client() {
      var online = true;
      var cache = {};        // what this phone last saw from the backend
      var pending = [];      // writes made while offline
      var listeners = [];

      function viewDocs() {
        // Server data when online; otherwise the cached copy plus local writes.
        var base = online ? docs : cache;
        var view = {};
        Object.keys(base).forEach(function (p) { view[p] = { data: base[p].data }; });
        if (!online) pending.forEach(function (w) {
          if (w.op === "delete") delete view[w.path];
          else view[w.path] = { data: w.data };
        });
        return view;
      }

      function snapshotFor(colPath) {
        var view = viewDocs();
        var list = Object.keys(view).filter(function (p) { return p.indexOf(colPath + "/") === 0; }).sort()
          .map(function (p) {
            var id = p.slice(colPath.length + 1);
            return { id: id, ref: api.doc(api._db, colPath, id), data: function () { return clone(view[p].data); } };
          });
        return { docs: list, metadata: { fromCache: !online, hasPendingWrites: !online && pending.length > 0 } };
      }

      function deliver() {
        listeners.forEach(function (l) { l.next(snapshotFor(l.col)); });
      }

      var api = {
        _db: { fake: true },

        // Test controls
        setOnline: function (on) {
          if (on === online) return;
          if (!on) cache = clone(docs);
          online = on;
          if (on && pending.length) {
            var w = pending; pending = [];
            commit(w, {}); // last write wins, like real offline writes
          } else {
            setTimeout(deliver, 0);
          }
        },
        isOnline: function () { return online; },
        _changed: function () { if (online) setTimeout(deliver, 0); },

        // ---- The Firestore functions the app uses ----
        initializeFirestore: function () { return api._db; },
        persistentLocalCache: function (o) { return { kind: "persistent", o: o }; },
        persistentMultipleTabManager: function () { return { kind: "multi-tab" }; },
        memoryLocalCache: function () { return { kind: "memory" }; },

        collection: function (db, name) { return { type: "collection", path: name }; },

        doc: function (parent, colName, id) {
          if (parent && parent.type === "collection") {
            id = colName || ("auto" + (++autoId));
            colName = parent.path;
          }
          return { type: "doc", path: colName + "/" + id, id: id };
        },

        onSnapshot: function (colRef, options, next, onError) {
          var l = { col: colRef.path, next: next, onError: onError };
          listeners.push(l);
          setTimeout(function () { next(snapshotFor(l.col)); }, 0);
          return function () { listeners.splice(listeners.indexOf(l), 1); };
        },

        getDocs: function (colRef) {
          return tick().then(function () { return snapshotFor(colRef.path); });
        },

        setDoc: function (ref, data) {
          if (online) {
            return tick().then(function () { commit([{ op: "set", path: ref.path, data: data }], {}); });
          }
          pending.push({ op: "set", path: ref.path, data: clone(data) });
          setTimeout(deliver, 0);
          return new Promise(function () {}); // like Firestore: resolves only once the server has it
        },

        writeBatch: function () {
          var writes = [];
          return {
            set: function (ref, data) { writes.push({ op: "set", path: ref.path, data: data }); },
            delete: function (ref) { writes.push({ op: "delete", path: ref.path }); },
            commit: function () {
              if (!online) return Promise.reject(err("unavailable", "offline"));
              return tick().then(function () { commit(writes, {}); });
            }
          };
        },

        runTransaction: function (db, fn) {
          var attempt = 0;
          function run() {
            if (!online) return Promise.reject(err("unavailable", "Failed to get document because the client is offline."));
            attempt++;
            var reads = {}, writes = [];
            var tx = {
              get: function (ref) {
                return tick().then(function () {
                  var d = docs[ref.path];
                  reads[ref.path] = d ? d.version : 0;
                  return { id: ref.id, exists: function () { return !!d; }, data: function () { return d ? clone(d.data) : undefined; } };
                });
              },
              update: function (ref, data) { writes.push({ op: "update", path: ref.path, data: data }); },
              set: function (ref, data) { writes.push({ op: "set", path: ref.path, data: data }); }
            };
            return Promise.resolve(fn(tx)).then(function (result) {
              return tick().then(function () {
                if (commit(writes, reads)) return result;
                if (attempt >= 5) throw err("aborted", "Transaction failed after 5 tries");
                return run();
              });
            });
          }
          return run();
        }
      };

      clients.push(api);
      return api;
    }

    return { client: client, docs: docs, stats: stats };
  }

  return { createBackend: createBackend };
});
