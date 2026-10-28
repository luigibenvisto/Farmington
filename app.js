(function () {
  "use strict";

  // All data below is invented for the demo.
  var STORAGE_KEY = "farmingtonAppDemo.v2";
  var EVENTS = ["Fall Classic", "Homecoming Game", "Night Game 7"];
  var MIN = 60000;

  var state;
  var els = {};
  var resetTimer;

  // ---------- State ----------

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function seedData() {
    var now = Date.now();
    var ago = function (m) { return now - m * MIN; };
    var ev = EVENTS[0];
    var req = function (o) { o.id = uid(); o.log = o.log || []; o.taken = o.taken || 0; return o; };
    return {
      view: "request",
      reqType: "h2b",
      driverList: "h2b",
      currentEvent: ev,
      driver: "Driver A",
      requests: [
        req({ type: "game", event: ev, direction: "dropoff", headCount: 12, taken: 12, createdAt: ago(95),
          log: [{ driver: "Driver A", n: 12, at: ago(80) }] }),
        req({ type: "game", event: ev, direction: "pickup", headCount: 5, taken: 2, createdAt: ago(20),
          log: [{ driver: "Driver B", n: 2, at: ago(6) }] }),
        req({ type: "game", event: ev, direction: "pickup", headCount: 3, createdAt: ago(10) }),
        req({ type: "h2b", headCount: 6, taken: 6, note: "Early shift crew", createdAt: ago(70),
          log: [{ driver: "Driver B", n: 6, at: ago(60) }] }),
        req({ type: "h2b", headCount: 4, taken: 1, note: "", createdAt: ago(12),
          log: [{ driver: "Driver A", n: 1, at: ago(3) }] }),
        req({ type: "h2b", headCount: 3, note: "Two bag carts", createdAt: ago(2) })
      ]
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.requests)) return parsed;
      }
    } catch (e) { /* storage blocked or corrupt: fall back to seed */ }
    return seedData();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
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
  function remaining(r) { return Math.max(0, r.headCount - r.taken); }
  function isDone(r) { return remaining(r) === 0; }

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
    toast.t = setTimeout(function () { els.toast.classList.remove("show"); }, 2600);
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

  function find(id) {
    for (var i = 0; i < state.requests.length; i++) if (state.requests[i].id === id) return state.requests[i];
    return null;
  }

  // ---------- Rendering ----------

  function renderView() {
    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.view === state.view ? "true" : "false");
    });
    els.viewRequest.hidden = state.view !== "request";
    els.viewDriver.hidden = state.view !== "driver";

    document.querySelectorAll("#view-request .type-toggle button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.type === state.reqType ? "true" : "false");
    });
    els.formH2b.hidden = state.reqType !== "h2b";
    els.formGame.hidden = state.reqType !== "game";
    els.sent.hidden = true;

    document.querySelectorAll(".driver-toggle button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.list === state.driverList ? "true" : "false");
    });
  }

  function itemHTML(r) {
    var left = remaining(r);
    var html = '<li class="item ' + (r.taken ? "active" : "waiting") + '" data-id="' + r.id + '">' +
      '<div class="item-top"><div>' +
      '<div class="item-title"><span class="count-pill">' + left + '</span>' + esc(title(r)) + '</div>' +
      '<div class="item-meta">' + esc(meta(r)) + '</div>' +
      '</div><span class="badge ' + (r.taken ? "active" : "waiting") + '">' +
      (r.taken ? "Partly done" : "Waiting") + '</span></div>';
    html += '<div class="item-meta left-chip">' + left + " of " + r.headCount + " still to go</div>";
    if (r.note) html += '<div class="item-note">' + esc(r.note) + '</div>';
    var last = r.log[r.log.length - 1];
    if (last) html += '<div class="item-log">' + esc(last.driver) + " took " + last.n + ", " + ago(last.at) + "</div>";
    var verb = r.type === "game" && r.direction === "dropoff" ? "Dropped off" : "Picked up";
    html += '<div class="pick-row"><div class="stepper" data-stepper>' +
      '<button type="button" data-step="-1" aria-label="One fewer">−</button>' +
      '<input type="number" inputmode="numeric" min="1" max="' + left + '" value="' + left + '" aria-label="People just taken">' +
      '<button type="button" data-step="1" aria-label="One more">+</button></div>' +
      '<button type="button" class="btn btn-start" data-action="take">' + verb + '</button></div>';
    return html + "</li>";
  }

  function listRequests() {
    return state.requests.filter(function (r) {
      if (r.type !== state.driverList) return false;
      return r.type !== "game" || r.event === state.currentEvent;
    });
  }

  function renderDriver() {
    els.driverId.value = state.driver;
    var isGame = state.driverList === "game";
    els.gamePanel.hidden = !isGame;
    els.listTitle.textContent = isGame ? "Open game requests" : "Open H2B requests";

    var all = listRequests();
    var open = all.filter(function (r) { return !isDone(r); })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });
    var done = all.filter(isDone).sort(function (a, b) { return b.createdAt - a.createdAt; });

    els.listCount.textContent = open.length + " open";
    els.openList.innerHTML = open.length
      ? open.map(itemHTML).join("")
      : '<li class="empty">Nothing waiting. Nice work.</li>';

    els.doneSummary.textContent = done.length;
    els.doneList.innerHTML = done.length ? done.map(function (r) {
      return '<li class="item done"><div class="item-title"><span class="count-pill">' + r.headCount + '</span>' +
        esc(title(r)) + '</div><div class="item-meta">' + esc(meta(r)) + '</div></li>';
    }).join("") : '<li class="empty">None yet.</li>';

    if (isGame) renderGame();
  }

  // One shared number for every driver: it only goes down when someone logs people.
  function renderGame() {
    fillSelect(els.currentEvent, EVENTS, state.currentEvent);
    var drop = 0, pick = 0, left = 0;
    state.requests.forEach(function (r) {
      if (r.type !== "game" || r.event !== state.currentEvent) return;
      if (r.direction === "dropoff") drop += r.taken;
      else { pick += r.taken; left += remaining(r); }
    });
    els.dropTotal.textContent = drop;
    els.pickTotal.textContent = pick;
    els.leftTotal.textContent = left;
  }

  function render() {
    renderView();
    renderDriver();
  }

  // ---------- Actions ----------

  function addRequest(r) {
    r.id = uid();
    r.taken = 0;
    r.log = [];
    r.createdAt = Date.now();
    state.requests.push(r);
    save();
    renderDriver();
    els.sent.textContent = "Sent to the " + (r.type === "h2b" ? "H2B" : "Game") + " list: " + people(r.headCount) + ". Drivers can see it now.";
    els.sent.hidden = false;
    toast("Sent to drivers");
  }

  function take(id, n) {
    var r = find(id);
    if (!r || isDone(r)) return;
    n = Math.min(n, remaining(r));
    if (n < 1) return;
    r.taken += n;
    r.log.push({ driver: state.driver, n: n, at: Date.now() });
    save();
    renderDriver();
    toast(n + " logged. " + remaining(r) + " left on this request.");
  }

  // ---------- Wiring ----------

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
      toast: $("#toast")
    };

    state = load();
    fillSelect(els.formGame.elements.event, EVENTS, state.currentEvent);

    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.dataset.view; save(); renderView(); renderDriver(); window.scrollTo(0, 0);
      });
    });

    document.querySelectorAll("#view-request .type-toggle button").forEach(function (b) {
      b.addEventListener("click", function () { state.reqType = b.dataset.type; save(); renderView(); });
    });

    document.querySelectorAll(".driver-toggle button").forEach(function (b) {
      b.addEventListener("click", function () { state.driverList = b.dataset.list; save(); renderView(); renderDriver(); });
    });

    // Steppers, including the ones created inside the driver list.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-stepper] button[data-step]");
      if (!btn) return;
      var input = $("input", btn.closest("[data-stepper]"));
      input.value = (parseInt(input.value, 10) || 0) + Number(btn.dataset.step);
      clampInput(input);
    });
    document.addEventListener("change", function (e) {
      if (e.target.matches("[data-stepper] input")) clampInput(e.target);
    });

    els.formH2b.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = els.formH2b.elements;
      addRequest({ type: "h2b", headCount: clampInput(f.headCount), note: f.note.value.trim().slice(0, 80) });
      f.note.value = "";
    });

    els.formGame.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = els.formGame.elements;
      addRequest({ type: "game", event: f.event.value, direction: f.direction.value, headCount: clampInput(f.headCount) });
    });

    els.openList.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action='take']");
      if (!btn) return;
      var li = btn.closest("[data-id]");
      take(li.dataset.id, parseInt($("input", li).value, 10) || 0);
    });

    els.driverId.addEventListener("change", function () { state.driver = els.driverId.value; save(); });

    els.currentEvent.addEventListener("change", function () {
      state.currentEvent = els.currentEvent.value; save(); renderDriver();
    });

    var resetBtn = $("#reset-btn");
    resetBtn.addEventListener("click", function () {
      if (resetBtn.dataset.armed !== "1") {
        resetBtn.dataset.armed = "1";
        resetBtn.textContent = "Tap again to reset";
        resetTimer = setTimeout(function () { resetBtn.dataset.armed = ""; resetBtn.textContent = "Reset demo"; }, 4000);
        return;
      }
      clearTimeout(resetTimer);
      resetBtn.dataset.armed = "";
      resetBtn.textContent = "Reset demo";
      var view = state.view;
      state = seedData();
      state.view = view;
      save();
      fillSelect(els.formGame.elements.event, EVENTS, state.currentEvent);
      render();
      window.scrollTo(0, 0);
      toast("Demo reset to sample data");
    });

    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
