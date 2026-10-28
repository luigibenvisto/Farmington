/*
 * Automated checks for the sync and counting rules.
 * Run with:  node --test tests/sync.test.js
 *
 * Uses the real store code (store-firebase.js, store-local.js, logic.js)
 * against the fake Firestore in fake-firestore.js. Each "phone" below is a
 * separate fake client connected to one shared fake backend.
 */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var L = require("../logic.js");
var FB = require("../store-firebase.js");
var Local = require("../store-local.js");
var Fake = require("./fake-firestore.js");

var EV = L.EVENTS[0];
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms || 5); }); };

function memoryStorage() {
  var m = {};
  return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); } };
}

// Makes one simulated phone: a fake Firestore client plus the real synced store.
function phone(backend) {
  var c = backend.client();
  var onlineFns = [], offlineFns = [];
  var p = { client: c, data: [], status: null, notices: [], errors: [] };
  p.store = FB.createFirebaseStore(c, c.initializeFirestore(), {
    storage: memoryStorage(),
    isOnline: c.isOnline,
    onOnline: function (fn) { onlineFns.push(fn); },
    onOffline: function (fn) { offlineFns.push(fn); }
  });
  p.goOffline = function () { c.setOnline(false); offlineFns.forEach(function (f) { f(); }); };
  p.goOnline = function () { c.setOnline(true); onlineFns.forEach(function (f) { f(); }); };
  p.left = function () { return L.gameTotals(p.data, EV).left; };
  p.find = function (id) { return p.data.filter(function (r) { return r.id === id; })[0]; };
  p.store.start({
    onData: function (list) { p.data = list; },
    onStatus: function (s) { p.status = s; },
    onNotice: function (m) { p.notices.push(m); },
    onError: function (e) { p.errors.push(e); }
  });
  return p;
}

// Two phones on a freshly seeded backend.
async function twoPhones() {
  var backend = Fake.createBackend();
  var a = phone(backend), b = phone(backend);
  await wait(20); // first phone sees the empty database and seeds it
  return { backend: backend, a: a, b: b };
}

// ---------- Pure rules ----------

test("applyTake never logs more than are left", function () {
  var r = { headCount: 5, taken: 3, log: [] };
  var res = L.applyTake(r, 4, "Driver A", 1000);
  assert.equal(res.n, 2);
  assert.equal(res.left, 0);
  assert.equal(res.update.taken, 5);
  assert.deepEqual(res.update.log, [{ driver: "Driver A", n: 2, at: 1000 }]);
  assert.throws(function () { L.applyTake({ headCount: 5, taken: 5, log: [] }, 1, "Driver A", 0); }, { code: "done" });
  assert.throws(function () { L.applyTake(null, 1, "Driver A", 0); }, { code: "not-found" });
});

test("makeRequest keeps only head counts and allowed fields (no names)", function () {
  var r = L.makeRequest({ type: "h2b", headCount: 999, note: " hi ", name: "Real Person", phone: "555" }, 1);
  assert.deepEqual(Object.keys(r).sort(), ["createdAt", "headCount", "log", "note", "taken", "type"]);
  assert.equal(r.headCount, L.MAX_PEOPLE);
  var g = L.makeRequest({ type: "game", event: "Made up", direction: "sideways", headCount: 0 }, 1);
  assert.equal(g.event, L.EVENTS[0]);
  assert.equal(g.direction, "dropoff");
  assert.equal(g.headCount, 1);
});

test("seed data starts the game with 6 left to pick up and has H2B requests", function () {
  var seed = L.seedRequests(Date.now());
  assert.equal(L.gameTotals(seed, EV).left, 6);
  assert.ok(seed.filter(function (r) { return r.type === "h2b"; }).length >= 3);
});

test("isConfigured spots the placeholder config", function () {
  assert.equal(FB.isConfigured({ apiKey: "PASTE_API_KEY_HERE", authDomain: "PASTE_X", projectId: "PASTE_X", appId: "PASTE_X" }), false);
  assert.equal(FB.isConfigured({ apiKey: "AIza123", authDomain: "x.firebaseapp.com", projectId: "x", appId: "1:2:web:3" }), true);
  assert.equal(FB.isConfigured(undefined), false);
});

// ---------- Live sync between phones ----------

test("empty database is seeded once, even when two phones open it together", async function () {
  var t = await twoPhones();
  assert.equal(t.a.data.length, 6);
  assert.equal(t.b.data.length, 6);
  assert.equal(t.a.left(), 6);
  assert.equal(t.b.left(), 6);
});

test("Driver A logs 3 picked up, Driver B's 'left to pick up' drops right away", async function () {
  var t = await twoPhones();
  var res = await t.a.store.take("seed-3", 3, "Driver A");
  assert.equal(res.n, 3);
  await wait();
  assert.equal(t.b.left(), 3);
  var log = t.b.find("seed-3").log;
  assert.deepEqual([log[0].driver, log[0].n], ["Driver A", 3]);
});

test("a request sent from one phone appears on the other", async function () {
  var t = await twoPhones();
  await t.a.store.add({ type: "game", event: EV, direction: "pickup", headCount: 4 });
  await wait(10);
  assert.equal(t.b.data.length, 7);
  assert.equal(t.b.left(), 10);
});

// ---------- Transactions: simultaneous taps ----------

test("two drivers tap at the same moment for all 3 left: one gets 3, the other is told nobody is left", async function () {
  var t = await twoPhones();
  var results = await Promise.allSettled([
    t.a.store.take("seed-3", 3, "Driver A"),
    t.b.store.take("seed-3", 3, "Driver B")
  ]);
  var ok = results.filter(function (r) { return r.status === "fulfilled"; });
  var bad = results.filter(function (r) { return r.status === "rejected"; });
  assert.equal(ok.length, 1);
  assert.equal(ok[0].value.n, 3);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.code, "done");
  assert.ok(t.backend.stats.conflicts >= 1, "the second transaction should have hit a conflict and re-run");
  await wait();
  assert.equal(t.a.find("seed-3").taken, 3);
  assert.equal(t.a.left(), 3);
});

test("two drivers tap 2 each with 3 left: one logs 2, the other is limited to 1", async function () {
  var t = await twoPhones();
  var res = await Promise.all([
    t.a.store.take("seed-3", 2, "Driver A"),
    t.b.store.take("seed-3", 2, "Driver B")
  ]);
  var ns = res.map(function (r) { return r.n; }).sort();
  assert.deepEqual(ns, [1, 2]);
  await wait();
  assert.equal(t.b.find("seed-3").taken, 3);
  assert.equal(t.b.find("seed-3").log.length, 2);
});

test("stress: 8 phones tap at once on the same request, total never goes over", async function () {
  var backend = Fake.createBackend();
  var phones = [];
  for (var i = 0; i < 8; i++) phones.push(phone(backend));
  await wait(20);
  // seed-2 has 5 people, 2 already taken, so 3 left. Everyone tries to take 1 or 2.
  var res = await Promise.allSettled(phones.map(function (p, i) {
    return p.store.take("seed-2", 1 + (i % 2), "Driver " + "AB"[i % 2]);
  }));
  await wait();
  var r = phones[0].find("seed-2");
  var logged = res.filter(function (x) { return x.status === "fulfilled"; })
    .reduce(function (s, x) { return s + x.value.n; }, 0);
  assert.equal(r.taken, 5);
  assert.equal(logged, 3);
  assert.equal(r.log.reduce(function (s, e) { return s + e.n; }, 0), 5);
  res.filter(function (x) { return x.status === "rejected"; }).forEach(function (x) {
    assert.ok(["done", "aborted"].indexOf(x.reason.code) >= 0, "unexpected error " + x.reason.code);
  });
});

// ---------- Offline ----------

test("offline: status says offline, a tap waits on the phone, then syncs safely when back", async function () {
  var t = await twoPhones();
  t.b.goOffline();
  await wait();
  assert.equal(t.b.status.offline, true);

  var queued = await t.b.store.take("seed-3", 3, "Driver B");
  assert.equal(queued.queued, true);
  assert.equal(t.b.status.pending, 1);

  // Meanwhile Driver A, online, takes 2 of the 3.
  await t.a.store.take("seed-3", 2, "Driver A");
  await wait();
  assert.equal(t.a.left(), 4);

  // B comes back: its waiting tap runs as a transaction and is limited to the 1 left.
  t.b.goOnline();
  await wait(30);
  await t.b.store._flush();
  await wait();
  assert.equal(t.b.status.pending, 0);
  assert.equal(t.b.status.offline, false);
  assert.equal(t.a.find("seed-3").taken, 3);
  assert.equal(t.a.left(), 3);
  assert.match(t.b.notices.join(" "), /only 1 of 3/);
});

test("offline: a new request is kept on the phone and reaches the other phone after reconnect", async function () {
  var t = await twoPhones();
  t.a.goOffline();
  await t.a.store.add({ type: "h2b", headCount: 2, note: "" });
  await wait();
  assert.equal(t.a.data.length, 7, "shows on the offline phone at once");
  assert.equal(t.b.data.length, 6, "not on the other phone yet");
  t.a.goOnline();
  await wait(20);
  assert.equal(t.b.data.length, 7);
});

test("offline: reset is refused with a clear message", async function () {
  var t = await twoPhones();
  t.a.goOffline();
  await assert.rejects(t.a.store.reset(), { code: "offline" });
});

// ---------- Reset ----------

test("reset clears everything and reseeds, on every phone", async function () {
  var t = await twoPhones();
  await t.a.store.add({ type: "h2b", headCount: 2, note: "" });
  await t.a.store.take("seed-3", 3, "Driver A");
  await wait(10);
  assert.equal(t.b.data.length, 7);
  await t.b.store.reset();
  await wait(10);
  assert.equal(t.a.data.length, 6);
  assert.equal(t.a.left(), 6);
  assert.deepEqual(t.a.data.map(function (r) { return r.id; }).sort(),
    ["seed-1", "seed-2", "seed-3", "seed-4", "seed-5", "seed-6"]);
});

// ---------- Local mode ----------

test("local mode: seeds, adds, takes and resets in this browser only", async function () {
  var data = [];
  var s = Local.createLocalStore({ storage: memoryStorage() });
  var status;
  s.start({ onData: function (l) { data = l; }, onStatus: function (x) { status = x; } });
  assert.equal(status.mode, "local");
  assert.equal(L.gameTotals(data, EV).left, 6);
  var res = await s.take("seed-3", 5, "Driver B");
  assert.equal(res.n, 3);
  assert.equal(L.gameTotals(data, EV).left, 3);
  await assert.rejects(s.take("seed-3", 1, "Driver B"), { code: "done" });
  await s.add({ type: "h2b", headCount: 2 });
  assert.equal(data.length, 7);
  await s.reset();
  assert.equal(data.length, 6);
  assert.equal(L.gameTotals(data, EV).left, 6);
});
