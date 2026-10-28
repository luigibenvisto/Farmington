/*
 * Farmington App - shared rules.
 *
 * Plain functions with no screen code, used by both the local mode
 * (store-local.js) and the synced mode (store-firebase.js). Keeping the rules
 * in one place means both modes behave exactly the same, and the automated
 * tests in tests/ can check them.
 *
 * All data here is invented for the demo. Head counts only, never names.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FarmLogic = factory();
})(this, function () {
  "use strict";

  var EVENTS = ["Fall Classic", "Homecoming Game", "Night Game 7"];
  var DIRECTIONS = ["dropoff", "pickup"];
  var MAX_PEOPLE = 60;
  var MIN = 60000;

  function remaining(r) { return Math.max(0, r.headCount - r.taken); }
  function isDone(r) { return remaining(r) === 0; }

  function clampInt(v, min, max) {
    v = Math.floor(Number(v));
    if (!isFinite(v)) v = min;
    return Math.min(max, Math.max(min, v));
  }

  // Builds a clean request from the form. Only these fields are ever saved,
  // so nothing else (like a name) can sneak into the shared database.
  function makeRequest(input, now) {
    var r = {
      type: input.type === "game" ? "game" : "h2b",
      headCount: clampInt(input.headCount, 1, MAX_PEOPLE),
      taken: 0,
      log: [],
      createdAt: now
    };
    if (r.type === "h2b") {
      r.note = String(input.note || "").trim().slice(0, 80);
    } else {
      r.event = EVENTS.indexOf(input.event) >= 0 ? input.event : EVENTS[0];
      r.direction = DIRECTIONS.indexOf(input.direction) >= 0 ? input.direction : "dropoff";
    }
    return r;
  }

  function fail(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  // The core rule: a driver logs `wanted` people on request `r`.
  // Never logs more than are left on the request. Returns the number actually
  // logged and the new values to save. Throws if nobody is left.
  // In synced mode this runs inside a Firestore transaction, so `r` is always
  // the latest saved version, even if another driver tapped at the same moment.
  function applyTake(r, wanted, driver, at) {
    if (!r) throw fail("not-found", "This request no longer exists.");
    var left = remaining(r);
    if (left < 1) throw fail("done", "Nobody is left on this request.");
    wanted = clampInt(wanted, 1, MAX_PEOPLE);
    var n = Math.min(wanted, left);
    return {
      n: n,
      wanted: wanted,
      left: left - n,
      update: {
        taken: r.taken + n,
        log: (r.log || []).concat([{ driver: driver, n: n, at: at }])
      }
    };
  }

  // The shared game headcount, worked out from the requests every phone sees.
  // Left to pick up = people still waiting on "Back after game" requests.
  function gameTotals(requests, event) {
    var t = { drop: 0, pick: 0, left: 0 };
    requests.forEach(function (r) {
      if (r.type !== "game" || r.event !== event) return;
      if (r.direction === "dropoff") t.drop += r.taken;
      else { t.pick += r.taken; t.left += remaining(r); }
    });
    return t;
  }

  // Sample data. Fixed ids ("seed-1" ...) so two phones seeding at the same
  // time write the same documents instead of creating duplicates.
  // The game starts with 6 people left to pick up (3 + 3).
  function seedRequests(now) {
    var ago = function (m) { return now - m * MIN; };
    var ev = EVENTS[0];
    var list = [
      { type: "game", event: ev, direction: "dropoff", headCount: 12, taken: 12, createdAt: ago(95),
        log: [{ driver: "Driver A", n: 12, at: ago(80) }] },
      { type: "game", event: ev, direction: "pickup", headCount: 5, taken: 2, createdAt: ago(20),
        log: [{ driver: "Driver B", n: 2, at: ago(6) }] },
      { type: "game", event: ev, direction: "pickup", headCount: 3, taken: 0, createdAt: ago(10), log: [] },
      { type: "h2b", headCount: 6, taken: 6, note: "Early shift crew", createdAt: ago(70),
        log: [{ driver: "Driver B", n: 6, at: ago(60) }] },
      { type: "h2b", headCount: 4, taken: 1, note: "", createdAt: ago(12),
        log: [{ driver: "Driver A", n: 1, at: ago(3) }] },
      { type: "h2b", headCount: 3, taken: 0, note: "Two bag carts", createdAt: ago(2), log: [] }
    ];
    list.forEach(function (r, i) { r.id = "seed-" + (i + 1); });
    return list;
  }

  return {
    EVENTS: EVENTS,
    MAX_PEOPLE: MAX_PEOPLE,
    remaining: remaining,
    isDone: isDone,
    makeRequest: makeRequest,
    applyTake: applyTake,
    gameTotals: gameTotals,
    seedRequests: seedRequests,
    fail: fail
  };
});
