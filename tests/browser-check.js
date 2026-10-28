/*
 * Browser check: runs the real app as two phones side by side.
 * Needs Playwright (a developer tool), so it is optional:
 *   node tests/browser-check.js [folder-for-screenshots]
 *
 * The Firebase files from Google's CDN are swapped for the fake Firestore in
 * fake-firestore.js, shared by both phones. Nothing goes over the network.
 */
"use strict";
var fs = require("fs");
var path = require("path");
var assert = require("assert/strict");
var { chromium } = require("playwright");

var ROOT = path.join(__dirname, "..");
var SHOTS = process.argv[2] || null;
var ORIGIN = "http://farmington.test";
var SDK = "https://www.gstatic.com/firebasejs/12.19.0/";

var FAKE_CONFIG = 'window.FARMINGTON_FIREBASE_CONFIG = { apiKey: "test-key", authDomain: "test.firebaseapp.com",' +
  ' projectId: "test", storageBucket: "test.appspot.com", messagingSenderId: "1", appId: "1:1:web:1" };';

// The fake SDK, shaped like the real firebase-firestore.js module.
var fakeSrc = fs.readFileSync(path.join(__dirname, "fake-firestore.js"), "utf8");
var FAKE_FIRESTORE_MODULE =
  "const FakeFirestore = (function () { var module; " + fakeSrc + "\n return this.FakeFirestore; }).call({});\n" +
  "const top = window.top;\n" +
  "const backend = top.__fakeBackend || (top.__fakeBackend = FakeFirestore.createBackend());\n" +
  "const c = backend.client();\n" +
  "window.__fakeClient = c;\n" +
  ["initializeFirestore", "persistentLocalCache", "persistentMultipleTabManager", "memoryLocalCache",
    "collection", "doc", "onSnapshot", "runTransaction", "writeBatch", "getDocs", "setDoc"]
    .map(function (n) { return "export const " + n + " = c." + n + ";"; }).join("\n");
var FAKE_APP_MODULE = "export function initializeApp(options) { return { options: options }; }";

var HARNESS = '<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;gap:12px;background:#888}' +
  'iframe{width:390px;height:1500px;border:0;background:#fff}</style>' +
  '<iframe id="a" src="index.html"></iframe><iframe id="b" src="index.html"></iframe>';

function serveRepo(useFakeFirebase, gstaticHits) {
  return async function (route) {
    var url = new URL(route.request().url());
    if (url.hostname === "www.gstatic.com") {
      gstaticHits.push(url.href);
      if (!useFakeFirebase) return route.abort();
      var body = url.href === SDK + "firebase-app.js" ? FAKE_APP_MODULE
        : url.href === SDK + "firebase-firestore.js" ? FAKE_FIRESTORE_MODULE : null;
      if (!body) return route.abort();
      return route.fulfill({ body: body, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } });
    }
    if (url.origin !== ORIGIN) return route.abort(); // the app must make no other network calls
    var file = url.pathname === "/" ? "/index.html" : url.pathname;
    if (file === "/harness.html") return route.fulfill({ body: HARNESS, contentType: "text/html" });
    if (useFakeFirebase && file === "/firebase-config.js") {
      return route.fulfill({ body: FAKE_CONFIG, contentType: "text/javascript" });
    }
    var full = path.join(ROOT, file);
    if (!fs.existsSync(full)) return route.fulfill({ status: 404, body: "" });
    var type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[path.extname(full)] || "text/plain";
    return route.fulfill({ body: fs.readFileSync(full), contentType: type });
  };
}

async function textOf(frame, sel) { return (await frame.textContent(sel)).trim(); }

async function waitText(frame, sel, expected, ms) {
  var start = Date.now();
  while (Date.now() - start < (ms || 5000)) {
    if ((await textOf(frame, sel)).indexOf(expected) >= 0) return Date.now() - start;
    await new Promise(function (r) { setTimeout(r, 20); });
  }
  throw new Error(sel + ' never showed "' + expected + '", last: "' + (await textOf(frame, sel)) + '"');
}

async function syncedTwoPhones(browser) {
  var hits = [];
  var page = await browser.newPage({ viewport: { width: 800, height: 1500 } });
  var errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });
  page.on("console", function (m) { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/*", serveRepo(true, hits));
  await page.goto(ORIGIN + "/harness.html");
  await page.waitForFunction(function () { return document.querySelectorAll("iframe").length === 2; });
  var frames = page.frames().filter(function (f) { return f !== page.mainFrame(); });
  var A = frames[0];
  var B = frames[1];
  await waitText(A, "#sync-status", "Live sync on");
  await waitText(B, "#sync-status", "Live sync on");

  // Both phones: Driver view, Game list. Phone B is Driver B.
  for (var f of [A, B]) {
    await f.click("[data-view='driver']");
    await f.click(".driver-toggle [data-list='game']");
  }
  await B.selectOption("#driver-id", "Driver B");
  await waitText(A, "#left-total", "6");
  await waitText(B, "#left-total", "6");
  console.log("ok  both phones start with 6 left to pick up");

  // 1. Driver A logs 3 picked up -> B's number drops.
  await A.click("[data-id='seed-3'] [data-action='take']");
  var ms = await waitText(B, "#left-total", "3");
  console.log("ok  Driver A picked up 3; Driver B's screen showed 3 left after " + ms + " ms");
  await waitText(B, "#done-list", "Driver A took 3, just now");
  console.log("ok  Driver B sees the log line 'Driver A took 3, just now'");

  // 2. Both drivers tap "Picked up" on the last 3 at the same moment.
  await page.evaluate(function () {
    var btns = Array.prototype.map.call(document.querySelectorAll("iframe"), function (fr) {
      return fr.contentDocument.querySelector("[data-id='seed-2'] [data-action='take']");
    });
    btns.forEach(function (b) { b.click(); });
  });
  await waitText(A, "#left-total", "0");
  await waitText(B, "#left-total", "0");
  await new Promise(function (r) { setTimeout(r, 200); });
  var toasts = [await textOf(A, "#toast"), await textOf(B, "#toast")].sort();
  assert.ok(toasts.some(function (t) { return /^3 logged/.test(t); }), "one phone logs 3: " + toasts);
  assert.ok(toasts.some(function (t) { return /Nobody is left/.test(t); }), "the other is told nobody is left: " + toasts);
  var picked = await textOf(A, "#pick-total");
  assert.equal(picked, "8"); // 2 already in the sample + 3 + 3
  console.log("ok  simultaneous taps: one phone logged 3, the other got 'Nobody is left'. Picked up = " + picked);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "two-phones-synced.png") });

  // 3. Phone B loses signal.
  await B.evaluate(function () {
    Object.defineProperty(navigator, "onLine", { get: function () { return false; }, configurable: true });
    window.__fakeClient.setOnline(false);
    window.dispatchEvent(new Event("offline"));
  });
  await waitText(B, "#sync-status", "Offline, will sync", 4000);
  console.log("ok  phone B shows 'Offline, will sync'");

  // Phone A (a member) sends a new game request while B is offline.
  await A.click("[data-view='request']");
  await A.click("#view-request [data-type='game']");
  await A.check("#form-game input[value='pickup']", { force: true });
  await A.click("#form-game button[type='submit']");
  assert.equal(await A.isHidden("#open-list"), true, "the request page shows no list");
  await A.click("[data-view='driver']");
  await waitText(A, "#left-total", "6");
  assert.equal(await textOf(B, "#left-total"), "0", "offline phone has not received it yet");

  // Offline phone B logs 2 picked up on an H2B request. The tap waits on the phone.
  await B.click(".driver-toggle [data-list='h2b']");
  await B.click("[data-id='seed-6'] [data-stepper] [data-step='-1']"); // 3 -> 2
  await B.click("[data-id='seed-6'] [data-action='take']");
  await waitText(B, "#sync-status", "1 waiting");
  console.log("ok  offline tap saved on phone B ('1 waiting')");

  // Back online: B receives A's request and sends its waiting tap.
  await B.evaluate(function () {
    Object.defineProperty(navigator, "onLine", { get: function () { return true; }, configurable: true });
    window.__fakeClient.setOnline(true);
    window.dispatchEvent(new Event("online"));
  });
  await waitText(B, "#sync-status", "Live sync on");
  await A.click(".driver-toggle [data-list='h2b']");
  await waitText(A, "[data-id='seed-6']", "1 of 3 still to go");
  await waitText(A, "[data-id='seed-6']", "Driver B took 2");
  await B.click(".driver-toggle [data-list='game']");
  await waitText(B, "#left-total", "6");
  console.log("ok  back online: phone B synced its tap and got phone A's new request");

  // 4. Two-tap reset on phone A resets both phones.
  await A.click("#reset-btn");
  await waitText(A, "#reset-btn", "Tap again to reset");
  await A.click("#reset-btn");
  await A.click(".driver-toggle [data-list='game']");
  await waitText(A, "#left-total", "6");
  await waitText(B, "#pick-total", "2");
  var count = await page.evaluate(function () {
    return Object.keys(window.__fakeBackend.docs).length;
  });
  assert.equal(count, 6);
  console.log("ok  two-tap reset cleared the collection and reseeded it (6 documents) on both phones");

  assert.deepEqual(errors, [], "no errors in the browser console");
  await page.close();
}

async function localMode(browser) {
  var hits = [];
  var page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  var errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });
  await page.route("**/*", serveRepo(false, hits));
  await page.goto(ORIGIN + "/index.html");
  await waitText(page, "#sync-status", "Local demo mode, not synced");
  await page.click("[data-view='driver']");
  await page.click(".driver-toggle [data-list='game']");
  await waitText(page, "#left-total", "6");
  await page.click("[data-id='seed-3'] [data-action='take']");
  await waitText(page, "#left-total", "3");
  var width = await page.evaluate(function () { return document.documentElement.scrollWidth; });
  assert.equal(width, 390, "no sideways scrolling on a phone");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "local-mode.png"), fullPage: true });
  assert.deepEqual(hits, [], "local mode never contacts Firebase");
  assert.deepEqual(errors, []);
  console.log("ok  placeholder config: 'Local demo mode, not synced', works, no Firebase requests");
  await page.close();
}

(async function () {
  var browser = await chromium.launch();
  try {
    await localMode(browser);
    await syncedTwoPhones(browser);
    console.log("All browser checks passed.");
  } finally {
    await browser.close();
  }
})().catch(function (e) { console.error("FAILED:", e.message); process.exit(1); });
