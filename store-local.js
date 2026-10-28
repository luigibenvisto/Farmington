/*
 * Farmington App - local mode.
 *
 * Used when firebase-config.js still has its placeholder values.
 * Requests are saved in this browser only (localStorage), so two phones do
 * NOT see each other's changes. Two tabs on the same computer do stay in step.
 *
 * Every store (local or synced) offers the same four functions:
 *   start(handlers)          begin sending the request list to the screen
 *   add(input)               save a new request
 *   take(id, n, driver)      log n people on a request
 *   reset()                  wipe everything and restore the sample data
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./logic.js"));
  else root.FarmLocalStore = factory(root.FarmLogic);
})(this, function (L) {
  "use strict";

  var KEY = "farmingtonApp.requests.v3";

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // opts.storage: where to save (window.localStorage in the browser)
  // opts.window:  the browser window, to hear changes made in other tabs
  function createLocalStore(opts) {
    var storage = opts.storage;
    var h = null;

    function read() {
      try {
        var list = JSON.parse(storage.getItem(KEY));
        if (Array.isArray(list)) return list;
      } catch (e) { /* missing or broken: start again from the sample data */ }
      var seed = L.seedRequests(Date.now());
      write(seed);
      return seed;
    }

    function write(list) {
      try { storage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage blocked: keep going in memory */ }
    }

    function emit() { if (h) h.onData(read()); }

    return {
      mode: "local",

      start: function (handlers) {
        h = handlers;
        h.onStatus({ mode: "local", offline: false, pending: 0 });
        emit();
        if (opts.window) {
          opts.window.addEventListener("storage", function (e) { if (e.key === KEY) emit(); });
        }
      },

      add: function (input) {
        var list = read();
        var r = L.makeRequest(input, Date.now());
        r.id = uid();
        list.push(r);
        write(list);
        emit();
        return Promise.resolve(r);
      },

      take: function (id, n, driver) {
        try {
          var list = read();
          var r = list.filter(function (x) { return x.id === id; })[0];
          var result = L.applyTake(r, n, driver, Date.now());
          r.taken = result.update.taken;
          r.log = result.update.log;
          write(list);
          emit();
          return Promise.resolve(result);
        } catch (e) {
          return Promise.reject(e);
        }
      },

      reset: function () {
        write(L.seedRequests(Date.now()));
        emit();
        return Promise.resolve();
      }
    };
  }

  return { createLocalStore: createLocalStore };
});
