const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
let D = null;
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function api(url, method = "GET", body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { location.href = "/login"; return new Promise(() => {}); }   // session ended
  return res.json();
}

async function load() {
  D = await api("/api/data");
  const s = D.settings;
  fillPresets();
  if (!$("day").value) $("day").value = localDay();
  $("kg").value = s.kg; $("bike").value = s.bike_kg; $("load").value = s.load_kg;
  Object.entries({ s_kg: s.kg, s_h: s.height_cm, s_bike: s.bike_kg, s_load: s.load_kg, s_age: s.age,
    s_sex: s.sex, s_goalkg: s.goal_kg, s_cost: s.cost_km, s_goal: s.goal_min }).forEach(([k, v]) => ($(k).value = v));
  render();
  setSummaries();
  drawRideMap();
}

/* ---------- Leaflet: pin picker ---------- */
const hasMap = typeof L !== "undefined";
let rideBounds = null, pm, rm, rideLayer, routeLine = null, routeGeom = null, pins = { s: null, e: null };
const dot = (c, t) => L.divIcon({ className: "", html: `<div class="pin" style="background:${c}">${t}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
const tiles = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors", referrerPolicy: "strict-origin-when-cross-origin" });

function initMaps() {
  if (!hasMap) { $("routeInfo").textContent = "Map library could not load (check internet). You can still type distance manually."; return; }
  pm = L.map("pickMap").setView([8.515, 124.69], 11); tiles().addTo(pm);
  pm.on("click", (e) => { if (!pins.s) setPin("s", e.latlng); else if (!pins.e) setPin("e", e.latlng); });
  rm = L.map("rideMap").setView([8.515, 124.69], 11); tiles().addTo(rm);
  rideLayer = L.layerGroup().addTo(rm);
  $("routeInfo").textContent = "Click the map to drop the start pin (A).";
}

function setPin(k, ll, quiet) {
  if (pins[k]) pins[k].setLatLng(ll);
  else {
    pins[k] = L.marker(ll, { draggable: true, icon: k === "s" ? dot("#FC4C02", "A") : dot("#d64545", "B") }).addTo(pm);
    pins[k].on("dragend", computeRoute);
  }
  if (!quiet) computeRoute();
}

function clearPins() {
  ["s", "e"].forEach((k) => { if (pins[k]) { pm.removeLayer(pins[k]); pins[k] = null; } });
  if (routeLine) { pm.removeLayer(routeLine); routeLine = null; }
  routeGeom = null; $("route").value = "";
  $("routeInfo").textContent = "Click the map to drop the start pin (A).";
}

async function climb(pts) {
  const step = Math.max(1, Math.ceil(pts.length / 80)), s = pts.filter((_, i) => i % step === 0);
  const r = await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${s.map((p) => p[0].toFixed(5))}&longitude=${s.map((p) => p[1].toFixed(5))}`)).json();
  let up = 0;
  r.elevation.forEach((e, i) => { if (i && e - r.elevation[i - 1] >= 1) up += e - r.elevation[i - 1]; });
  return Math.round(up);
}

async function computeRoute() {
  if (!pins.s || !pins.e) { $("routeInfo").textContent = pins.s ? "Now click the map to drop the end pin (B)." : "Click the map to drop the start pin (A)."; return; }
  const a = pins.s.getLatLng(), b = pins.e.getLatLng();
  $("routeInfo").textContent = "Calculating cycling route...";
  let km, pts, how = "Cycling route";
  try {
    const r = await (await fetch(`https://routing.openstreetmap.de/routed-bike/route/v1/bike/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`)).json();
    km = r.routes[0].distance / 1000; pts = r.routes[0].geometry.coordinates.map(([x, y]) => [y, x]);
  } catch (e) {
    km = (a.distanceTo(b) / 1000) * 1.25; pts = [[a.lat, a.lng], [b.lat, b.lng]]; how = "Straight-line x1.25 (routing service unavailable)";
  }
  let elev = 0, elevOk = true;
  try { elev = await climb(pts); } catch (e) { elevOk = false; }
  $("km").value = km.toFixed(1);
  if (elevOk) $("elev").value = elev;
  if (routeLine) pm.removeLayer(routeLine);
  routeLine = L.polyline(pts, { color: "#FC4C02", weight: 5, opacity: .8 }).addTo(pm);
  pm.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  const keep = Math.ceil(pts.length / 400);
  routeGeom = pts.filter((_, i) => i % keep === 0 || i === pts.length - 1);
  $("routeInfo").textContent = `${how}: ${km.toFixed(1)} km` + (elevOk ? ` · climb ≈ ${elev} m` : "") + " (editable below)";
}

function fillPresets() {
  const cur = $("route").value;
  $("route").innerHTML = '<option value="">- drop pins on map -</option>' +
    D.presets.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("route").value = cur;
}

function applyPreset() {
  const p = D.presets.find((x) => String(x.id) === $("route").value);
  if (!p || !hasMap) return;
  setPin("s", L.latLng(p.s_lat, p.s_lng), true); setPin("e", L.latLng(p.e_lat, p.e_lng), true);
  computeRoute();
}

function routeName() {
  const p = D.presets.find((x) => String(x.id) === $("route").value);
  return p ? p.name : "Custom route (map pins)";
}

function routePayload() {
  if (!pins.s || !pins.e) return {};
  const a = pins.s.getLatLng(), b = pins.e.getLatLng();
  return { s_lat: a.lat, s_lng: a.lng, e_lat: b.lat, e_lng: b.lng, geom: routeGeom || [[a.lat, a.lng], [b.lat, b.lng]] };
}

async function savePreset() {
  if (!pins.s || !pins.e) { $("routeInfo").textContent = "Drop both pins first."; return; }
  const name = prompt("Name this preset route:", "My commute");
  if (!name) return;
  const a = pins.s.getLatLng(), b = pins.e.getLatLng();
  await api("/api/preset", "POST", { name, s_lat: a.lat, s_lng: a.lng, e_lat: b.lat, e_lng: b.lng, km: $("km").value, elev: $("elev").value });
  await load();
  $("routeInfo").textContent = `Saved preset "${name}".`;
}

/* ---------- Leaflet: all rides ---------- */
const ROUTE_COLOR = "#FC4C02", ROUTE_EDGE = "#4a1500";   // Strava-orange line on a dark outline
let mapRides = [];
const routeKey = (g) => {            // same start/end (within ~100 m, either direction) = same route
  const r = (p) => p[0].toFixed(3) + "," + p[1].toFixed(3);
  return [r(g[0]), r(g[g.length - 1])].sort().join("|");
};

function fillRideFilter() {
  const cur = $("rideFilter").value;
  $("rideFilter").innerHTML = '<option value="">All rides</option>' + [...mapRides].reverse()
    .map((r) => `<option value="${r.id}">${esc(r.day)} · ${fmt(r.km, 1)} km · ${esc(r.route)}</option>`).join("");
  $("rideFilter").value = cur;
}

async function drawRideMap(reload = true) {
  if (!hasMap || !rm) return;
  if (reload) { mapRides = await api("/api/map"); fillRideFilter(); }
  rideLayer.clearLayers();
  const sel = $("rideFilter").value;
  const shown = sel ? mapRides.filter((r) => String(r.id) === sel) : mapRides;
  const groups = {};
  shown.filter((r) => Array.isArray(r.geom) && r.geom.length > 1).forEach((r) => (groups[routeKey(r.geom)] = groups[routeKey(r.geom)] || []).push(r));
  const all = [];
  Object.values(groups).forEach((g) => {
    const ll = g[0].geom, n = g.length;
    const popup = `<b>${esc(g[0].route)}</b><br>${n} ride${n > 1 ? "s" : ""} on this route` +
      (n > 1 ? ` · ${fmt(g.reduce((t, r) => t + r.km, 0), 1)} km total` : "") + "<br>" +
      g.map((r) => `${esc(r.day)} · ${fmt(r.km, 1)} km · ${fmt(r.kmh, 1)} km/h · ~${fmt(r.kcal)} kcal`).join("<br>");
    L.polyline(ll, { color: ROUTE_EDGE, weight: 9, opacity: .75 }).addTo(rideLayer);
    L.polyline(ll, { color: ROUTE_COLOR, weight: 5, opacity: 1 }).addTo(rideLayer).bindPopup(popup);
    L.circleMarker(ll[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#FC4C02", fillOpacity: 1 }).addTo(rideLayer);
    L.circleMarker(ll[ll.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d64545", fillOpacity: 1 }).addTo(rideLayer);
    if (n > 1) {                      // badge for repeated routes
      L.marker(ll[Math.floor(ll.length / 2)], { icon: L.divIcon({ className: "", html: `<div class="pin cnt">×${n}</div>`, iconSize: [34, 26], iconAnchor: [17, 13] }) })
        .addTo(rideLayer).bindPopup(popup);
    }
    all.push(...ll);
  });
  if (all.length) {
    rideBounds = L.latLngBounds(all);
    if (rm.getSize().x > 0) rm.fitBounds(rideBounds, { padding: [30, 30] });   // never fit while the map is hidden
  }
  const nr = Object.keys(groups).length;
  $("mapNote").textContent = `${shown.length} ride(s) on ${nr} route(s). Amber line = route, green dot = start, red dot = end, ×N badge = repeated route (click it to list every ride).` +
    (D.unmapped ? ` ${D.unmapped} older ride(s) were logged without pins, so they aren't shown.` : "");
}

/* ---------- collapsible sections ---------- */
function setSummaries() {
  const a = D.a, t = a.totals, b = a.body, s = D.settings, B = a.bests, set = (id, v) => ($(id).textContent = v);
  $("hero").innerHTML = [["Rides", t.rides], ["Distance", fmt(t.km, 1) + " km"], ["Calories", fmt(t.kcal) + " kcal"], ["Avg speed", fmt(t.avg_kmh, 1) + " km/h"]]
    .map(([l, v]) => `<div class="card kpi"><b>${v}</b><span>${l}</span></div>`).join("");
  set("sum_map", `${t.rides - D.unmapped} ride(s) mapped`);
  set("sum_history", `${t.rides} ride(s)`);
  set("sum_overview", `${fmt(t.km, 1)} km · ${fmt(t.hours, 1)} h · ${fmt(t.fat_kg, 2)} kg fat equiv.`);
  set("sum_insights", `${a.tips.length} tip(s)`);
  set("sum_body", `BMI ${fmt(b.bmi, 1)} · ${b.bmi_asia} (Asia-Pac.)`);
  set("sum_level", `${a.tier.name} · streak ${a.streak} wk`);
  set("sum_zones", `max ≈ ${fmt(b.hrmax)} bpm`);
  set("sum_trends", a.trend == null ? "needs 4+ rides" : `speed ${a.trend >= 0 ? "+" : ""}${fmt(a.trend, 1)}%`);
  set("sum_records", B.longest ? `longest ${fmt(B.longest.km, 1)} km · fastest ${fmt(B.fastest.kmh, 1)} km/h` : "no rides yet");
  set("sum_settings", `${fmt(s.kg, 1)} kg · ${fmt(s.height_cm)} cm · bike ${fmt(s.bike_kg, 1)} kg`);
}

function setupSections() {
  const secs = [...document.querySelectorAll("details.sec")];
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("ct_open")); } catch (e) {}
  if (!saved) saved = { d_log: true };          // first visit: only "Log a ride" is open
  const persist = () => { try { localStorage.setItem("ct_open", JSON.stringify(Object.fromEntries(secs.map((d) => [d.id, d.open])))); } catch (e) {} };
  secs.forEach((d) => {
    d.open = d.id in saved ? !!saved[d.id] : d.hasAttribute("open");   // new sections fall back to their default
    d.addEventListener("toggle", () => {
      persist();
      if (!d.open || !hasMap) return;
      if (pm && d.contains($("pickMap"))) pm.invalidateSize();    // Leaflet needs a resize once visible
      if (rm && d.contains($("rideMap"))) setTimeout(() => { rm.invalidateSize(); drawRideMap(true); }, 60);
    });
  });
  $("rideFilter").addEventListener("change", () => drawRideMap(false));
  const visible = () => secs.filter((d) => d.offsetParent !== null);   // only the sections on screen (Bike or Pickleball)
  $("expandAll").addEventListener("click", () => visible().forEach((d) => (d.open = true)));
  $("collapseAll").addEventListener("click", () => visible().forEach((d) => (d.open = false)));
  $("chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    const d = $(c.dataset.target);
    d.open = true;
    setTimeout(() => d.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  });
}

/* ---------- rendering (dashboard sections) ---------- */
const NOTHING = '<text x="300" y="80" text-anchor="middle" fill="currentColor" opacity=".5" font-size="13">No data yet</text>';

function lineChart(id, pts, dec = 1) {
  const svg = $(id);
  if (!pts.length) { svg.innerHTML = NOTHING; return; }
  const W = 600, H = 150, PX = 34, PT = 14, PB = 28, ys = pts.map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const X = (i) => (pts.length === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (pts.length - 1));
  const Y = (v) => H - PB - ((v - lo) / span) * (H - PB - PT);
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  svg.innerHTML = `<g fill="currentColor" font-size="11" opacity=".6">
      <text x="4" y="${PT + 4}">${fmt(hi, dec)}</text><text x="4" y="${H - PB}">${fmt(lo, dec)}</text>
      <text x="${PX}" y="${H - 8}">${esc(pts[0].x)}</text><text x="${W - PX}" y="${H - 8}" text-anchor="end">${esc(pts[pts.length - 1].x)}</text></g>
    <polyline points="${line}" fill="none" stroke="var(--ac)" stroke-width="2.5" stroke-linejoin="round"/>` +
    pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.5" fill="var(--ac)"><title>${esc(p.x)}: ${fmt(p.y, dec)}</title></circle>`).join("");
}

function weekChart(weeks, goal) {
  const W = 600, H = 150, PB = 28, PT = 14, max = Math.max(goal, ...weeks.map((w) => w.equiv), 1) * 1.1, bw = W / weeks.length;
  const Y = (v) => H - PB - (v / max) * (H - PB - PT);
  $("cWeek").innerHTML = weeks.map((w, i) => `<rect x="${(i * bw + 8).toFixed(1)}" y="${Y(w.equiv).toFixed(1)}" width="${(bw - 16).toFixed(1)}" height="${(H - PB - Y(w.equiv)).toFixed(1)}" rx="3" fill="${w.equiv >= goal ? "var(--ac)" : "var(--mut)"}" opacity="${w.equiv >= goal ? 1 : .55}"><title>${fmt(w.equiv)} min</title></rect>
      <text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${esc(w.label)}</text>`).join("") +
    `<line x1="0" x2="${W}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--ac)" stroke-dasharray="5 4"/>
     <text x="${W - 2}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ac)">goal ${fmt(goal)}</text>`;
}

function render() {
  const a = D.a, t = a.totals, b = a.body, s = D.settings, B = a.bests;
  $("goalBar").style.width = Math.min(100, (a.this_equiv / s.goal_min) * 100) + "%";
  $("goalText").textContent = `${fmt(a.this_equiv)} of ${fmt(s.goal_min)} min this week · ${a.streak} week streak`;

  const k = (l, v) => `<div class="card kpi"><b>${v}</b><span>${l}</span></div>`;
  $("kpis").innerHTML = [
    k("Rides", t.rides), k("Distance", fmt(t.km, 1) + " km"), k("Time", fmt(t.hours, 1) + " h"),
    k("Calories (best est.)", fmt(t.kcal) + " kcal"), k("Range", `${fmt(t.kcal_min)}–${fmt(t.kcal_max)} kcal`),
    k("Fat equivalent", fmt(t.fat_kg, 2) + " kg"), k("Avg speed", fmt(t.avg_kmh, 1) + " km/h"),
    k("Avg power", fmt(t.avg_watts) + " W" + (t.wkg ? ` · ${fmt(t.wkg, 2)} W/kg` : "")),
    k("CO₂ avoided", fmt(t.co2, 1) + " kg"), k("Travel cost saved", "₱" + fmt(t.money)),
    k("Steps equivalent", fmt(t.steps)), k("Rice bowls burned", fmt(t.rice, 1)),
    k("MET-minutes", fmt(t.metmin)), k("Vigorous share", fmt(t.vig_share) + "%"), k("Water needed", fmt(t.water_l, 1) + " L"),
  ].join("");

  $("tips").innerHTML = a.tips.map((x) => `<li>${esc(x)}</li>`).join("");

  const gp = Math.max(0, Math.min(100, ((b.bmi - 15) / 20) * 100));
  $("body").innerHTML =
    `<div class="gauge"><i style="left:${gp.toFixed(1)}%"></i></div>` +
    row("BMI", `${fmt(b.bmi, 1)} · ${b.bmi_who} (WHO) / ${b.bmi_asia} (Asia-Pacific)`) +
    row("Healthy weight range", `${fmt(b.healthy_lo)}–${fmt(b.healthy_hi_asia)} kg (Asia-Pac.) · up to ${fmt(b.healthy_hi_who)} kg (WHO)`) +
    row("Resting burn (BMR)", fmt(b.bmr) + " kcal/day") + row("Daily burn (sedentary, TDEE)", fmt(b.tdee) + " kcal/day") +
    row("Estimated max heart rate", fmt(b.hrmax) + " bpm") + row("Rider + bike + load", fmt(b.total_mass, 1) + " kg");

  const p = a.proj;
  $("level").innerHTML = `<p><span class="pill">${esc(a.tier.name)}</span></p><p>${esc(a.tier.text)}</p>` +
    row("Last-4-week average", fmt(a.tier.metmin_week) + " MET-min/week") + row("Weekly goal streak", a.streak + " week(s)") +
    row("Avg weekly burn (last 4 wk)", fmt(p.weekly_kcal) + " kcal") + row("Projected fat loss / month", fmt(p.fat_month, 2) + " kg") +
    (p.weeks_to_goal ? row("Weeks to goal weight (cycling only)", fmt(p.weeks_to_goal)) : "");

  $("hrNote").textContent = `Max HR ≈ 208 − 0.7 × age (Tanaka) = ${fmt(b.hrmax)} bpm. Zones are a guide, not a measurement.`;
  $("zones").innerHTML = "<tr><th>Zone</th><th>Name</th><th>Range (bpm)</th></tr>" +
    b.zones.map((z) => `<tr><td>${z.z}</td><td>${esc(z.name)}</td><td>${z.lo}–${z.hi}</td></tr>`).join("");

  weekChart(a.weeks, s.goal_min);
  lineChart("cWeight", a.weight_pts, 1); lineChart("cSpeed", a.speed_pts, 1); lineChart("cWatt", a.watt_pts, 0);

  $("months").innerHTML = "<tr><th>Month</th><th>Rides</th><th>km</th><th>Hours</th><th>kcal</th></tr>" +
    (a.monthly.length ? a.monthly.map((m) => `<tr><td>${m.month}</td><td>${m.rides}</td><td>${fmt(m.km, 1)}</td><td>${fmt(m.hours, 1)}</td><td>${fmt(m.kcal)}</td></tr>`).join("")
      : '<tr><td colspan="5" class="note">No rides yet</td></tr>');
  const bt = (l, r, v) => (r ? `<tr><td>${l}</td><td>${esc(r.day)}</td><td>${v}</td></tr>` : `<tr><td>${l}</td><td colspan="2" class="note">-</td></tr>`);
  $("bests").innerHTML = "<tr><th>Record</th><th>Date</th><th>Value</th></tr>" +
    bt("Longest ride", B.longest, B.longest && fmt(B.longest.km, 1) + " km") + bt("Fastest ride", B.fastest, B.fastest && fmt(B.fastest.kmh, 1) + " km/h") +
    bt("Biggest burn", B.burn, B.burn && fmt(B.burn.kcal) + " kcal");

  $("history").innerHTML = "<tr><th>Date</th><th>Route</th><th>km</th><th>Min</th><th>km/h</th><th>kcal</th><th>Notes</th><th></th></tr>" +
    (D.rides.length ? D.rides.map((r) => `<tr><td>${esc(r.day)}</td><td>${esc(r.route)}</td><td>${fmt(r.km, 1)}</td><td>${fmt(r.minutes)}</td><td>${fmt(r.kmh, 1)}</td><td>${fmt(r.kcal_best)}</td><td>${esc(r.notes || "")}</td><td><button class="x" data-del="${r.id}" title="Delete ride">✕</button></td></tr>`).join("")
      : '<tr><td colspan="8" class="note">No rides logged yet. Use “Log a ride” to add your first one.</td></tr>');
}

/* ---------- actions ---------- */
async function saveRide() {
  const km = +$("km").value, mins = +$("min").value;
  if (!$("day").value || !(km > 0) || !(mins > 0)) { $("msg").textContent = "Enter a date, distance and time."; return; }
  const hadPins = !!(pins.s && pins.e);
  if (hasMap && hadPins && !routeGeom) await computeRoute();   // make sure the route line exists before saving
  const r = await api("/api/ride", "POST", { day: $("day").value, route: routeName(), km, minutes: mins, kg: $("kg").value,
    bike_kg: $("bike").value, load_kg: $("load").value, elev: $("elev").value, notes: $("notes").value, ...routePayload() });
  if (!r.ok) { $("msg").textContent = r.error || "Could not save."; return; }
  $("min").value = ""; $("notes").value = ""; $("km").value = ""; $("elev").value = "";
  if (hasMap) clearPins();
  await load();
  $("msg").textContent = `Saved. About ${fmt(r.kcal)} kcal (range ${fmt(r.kcal_min)}–${fmt(r.kcal_max)}).` +
    (hadPins ? "" : " No pins were dropped, so this ride won't appear on the map.");
}

async function saveSettings() {
  await api("/api/settings", "POST", { kg: $("s_kg").value, height_cm: $("s_h").value, bike_kg: $("s_bike").value, load_kg: $("s_load").value,
    age: $("s_age").value, sex: $("s_sex").value, goal_kg: $("s_goalkg").value, cost_km: $("s_cost").value, goal_min: $("s_goal").value });
  await load();
  if (typeof WT !== "undefined" && WT) loadWeight();        // Weight tab follows the profile weight
  if (typeof PB !== "undefined" && PB) loadPickle();
  $("sMsg").textContent = "Profile saved.";
}

async function deletePreset() {
  const id = $("route").value;
  if (!id) { $("routeInfo").textContent = "Select a preset route to delete."; return; }
  if (!confirm("Delete this preset route? Logged rides are not affected.")) return;
  await api(`/api/preset/${id}`, "DELETE");
  $("route").value = "";
  await load();
}

async function changePassword() {
  const r = await api("/api/me/password", "POST", { current: $("pw_cur").value, new: $("pw_new").value });
  $("pwMsg").textContent = r.ok ? "Password changed." : r.error;
  if (r.ok) { $("pw_cur").value = ""; $("pw_new").value = ""; }
}

function wireActions() {
  $("saveRide").addEventListener("click", saveRide);
  $("saveSettings").addEventListener("click", saveSettings);
  $("savePreset").addEventListener("click", savePreset);
  $("delPreset").addEventListener("click", deletePreset);
  $("changePw").addEventListener("click", changePassword);
  $("clearPins").addEventListener("click", () => hasMap && clearPins());
  $("route").addEventListener("change", applyPreset);
  $("logout").addEventListener("click", async () => { await api("/api/logout", "POST"); location.href = "/login"; });
  $("history").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b || !confirm("Delete this ride?")) return;
    await api(`/api/ride/${b.dataset.del}`, "DELETE");
    load();
  });
}

wireActions();
initMaps();
setupSections();
load();

/* keep maps sized after rotate/resize */
window.addEventListener("resize",()=>{clearTimeout(window.__rz);window.__rz=setTimeout(()=>{try{[pm,rm].forEach(m=>m&&m.invalidateSize())}catch(_){}},200)});
