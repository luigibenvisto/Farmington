/*
 * Farmington App - screens.
 *
 * This file only draws the screens and reacts to taps. The data lives in a
 * "store": either the synced Firebase store (store-firebase.js) or the local
 * store (store-local.js) when firebase-config.js still has placeholders.
 * Whenever the store says the data changed, we redraw.
 *
 * All data is invented for the demo. Head counts only, never names.
 */
(function () {
  "use strict";

  var L = window.FarmLogic;
  var EVENTS = L.EVENTS;
  var MIN = 60000;
  var SETTINGS_KEY = "farmingtonApp.settings.v3";

  // Per-phone choices (which screen, which driver). Not shared between phones.
  var settings = loadSettings();
  // The shared request list, as last sent by the store.
  var requests = [];
  // Numbers a driver has dialled on each request's counter, kept across redraws.
  var counters = {};
  var store = null;
  var els = {};
  var resetTimer, offlineTimer;

  // ---------- Per-phone settings ----------

  function loadSettings() {
    var s = { view: "request", reqType: "h2b", driverList: "h2b", currentEvent: EVENTS[0], driver: "Driver A" };
    try { Object.assign(s, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch (e) { /* defaults */ }
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  // ---------- Helpers ----------

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function clockTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function ago(ts) {
    var m = Math.round((Date.now() - ts) / MIN);
    return m < 1 ? "just now" : m + " min ago";
  }

  function people(n) { return n + (n === 1 ? " person" : " people"); }

  function title(r) {
    if (r.type === "h2b") return "H2B ride";
    return r.direction === "dropoff" ? "To the stadium" : "Back after game";
  }

  function meta(r) {
    var parts = [];
    if (r.type === "game") parts.push(r.event);
    parts.push("Requested " + clockTime(r.createdAt));
    return parts.join(" · ");
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { els.toast.classList.remove("show"); }, 3000);
  }

  function fillSelect(select, values, selected) {
    select.innerHTML = values.map(function (v) {
      return "<option" + (v === selected ? " selected" : "") + ">" + esc(v) + "</option>";
    }).join("");
  }

  function clampInput(input) {
    var min = Number(input.min), max = Number(input.max);
    var v = parseInt(input.value, 10);
    if (isNaN(v)) v = min;
    input.value = Math.min(max, Math.max(min, v));
    return Number(input.value);
  }

  // ---------- Status label (Local / Live / Offline) ----------

  function showStatus(s) {
    var label = els.syncStatus;
    clearTimeout(offlineTimer);
    if (s.mode === "local") {
      label.className = "sync-status local";
      label.textContent = "Local demo mode, not synced";
    } else if (s.mode === "problem") {
      label.className = "sync-status broken";
      label.textContent = "Sync problem, not saving";
    } else if (s.mode === "broken") {
      label.className = "sync-status broken";
      label.textContent = "Not connected. Reload when online";
    } else if (s.offline || s.pending) {
      // Wait a moment before saying "Offline", so a normal start-up doesn't flash it.
      var text = "Offline, will sync" + (s.pending ? " (" + s.pending + " waiting)" : "");
      var show = function () { label.className = "sync-status offline"; label.textContent = text; };
      if (s.pending || label.classList.contains("offline")) show();
      else offlineTimer = setTimeout(show, 2000);
    } else {
      label.className = "sync-status live";
      label.textContent = "Live sync on";
    }
  }

  // ---------- Drawing ----------

  function renderView() {
    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.view === settings.view ? "true" : "false");
    });
    els.viewRequest.hidden = settings.view !== "request";
    els.viewDriver.hidden = settings.view !== "driver";

    document.querySelectorAll("#view-request .type-toggle button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.type === settings.reqType ? "true" : "false");
    });
    els.formH2b.hidden = settings.reqType !== "h2b";
    els.formGame.hidden = settings.reqType !== "game";
    els.sent.hidden = true;

    document.querySelectorAll(".driver-toggle button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.list === settings.driverList ? "true" : "false");
    });
  }

  function logHTML(r) {
    var log = (r.log || []).slice().reverse(); // newest first
    if (!log.length) return "";
    var shown = log.slice(0, 4).map(function (e) {
      return "<li>" + esc(e.driver) + " took " + e.n + ", " + ago(e.at) + "</li>";
    }).join("");
    var more = log.length > 4 ? "<li>and " + (log.length - 4) + " earlier</li>" : "";
    return '<ul class="item-log">' + shown + more + "</ul>";
  }

  function itemHTML(r) {
    var left = L.remaining(r);
    var value = Math.min(counters[r.id] || left, left);
    var status = r.taken ? "active" : "waiting";
    var html = '<li class="item ' + status + '" data-id="' + esc(r.id) + '">' +
      '<div class="item-top"><div>' +
      '<div class="item-title"><span class="count-pill">' + left + '</span>' + esc(title(r)) + '</div>' +
      '<div class="item-meta">' + esc(meta(r)) + '</div>' +
      '</div><span class="badge ' + status + '">' + (r.taken ? "Partly done" : "Waiting") + '</span></div>';
    html += '<div class="item-meta left-chip">' + left + " of " + r.headCount + " still to go</div>";
    if (r.note) html += '<div class="item-note">' + esc(r.note) + '</div>';
    html += logHTML(r);
    var verb = r.type === "game" && r.direction === "dropoff" ? "Dropped off" : "Picked up";
    html += '<div class="pick-row"><div class="stepper" data-stepper>' +
      '<button type="button" data-step="-1" aria-label="One fewer">−</button>' +
      '<input type="number" inputmode="numeric" min="1" max="' + left + '" value="' + value + '" aria-label="People just taken">' +
      '<button type="button" data-step="1" aria-label="One more">+</button></div>' +
      '<button type="button" class="btn btn-start" data-action="take">' + verb + '</button></div>';
    return html + "</li>";
  }

  function listRequests() {
    return requests.filter(function (r) {
      if (r.type !== settings.driverList) return false;
      return r.type !== "game" || r.event === settings.currentEvent;
    });
  }

  function renderDriver() {
    els.driverId.value = settings.driver;
    var isGame = settings.driverList === "game";
    els.gamePanel.hidden = !isGame;
    els.listTitle.textContent = isGame ? "Open game requests" : "Open H2B requests";

    var all = listRequests();
    var open = all.filter(function (r) { return !L.isDone(r); })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
    var done = all.filter(L.isDone).sort(function (a, b) { return b.createdAt - a.createdAt; });

    // Don't redraw the list while a "Saving..." button is showing; it redraws when the save ends.
    var busy = els.openList.querySelector("button[data-action='take'][disabled]");
    if (!busy) {
      els.listCount.textContent = open.length + " open";
      els.openList.innerHTML = store && store.mode === "broken"
        ? '<li class="empty">Could not connect to live sync. Check the connection and reload.</li>'
        : open.length ? open.map(itemHTML).join("") : '<li class="empty">Nothing waiting. Nice work.</li>';
    }

    els.doneSummary.textContent = done.length;
    els.doneList.innerHTML = done.length ? done.map(function (r) {
      return '<li class="item done"><div class="item-title"><span class="count-pill">' + r.headCount + '</span>' +
        esc(title(r)) + '</div><div class="item-meta">' + esc(meta(r)) + '</div>' + logHTML(r) + '</li>';
    }).join("") : '<li class="empty">None yet.</li>';

    // The headcount panel is always kept current, even while a save is running.
    if (isGame) renderGame();
  }

  // One shared number for every driver, worked out from the shared requests.
  function renderGame() {
    fillSelect(els.currentEvent, EVENTS, settings.currentEvent);
    var t = L.gameTotals(requests, settings.currentEvent);
    els.dropTotal.textContent = t.drop;
    els.pickTotal.textContent = t.pick;
    els.leftTotal.textContent = t.left;
  }

  function render() {
    renderView();
    renderDriver();
  }

  // ---------- Actions ----------

  function addRequest(input) {
    store.add(input).then(function (r) {
      els.sent.textContent = "Sent to the " + (r.type === "h2b" ? "H2B" : "Game") + " list: " +
        people(r.headCount) + ". Drivers can see it now.";
      els.sent.hidden = false;
      toast("Sent to drivers");
    }, function (e) { toast(e.message); });
  }

  function take(li, btn) {
    var id = li.dataset.id;
    var n = parseInt($("input", li).value, 10) || 0;
    if (n < 1) return;
    btn.disabled = true;
    btn.textContent = "Saving...";
    store.take(id, n, settings.driver).then(function (res) {
      delete counters[id];
      if (res.queued) toast("No signal. " + n + " saved on this phone, will sync when back online.");
      else if (res.n < res.wanted) toast("Only " + res.n + " were left. Logged " + res.n + ".");
      else toast(res.n + " logged. " + res.left + " left on this request.");
    }, function (e) {
      toast(e.message);
    }).then(function () {
      btn.disabled = false;
      renderDriver();
    });
  }

  // Two-tap reset: the first tap arms the button, a second tap within 4 seconds resets.
  function onReset() {
    var btn = els.resetBtn;
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap again to reset";
      resetTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    btn.disabled = true;
    store.reset().then(function () {
      counters = {};
      window.scrollTo(0, 0);
      toast(store.mode === "sync" ? "Demo reset for every phone" : "Demo reset to sample data");
    }, function (e) { toast(e.message); }).then(function () { btn.disabled = false; });
  }

  function disarm() {
    clearTimeout(resetTimer);
    els.resetBtn.dataset.armed = "";
    els.resetBtn.textContent = "Reset demo";
  }

  // ---------- Picking the store ----------

  function browserHooks() {
    return {
      storage: window.localStorage,
      isOnline: function () { return navigator.onLine !== false; },
      onOnline: function (fn) { window.addEventListener("online", fn); },
      onOffline: function (fn) { window.addEventListener("offline", fn); }
    };
  }

  // A stand-in used only if Firebase is set up but could not be loaded.
  function brokenStore() {
    var no = function () { return Promise.reject(new Error("Not connected. Reload when online.")); };
    return {
      mode: "broken",
      start: function (h) { h.onStatus({ mode: "broken" }); h.onData([]); },
      add: no, take: no, reset: no
    };
  }

  function chooseStore() {
    var FB = window.FarmFirebaseStore;
    var cfg = window.FARMINGTON_FIREBASE_CONFIG;
    if (!FB.isConfigured(cfg)) {
      return Promise.resolve(window.FarmLocalStore.createLocalStore({ storage: window.localStorage, window: window }));
    }
    return Promise.all([
      import(FB.SDK_BASE + "firebase-app.js"),
      import(FB.SDK_BASE + "firebase-firestore.js")
    ]).then(function (sdk) {
      var db = FB.connect(cfg, sdk[0], sdk[1]);
      return FB.createFirebaseStore(sdk[1], db, browserHooks());
    }).catch(function (e) {
      console.error("Firebase failed to load", e);
      return brokenStore();
    });
  }

  // ---------- Wiring ----------

  // Remember a driver's counter value so a live update doesn't undo it.
  function rememberCounter(input, value) {
    var li = input.closest("#open-list [data-id]");
    if (li) counters[li.dataset.id] = value;
  }

  function init() {
    els = {
      viewRequest: $("#view-request"),
      viewDriver: $("#view-driver"),
      formH2b: $("#form-h2b"),
      formGame: $("#form-game"),
      sent: $("#sent-note"),
      gamePanel: $("#game-panel"),
      listTitle: $("#list-title"),
      listCount: $("#list-count"),
      openList: $("#open-list"),
      doneList: $("#done-list"),
      doneSummary: $("#done-summary"),
      driverId: $("#driver-id"),
      currentEvent: $("#current-event"),
      leftTotal: $("#left-total"),
      dropTotal: $("#drop-total"),
      pickTotal: $("#pick-total"),
      syncStatus: $("#sync-status"),
      resetBtn: $("#reset-btn"),
      toast: $("#toast")
    };

    fillSelect(els.formGame.elements.event, EVENTS, settings.currentEvent);

    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.view = b.dataset.view; saveSettings(); renderView(); renderDriver(); window.scrollTo(0, 0);
      });
    });

    document.querySelectorAll("#view-request .type-toggle button").forEach(function (b) {
      b.addEventListener("click", function () { settings.reqType = b.dataset.type; saveSettings(); renderView(); });
    });

    document.querySelectorAll(".driver-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.driverList = b.dataset.list; saveSettings(); renderView(); renderDriver();
      });
    });

    // Steppers, including the ones inside the driver list.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-stepper] button[data-step]");
      if (!btn) return;
      var input = $("input", btn.closest("[data-stepper]"));
      input.value = (parseInt(input.value, 10) || 0) + Number(btn.dataset.step);
      rememberCounter(input, clampInput(input));
    });
    document.addEventListener("change", function (e) {
      if (e.target.matches("[data-stepper] input")) rememberCounter(e.target, clampInput(e.target));
    });

    els.formH2b.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!store) return;
      var f = els.formH2b.elements;
      addRequest({ type: "h2b", headCount: clampInput(f.headCount), note: f.note.value });
      f.note.value = "";
    });

    els.formGame.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!store) return;
      var f = els.formGame.elements;
      addRequest({ type: "game", event: f.event.value, direction: f.direction.value, headCount: clampInput(f.headCount) });
    });

    els.openList.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action='take']");
      if (btn && store) take(btn.closest("[data-id]"), btn);
    });

    els.driverId.addEventListener("change", function () { settings.driver = els.driverId.value; saveSettings(); });

    els.currentEvent.addEventListener("change", function () {
      settings.currentEvent = els.currentEvent.value; saveSettings(); renderDriver();
    });

    els.resetBtn.addEventListener("click", function () { if (store) onReset(); });

    render();

    chooseStore().then(function (s) {
      store = s;
      store.start({
        onData: function (list) { requests = list; renderDriver(); },
        onStatus: showStatus,
        onNotice: toast,
        onError: function (e) {
          // For example the demo rules have expired, or Firebase refused access.
          console.error(e);
          showStatus({ mode: "problem" });
          toast("Sync problem: " + e.message);
        }
      });
    });

    // Keep "2 min ago" up to date.
    setInterval(renderDriver, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
