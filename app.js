(function () {
  "use strict";

  // All data below is invented for the demo.
  var STORAGE_KEY = "rideBoardDemo.v1";
  var PICKUPS = ["Gate 3", "Lot B", "Staff Housing C", "Maintenance Yard", "Clubhouse Dock", "Range Shed", "North Lot"];
  var EVENTS = ["Fall Classic", "Homecoming Game", "Night Game 7"];
  var VEHICLES = ["Van 1", "Van 2"];
  var MIN = 60000;

  var state;
  var els = {};

  // ---------- State ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function seedData() {
    var now = Date.now();
    var ago = function (m) { return now - m * MIN; };
    var ev = EVENTS[0];
    return {
      view: "request",
      reqType: "h2b",
      currentEvent: ev,
      driver: "Driver A",
      requests: [
        { id: uid(), type: "stadium", event: ev, direction: "dropoff", vehicle: "Van 1", headCount: 12, eta: 10,
          status: "done", createdAt: ago(95), startedAt: ago(90), completedAt: ago(78), driver: "Driver A" },
        { id: uid(), type: "stadium", event: ev, direction: "dropoff", vehicle: "Van 2", headCount: 9, eta: 15,
          status: "done", createdAt: ago(92), startedAt: ago(85), completedAt: ago(71), driver: "Driver B" },
        { id: uid(), type: "h2b", pickup: "Staff Housing C", headCount: 6, note: "Early shift crew",
          status: "done", createdAt: ago(70), startedAt: ago(66), completedAt: ago(57), driver: "Driver C" },
        { id: uid(), type: "stadium", event: ev, direction: "pickup", vehicle: "Van 1", headCount: 8, eta: 5,
          status: "done", createdAt: ago(30), startedAt: ago(26), completedAt: ago(14), driver: "Driver A" },
        { id: uid(), type: "stadium", event: ev, direction: "pickup", vehicle: "Van 2", headCount: 7, eta: 12,
          status: "active", createdAt: ago(9), startedAt: ago(6), driver: "Driver B" },
        { id: uid(), type: "h2b", pickup: "Gate 3", headCount: 4, note: "",
          status: "waiting", createdAt: ago(5) },
        { id: uid(), type: "stadium", event: ev, direction: "pickup", vehicle: "Van 1", headCount: 6, eta: 20,
          status: "waiting", createdAt: ago(3) },
        { id: uid(), type: "h2b", pickup: "Lot B", headCount: 3, note: "Two bag carts",
          status: "waiting", createdAt: ago(1) }
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

  function duration(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return (h ? h + ":" + pad(m) : m) + ":" + pad(sec);
  }

  function labeledDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + "h " : "") + m + "m " + (sec < 10 ? "0" : "") + sec + "s";
  }

  function shortDuration(ms) {
    var m = Math.round(ms / MIN);
    if (m < 1) return "< 1 min";
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h " + (m % 60) + " min";
  }

  function people(n) { return n + (n === 1 ? " person" : " people"); }

  function title(r) {
    if (r.type === "h2b") return "H2B ride from " + r.pickup;
    return (r.direction === "dropoff" ? "Drop off to stadium" : "Pickup after game") + " · " + r.vehicle;
  }

  function meta(r) {
    var parts = [];
    if (r.type === "stadium") parts.push(r.event, "ETA " + r.eta + " min");
    parts.push("Created " + clockTime(r.createdAt));
    if (r.driver && r.status !== "waiting") parts.push(r.driver);
    return parts.join(" · ");
  }

  var STATUS_LABEL = { waiting: "Waiting", active: "In progress", done: "Completed" };

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
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

  // ---------- Rendering ----------

  function renderView() {
    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      var on = b.dataset.view === state.view;
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.viewRequest.hidden = state.view !== "request";
    els.viewDriver.hidden = state.view !== "driver";

    document.querySelectorAll(".type-toggle button").forEach(function (b) {
      b.setAttribute("aria-checked", b.dataset.type === state.reqType ? "true" : "false");
    });
    els.formH2b.hidden = state.reqType !== "h2b";
    els.formStadium.hidden = state.reqType !== "stadium";
  }

  function itemHTML(r, opts) {
    var html = '<li class="item ' + r.status + '" data-id="' + r.id + '">' +
      '<div class="item-top"><div>' +
      '<div class="item-title"><span class="count-pill">' + r.headCount + '</span>' + esc(title(r)) + '</div>' +
      '<div class="item-meta">' + esc(meta(r)) + '</div>' +
      '</div><span class="badge ' + r.status + '">' + STATUS_LABEL[r.status] + '</span></div>';
    if (r.note) html += '<div class="item-note">' + esc(r.note) + '</div>';
    if (opts && opts.actions) {
      if (r.status === "active") {
        html += '<div class="timer" data-timer="' + r.startedAt + '">' + duration(Date.now() - r.startedAt) + '</div>' +
          '<div class="trip-actions"><button type="button" class="btn btn-complete btn-block" data-action="complete">Complete trip</button></div>';
      } else {
        html += '<div class="trip-actions"><button type="button" class="btn btn-start btn-block" data-action="start">Start trip</button></div>';
      }
    }
    return html + "</li>";
  }

  function renderBoard() {
    var list = state.requests.slice().sort(function (a, b) {
      var order = { active: 0, waiting: 1, done: 2 };
      return order[a.status] - order[b.status] || b.createdAt - a.createdAt;
    });
    var open = list.filter(function (r) { return r.status !== "done"; }).length;
    els.boardCount.textContent = open + " open · " + (list.length - open) + " done";
    els.boardList.innerHTML = list.length
      ? list.map(function (r) { return itemHTML(r); }).join("")
      : '<li class="empty">No requests yet.</li>';
  }

  function renderDriver() {
    els.driverId.value = state.driver;

    var open = state.requests.filter(function (r) { return r.status !== "done"; })
      .sort(function (a, b) {
        return (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.createdAt - b.createdAt;
      });
    els.openList.innerHTML = open.length
      ? open.map(function (r) { return itemHTML(r, { actions: true }); }).join("")
      : '<li class="empty">No open requests. Nice work.</li>';

    var done = state.requests.filter(function (r) { return r.status === "done"; })
      .sort(function (a, b) { return b.completedAt - a.completedAt; });
    var totalPeople = done.reduce(function (s, r) { return s + r.headCount; }, 0);
    els.doneSummary.textContent = done.length + " trips · " + people(totalPeople);
    els.doneList.innerHTML = done.length ? done.map(function (r) {
      return '<li class="item done"><div class="done-row"><div>' +
        '<div class="item-title"><span class="count-pill">' + r.headCount + '</span>' + esc(title(r)) + '</div>' +
        '<div class="item-meta">' + esc((r.type === "stadium" ? r.event + " · " : "") +
          "Done " + clockTime(r.completedAt) + (r.driver ? " · " + r.driver : "")) + '</div>' +
        '</div><div class="done-dur">' + duration(r.completedAt - r.startedAt) + '</div></div></li>';
    }).join("") : '<li class="empty">No completed trips yet.</li>';

    renderStadium();
  }

  function renderStadium() {
    fillSelect(els.currentEvent, EVENTS, state.currentEvent);
    var ev = state.currentEvent;
    var totals = { drop: 0, pick: 0 };
    var cards = VEHICLES.map(function (v) {
      var trips = state.requests.filter(function (r) {
        return r.type === "stadium" && r.event === ev && r.vehicle === v;
      });
      var drop = 0, pick = 0;
      trips.forEach(function (r) {
        if (r.status !== "done") return;
        if (r.direction === "dropoff") drop += r.headCount; else pick += r.headCount;
      });
      totals.drop += drop;
      totals.pick += pick;

      // Current ETA: the most recent open request for this van, counted down from when it was made.
      var next = trips.filter(function (r) { return r.status !== "done"; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; })[0];
      var etaHTML = '<span class="vehicle-eta none">No open trip</span>';
      if (next) {
        var remaining = Math.ceil((next.createdAt + next.eta * MIN - Date.now()) / MIN);
        etaHTML = '<span class="vehicle-eta">' + (remaining > 0 ? "ETA " + remaining + " min" : "Due now") + "</span>";
      }

      return '<div class="vehicle"><h3>' + v + etaHTML + '</h3><dl>' +
        '<dt>Dropped off</dt><dd>' + drop + '</dd>' +
        '<dt>Picked up</dt><dd>' + pick + '</dd>' +
        '<dt>Left to pick up</dt><dd class="v-left">' + Math.max(0, drop - pick) + '</dd>' +
        '</dl></div>';
    });

    els.dropTotal.textContent = totals.drop;
    els.pickTotal.textContent = totals.pick;
    els.leftTotal.textContent = Math.max(0, totals.drop - totals.pick);
    els.vehicleGrid.innerHTML = cards.join("");
  }

  function render() {
    renderView();
    renderBoard();
    renderDriver();
  }

  // Live timers and ETA countdowns, updated without re-rendering the lists.
  function tick() {
    document.querySelectorAll("[data-timer]").forEach(function (el) {
      el.textContent = duration(Date.now() - Number(el.dataset.timer));
    });
    if (!els.viewDriver.hidden && new Date().getSeconds() === 0) renderStadium();
  }

  // ---------- Actions ----------

  function addRequest(r) {
    r.id = uid();
    r.status = "waiting";
    r.createdAt = Date.now();
    state.requests.push(r);
    save();
    render();
    toast("Added to board: " + people(r.headCount));
  }

  function startTrip(id) {
    var r = find(id);
    if (!r || r.status !== "waiting") return;
    r.status = "active";
    r.startedAt = Date.now();
    r.driver = state.driver;
    save();
    render();
    toast("Trip started");
  }

  function completeTrip(id) {
    var r = find(id);
    if (!r || r.status !== "active") return;
    r.status = "done";
    r.completedAt = Date.now();
    save();
    render();
    toast("Trip done: " + people(r.headCount) + " in " + shortDuration(r.completedAt - r.startedAt));
  }

  function find(id) {
    for (var i = 0; i < state.requests.length; i++) if (state.requests[i].id === id) return state.requests[i];
    return null;
  }

  // ---------- Wiring ----------

  function init() {
    els = {
      viewRequest: $("#view-request"),
      viewDriver: $("#view-driver"),
      formH2b: $("#form-h2b"),
      formStadium: $("#form-stadium"),
      boardList: $("#board-list"),
      boardCount: $("#board-count"),
      openList: $("#open-list"),
      doneList: $("#done-list"),
      doneSummary: $("#done-summary"),
      driverId: $("#driver-id"),
      currentEvent: $("#current-event"),
      leftTotal: $("#left-total"),
      dropTotal: $("#drop-total"),
      pickTotal: $("#pick-total"),
      vehicleGrid: $("#vehicle-grid"),
      toast: $("#toast")
    };

    state = load();

    fillSelect(els.formH2b.elements.pickup, PICKUPS, PICKUPS[0]);
    fillSelect(els.formStadium.elements.event, EVENTS, state.currentEvent);

    document.querySelectorAll(".view-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.view = b.dataset.view;
        save();
        renderView();
        if (state.view === "driver") renderStadium();
        window.scrollTo(0, 0);
      });
    });

    document.querySelectorAll(".type-toggle button").forEach(function (b) {
      b.addEventListener("click", function () {
        state.reqType = b.dataset.type;
        save();
        renderView();
      });
    });

    document.querySelectorAll("[data-stepper]").forEach(function (wrap) {
      var input = $("input", wrap);
      wrap.addEventListener("click", function (e) {
        var btn = e.target.closest("button[data-step]");
        if (!btn) return;
        input.value = (parseInt(input.value, 10) || 0) + Number(btn.dataset.step);
        clampInput(input);
      });
      input.addEventListener("change", function () { clampInput(input); });
    });

    els.formH2b.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = els.formH2b.elements;
      addRequest({
        type: "h2b",
        pickup: f.pickup.value,
        headCount: clampInput(f.headCount),
        note: f.note.value.trim().slice(0, 80)
      });
      f.note.value = "";
    });

    els.formStadium.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = els.formStadium.elements;
      addRequest({
        type: "stadium",
        event: f.event.value,
        direction: f.direction.value,
        vehicle: f.vehicle.value,
        headCount: clampInput(f.headCount),
        eta: clampInput(f.eta)
      });
    });

    els.openList.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-action]");
      if (!btn) return;
      var id = btn.closest("[data-id]").dataset.id;
      if (btn.dataset.action === "start") startTrip(id); else completeTrip(id);
    });

    els.driverId.addEventListener("change", function () {
      state.driver = els.driverId.value;
      save();
    });

    els.currentEvent.addEventListener("change", function () {
      state.currentEvent = els.currentEvent.value;
      save();
      renderStadium();
    });

    $("#reset-btn").addEventListener("click", function () {
      if (!confirm("Reset the demo? This clears your changes and restores the sample requests.")) return;
      var view = state.view;
      state = seedData();
      state.view = view;
      save();
      fillSelect(els.formStadium.elements.event, EVENTS, state.currentEvent);
      render();
      window.scrollTo(0, 0);
      toast("Demo reset to sample data");
    });

    render();
    setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
