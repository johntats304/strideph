/* Exercise (Bike / Pickleball), Food and Water tabs. Uses helpers from app.js ($, api, fmt, esc, row, localDay). */
const MEALS = ["breakfast", "lunch", "dinner", "snack"];
const cap = (m) => m[0].toUpperCase() + m.slice(1);
const nowHM = () => new Date().toTimeString().slice(0, 5);
const pct = (v, goal) => (goal > 0 ? Math.min(100, (v / goal) * 100) : 0);

/* simple bar chart: items = [{label, value}], optional dashed goal line */
function barChart(id, items, goal, unit = "") {
  const W = 600, H = 150, PB = 28, PT = 16, max = Math.max(goal || 0, ...items.map((i) => i.value), 1) * 1.1, bw = W / items.length;
  const Y = (v) => H - PB - (v / max) * (H - PB - PT);
  $(id).innerHTML = items.map((it, k) => `<rect x="${(k * bw + 8).toFixed(1)}" y="${Y(it.value).toFixed(1)}" width="${(bw - 16).toFixed(1)}" height="${Math.max(0, H - PB - Y(it.value)).toFixed(1)}" rx="3" fill="var(--ac)" opacity="${goal && it.value < goal ? .5 : 1}"><title>${esc(it.label)}: ${fmt(it.value)}${unit}</title></rect>
      <text x="${(k * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${esc(it.label)}</text>
      ${it.value ? `<text x="${(k * bw + bw / 2).toFixed(1)}" y="${(Y(it.value) - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${fmt(it.value)}</text>` : ""}`).join("") +
    (goal ? `<line x1="0" x2="${W}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--ac)" stroke-dasharray="5 4"/>
      <text x="${W - 2}" y="${(Y(goal) - 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ac)">goal ${fmt(goal)}${unit}</text>` : "");
}

/* ---------- tab switching ---------- */
let curTab = "dashboard", curSub = "bike";
function showTab(t, s) {
  curTab = t; if (s) curSub = s;
  document.body.dataset.tab = t;
  ["dashboard", "exercise", "food", "water", "sleep", "weight", "bp", "analytics"].forEach((x) => ($("panel_" + x).hidden = x !== t));
  document.querySelectorAll("#mainTabs .tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $("subbar").hidden = t !== "exercise";
  $("sub_bike").hidden = !(t === "exercise" && curSub === "bike");
  $("sub_pickle").hidden = !(t === "exercise" && curSub === "pickle");
  document.querySelectorAll("#subTabs .segbtn").forEach((b) => b.classList.toggle("on", b.dataset.sub === curSub));
  $("subTabs").dataset.on = curSub;
  $("bikeNav").hidden = !(t === "exercise" && curSub === "bike");
  $("pickleNav").hidden = !(t === "exercise" && curSub === "pickle");
  if (window.uiAfterTab) window.uiAfterTab();
  try { localStorage.setItem("ct_tab", JSON.stringify({ t: curTab, s: curSub })); } catch (e) {}
  if (t === "dashboard" && window.loadDashboard) loadDashboard();
  if (t === "food") loadFood();
  if (t === "water") loadWater();
  if (t === "sleep" && window.loadSleep) loadSleep();
  if (t === "weight") loadWeight();
  if (t === "bp") loadBp();
  if (t === "analytics" && window.loadAnalytics) loadAnalytics();
  if (t === "exercise" && curSub === "pickle") loadPickle();
  if (t === "exercise" && curSub === "bike") setTimeout(() => {      // Leaflet needs a resize after being hidden
    if (typeof pm !== "undefined" && pm) pm.invalidateSize();
    if (typeof rm !== "undefined" && rm) { rm.invalidateSize(); if ($("d_map").open) drawRideMap(false); }
  }, 60);
}

/* ---------- food ---------- */
const F = { day: localDay(), data: null };

async function loadFood() {
  $("f_day").value = F.day;
  F.data = await api(`/api/food?day=${F.day}`);
  if (document.activeElement !== $("f_goal")) $("f_goal").value = F.data.goal;
  if (F.data.macro && !document.querySelector("#f_macro_sec input:focus")) M = { protein: F.data.macro.protein, carbs: F.data.macro.carbs, fat: F.data.macro.fat };
  renderFood();
  renderMacro();
}

function renderFood() {
  const d = F.data, t = d.totals, left = d.goal - t.kcal, burned = d.burned.bike + d.burned.pickleball;
  $("fBar").style.width = pct(t.kcal, d.goal) + "%";
  $("fSummary").innerHTML =
    row("Eaten", `${fmt(t.kcal)} kcal`) +
    row(left >= 0 ? "Remaining vs goal" : "Over goal by", `<span class="${left < 0 ? "over" : ""}">${fmt(Math.abs(left))} kcal</span>`) +
    row("Protein · Carbs · Fat", `${fmt(t.protein, 1)} g · ${fmt(t.carbs, 1)} g · ${fmt(t.fat, 1)} g`) +
    row("Exercise burned this day", `${fmt(burned)} kcal (bike ${fmt(d.burned.bike)} · pickleball ${fmt(d.burned.pickleball)})`) +
    row("Eaten minus exercise", `${fmt(t.kcal - burned)} kcal <small>(before resting metabolism)</small>`);
  $("sum_fl").textContent = `${d.entries.length} item(s) · ${fmt(t.kcal)} kcal`;

  let html = "<tr><th>Meal</th><th>Food</th><th>kcal</th><th>P</th><th>C</th><th>F</th><th></th></tr>";
  MEALS.forEach((m) => {
    const items = d.entries.filter((e) => e.meal === m);
    if (!items.length) return;
    html += `<tr class="mealrow"><td colspan="7">${cap(m)} · ${fmt(items.reduce((a, e) => a + e.kcal, 0))} kcal</td></tr>` +
      items.map((e) => `<tr><td></td><td>${esc(e.name)}</td><td>${fmt(e.kcal)}</td><td>${fmt(e.protein, 1)}</td><td>${fmt(e.carbs, 1)}</td><td>${fmt(e.fat, 1)}</td>
        <td><button class="x" data-fdel="${e.id}" title="Delete">✕</button></td></tr>`).join("");
  });
  if (!d.entries.length) html += '<tr><td colspan="7" class="note">Nothing logged for this day yet.</td></tr>';
  $("fList").innerHTML = html;

  $("fRecent").innerHTML = d.recent.length
    ? '<span class="note" style="align-self:center">Your recent foods:</span>' +
      d.recent.map((r, i) => `<button class="food" data-fr="${i}">${esc(r.name)} · ${fmt(r.kcal)}</button>`).join("") : "";
  barChart("cFood", d.week.map((w) => ({ label: w.day.slice(5), value: w.value })), d.goal, " kcal");
}

async function addFood() {
  const r = await api("/api/food", "POST", { day: F.day, meal: $("f_meal").value, name: $("f_name").value, kcal: $("f_kcal").value,
    protein: $("f_p").value, carbs: $("f_c").value, fat: $("f_f").value });
  $("fMsg").classList.toggle("err", !r.ok);
  $("fMsg").textContent = r.ok ? "Added." : r.error;
  if (!r.ok) return;
  ["f_name", "f_kcal", "f_p", "f_c", "f_f"].forEach((k) => ($(k).value = ""));
  loadFood();
}


/* ---------- upload food (Claude-formatted JSON) ---------- */
const FU_PROMPT = `I'm logging food in my nutrition tracker. Look at the attached food photo / nutrition label / menu item (or my description below) and estimate what I ate.

Reply with ONLY one JSON code block and no other text, in exactly this format:

[
  {"meal": "lunch", "name": "Grilled chicken rice bowl (1 bowl, ~400 g)", "kcal": 650, "protein": 42, "carbs": 70, "fat": 18}
]

Rules:
- One object per distinct food or drink item.
- "meal" must be one of: breakfast, lunch, dinner, snack.
- "name": short description including the portion eaten (max 80 characters).
- "kcal": total calories for the portion I ate, number only.
- "protein", "carbs", "fat": grams for the portion I ate, numbers only.
- If a nutrition label gives per-serving values, multiply by the servings I ate.
- If unsure, give your best estimate. Never use null, text or units inside the numbers.
- Optional: add "day": "YYYY-MM-DD" if I tell you the date; otherwise leave it out.

What I ate: [attach a photo or describe it here]`;
$("fu_prompt").value = FU_PROMPT;

function parseFoodJson(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  else { const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}")); if (a >= 0 && b > a) t = t.slice(a, b + 1); }
  const data = JSON.parse(t);
  return Array.isArray(data) ? data : Array.isArray(data.entries) ? data.entries : [data];
}

async function importFood() {
  const msg = $("fuMsg"), setMsg = (t, err) => { msg.classList.toggle("err", !!err); msg.textContent = t; };
  let items;
  try { items = parseFoodJson($("fu_text").value); } catch (e) { return setMsg("Couldn't read that. Paste Claude's JSON reply exactly as given.", true); }
  const r = await api("/api/food/bulk", "POST", { day: F.day, entries: items });
  if (!r.ok) return setMsg(r.error, true);
  setMsg(`Imported ${r.added} item(s).` + (r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.slice(0, 2).join("; ")}` : ""));
  $("fu_text").value = ""; $("fu_file").value = "";
  loadFood();
}

$("fu_copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(FU_PROMPT); }
  catch (e) { $("fu_prompt").select(); document.execCommand("copy"); }
  $("fuMsg").classList.remove("err"); $("fuMsg").textContent = "Instructions copied.";
});
$("fu_file").addEventListener("change", async () => {
  const f = $("fu_file").files[0]; if (!f) return;
  $("fu_text").value = await f.text();
});
$("fu_import").addEventListener("click", importFood);

/* ---------- macro targets + spider chart ---------- */
const MC = [{ k: "protein", n: "Protein", c: "#4aa3df", kc: 4 }, { k: "carbs", n: "Carbs", c: "#e09f00", kc: 4 }, { k: "fat", n: "Fat", c: "#9b6bd1", kc: 9 }];
let M = { protein: 25, carbs: 50, fat: 25 }, mView = "share", mShown = [0, 0, 0], mAnim = 0, mSaveT = 0;

/* Change one macro. Locked macros never move; the free ones share what is left in proportion to where they
   were when the interaction began (MS), so typing "40" digit by digit or dragging back and forth cannot drift them. */
let MS = null, ML = { protein: false, carbs: false, fat: false };
function setMacro(key, val) {
  const base = MS || M, others = MC.map((m) => m.k).filter((k) => k !== key);
  const locked = others.filter((k) => ML[k]), free = others.filter((k) => !ML[k]);
  const lockSum = locked.reduce((a, k) => a + M[k], 0);
  val = free.length ? Math.max(0, Math.min(100 - lockSum, Math.round(+val || 0))) : 100 - lockSum;   // nothing free to absorb a change
  const rest = 100 - lockSum - val, n = {};
  if (free.length === 1) n[free[0]] = rest;
  else if (free.length === 2) {
    const s = base[free[0]] + base[free[1]];
    n[free[0]] = s > 0 ? Math.round((base[free[0]] / s) * rest) : Math.round(rest / 2);
    n[free[1]] = rest - n[free[0]];                            // absorb rounding so the total is exactly 100
  }
  M = { ...M, ...n, [key]: val };
}

function macroStats() {
  const d = F.data, t = d.totals, kc = MC.map((m) => (t[m.k] || 0) * m.kc), tot = kc.reduce((a, b) => a + b, 0);
  return MC.map((m, i) => ({ ...m, g: t[m.k] || 0, tg: (d.goal * M[m.k]) / 100 / m.kc, tp: M[m.k], ap: tot ? (kc[i] / tot) * 100 : 0, has: tot > 0 }));
}

function syncMacroInputs() {
  MC.forEach((m) => {
    const num = $(`m_${m.k}`), lock = $(`m_${m.k}_l`);
    $(`m_${m.k}_r`).value = M[m.k];
    if (document.activeElement !== num) num.value = M[m.k];     // never overwrite the box you are typing in
    $(`m_${m.k}_r`).disabled = num.disabled = ML[m.k];
    if (lock) { lock.innerHTML = IC(ML[m.k] ? "lock" : "unlock"); lock.setAttribute("aria-pressed", ML[m.k]); }
    $(`m_${m.k}_g`).textContent = F.data ? `≈ ${fmt((F.data.goal * M[m.k]) / 100 / m.kc)} g per day at ${fmt(F.data.goal)} kcal` : "";
  });
  const sum = M.protein + M.carbs + M.fat;
  $("mTotal").textContent = `Total ${sum}%` + (Object.values(ML).some(Boolean) ? " · locked macros stay put while you adjust the others" : "");
  $("mTotal").classList.toggle("bad", sum !== 100);
}

function radarSvg(vals, targ, max, fmtAxis, labels) {
  const cx = 200, cy = 172, R = 120, ang = (i) => ((-90 + i * 120) * Math.PI) / 180;
  const P = (i, v) => [cx + Math.cos(ang(i)) * R * (v / max), cy + Math.sin(ang(i)) * R * (v / max)];
  const poly = (arr) => arr.map((v, i) => P(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");
  let s = "";
  for (let j = 1; j <= 4; j++) {                              // web rings
    s += `<polygon points="${poly([max * j / 4, max * j / 4, max * j / 4])}" fill="none" stroke="currentColor" opacity="${j === 4 ? .3 : .15}" stroke-width="1"/>`;
    const [x, y] = P(0, (max * j) / 4);
    s += `<text x="${(x + 5).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="9" fill="currentColor" opacity=".45">${fmtAxis((max * j) / 4)}</text>`;
  }
  MC.forEach((m, i) => { const [x, y] = P(i, max); s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" opacity=".2"/>`; });
  // faint target shape sits behind everything else
  s += `<polygon points="${poly(targ)}" fill="currentColor" opacity=".1"/>` +
       `<polygon points="${poly(targ)}" fill="none" stroke="currentColor" opacity=".5" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
  targ.forEach((v, i) => { const [x, y] = P(i, v); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--card)" stroke="currentColor" opacity=".6"><title>${MC[i].n} target: ${labels.t[i]}</title></circle>`; });
  // actual shape
  s += `<polygon points="${poly(vals)}" fill="var(--ac)" opacity=".28"/>` +
       `<polygon points="${poly(vals)}" fill="none" stroke="var(--ac)" stroke-width="2.6" stroke-linejoin="round"/>`;
  vals.forEach((v, i) => { const [x, y] = P(i, v); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${MC[i].c}" stroke="var(--card)" stroke-width="2"><title>${MC[i].n}: ${labels.a[i]}</title></circle>`; });
  MC.forEach((m, i) => {                                      // axis labels
    const lx = cx + Math.cos(ang(i)) * (R + 24), ly = cy + Math.sin(ang(i)) * (R + 24), anchor = i === 0 ? "middle" : i === 1 ? "start" : "end";
    s += `<text x="${lx.toFixed(1)}" y="${(ly + (i === 0 ? -6 : 8)).toFixed(1)}" text-anchor="${anchor}" font-size="13" font-weight="700" fill="${m.c}">${m.n}</text>` +
         `<text x="${lx.toFixed(1)}" y="${(ly + (i === 0 ? 8 : 22)).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="currentColor" opacity=".7">${labels.a[i]} / ${labels.t[i]}</text>`;
  });
  s += `<g font-size="11" fill="currentColor" opacity=".75"><line x1="112" y1="306" x2="136" y2="306" stroke="currentColor" stroke-width="1.6" stroke-dasharray="5 4"/><text x="142" y="310">Target</text>` +
       `<line x1="206" y1="306" x2="230" y2="306" stroke="var(--ac)" stroke-width="2.6"/><text x="236" y="310">Actual today</text></g>`;
  return s;
}

function renderMacro() {
  if (!F.data) return;
  M = { ...M };
  const st = macroStats(), has = st[0].has, share = mView === "share";
  const tv = share ? st.map((x) => x.tp) : st.map(() => 100);
  const av = share ? st.map((x) => x.ap) : st.map((x) => (x.tg ? (x.g / x.tg) * 100 : 0));
  const hi = Math.max(...tv, ...av), max = share ? Math.min(100, Math.max(40, Math.ceil((hi * 1.15) / 10) * 10)) : Math.max(120, Math.ceil((hi * 1.1) / 20) * 20);
  const labels = share
    ? { t: st.map((x) => fmt(x.tp) + "%"), a: st.map((x) => (has ? fmt(x.ap) + "%" : "–")) }
    : { t: st.map((x) => fmt(x.tg) + " g"), a: st.map((x) => fmt(x.g) + " g") };
  const fmtAxis = share ? (v) => fmt(v) + "%" : (v) => fmt(v) + "%";
  // animate the actual shape growing/shrinking to its new values
  const from = mShown.slice(), to = av, t0 = performance.now();
  cancelAnimationFrame(mAnim);
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / 500), e = 1 - Math.pow(1 - p, 3), cur = to.map((v, i) => from[i] + (v - from[i]) * e);
    $("cMacro").innerHTML = radarSvg(cur, tv, max, fmtAxis, labels);
    if (p < 1) mAnim = requestAnimationFrame(frame); else mShown = to.slice();
  };
  mAnim = requestAnimationFrame(frame);

  // hit / miss readout
  const rows = st.map((x, i) => {
    let cls, txt;
    if (!has) { cls = "near"; txt = "no data"; }
    else if (share) {
      const d = x.ap - x.tp, a = Math.abs(d);
      cls = a <= 5 ? "hit" : a <= 10 ? "near" : "miss";
      txt = a <= 5 ? "on target" : `${fmt(a)} pts ${d > 0 ? "over" : "under"}`;
    } else {
      const r = x.tg ? x.g / x.tg : 0, diff = x.g - x.tg;
      cls = r >= .9 && r <= 1.1 ? "hit" : r >= .75 && r <= 1.25 ? "near" : "miss";
      txt = cls === "hit" ? "on target" : `${fmt(Math.abs(diff))} g ${diff > 0 ? "over" : "to go"}`;
    }
    return { cls, html: `<div class="mstat"><i class="dot" style="background:${x.c}"></i><span><b>${x.n}</b> · ${fmt(x.g, 1)} g eaten · target ${fmt(x.tg)} g (${fmt(x.tp)}%)</span><span class="tag ${cls}">${txt}</span></div>` };
  });
  const hits = rows.filter((r) => r.cls === "hit").length;
  $("mStatus").innerHTML = rows.map((r) => r.html).join("") +
    `<p class="mverdict">${!has ? "Log some food to see your shape against the target." : hits === 3 ? "All three macros on target" : `${hits} of 3 macros on target`}</p>`;
  $("sum_macro").textContent = `P ${M.protein}% · C ${M.carbs}% · F ${M.fat}%` + (has ? ` · ${hits}/3 on target` : "");
  syncMacroInputs();
}

function saveMacro() {
  clearTimeout(mSaveT);
  mSaveT = setTimeout(() => api("/api/settings", "POST", { macro_protein: M.protein, macro_carbs: M.carbs, macro_fat: M.fat }), 350);
}
function onMacroInput(e) {
  const el = e.target.closest("[data-m]");
  if (!el || el.value === "") return;
  setMacro(el.dataset.m, el.value);
  renderMacro(); saveMacro();
}

/* ---------- water ---------- */
const W = { day: localDay(), data: null };

async function loadWater() {
  $("w_day").value = W.day;
  W.data = await api(`/api/water?day=${W.day}`);
  if (document.activeElement !== $("w_goal")) $("w_goal").value = W.data.goal;
  renderWater();
}

function renderWater() {
  const d = W.data;
  $("wBar").style.width = pct(d.total, d.goal) + "%";
  $("wText").textContent = `${fmt(d.total)} of ${fmt(d.goal)} ml` + (d.total >= d.goal ? " · goal reached" : ` · ${fmt(d.goal - d.total)} ml to go`);
  $("sum_wl").textContent = `${d.entries.length} drink(s) · ${fmt(d.total)} ml`;
  $("wList").innerHTML = "<tr><th>Time</th><th>Amount</th><th></th></tr>" + (d.entries.length
    ? d.entries.map((e) => `<tr><td>${esc(e.time || "")}</td><td>${fmt(e.ml)} ml</td><td><button class="x" data-wdel="${e.id}" title="Delete">✕</button></td></tr>`).join("")
    : '<tr><td colspan="3" class="note">Nothing logged for this day yet.</td></tr>');
  barChart("cWater", d.week.map((w) => ({ label: w.day.slice(5), value: w.value })), d.goal, " ml");
}

async function addWater(ml) {
  const r = await api("/api/water", "POST", { day: W.day, ml, time: nowHM() });
  $("wMsg").classList.toggle("err", !r.ok);
  $("wMsg").textContent = r.ok ? "" : r.error;
  if (r.ok) { $("w_ml").value = ""; loadWater(); }
}

/* ---------- pickleball ---------- */
let PB = null;

async function loadPickle() {
  PB = await api("/api/pickleball");
  if (!$("pb_day").value) $("pb_day").value = localDay();
  if (document.activeElement !== $("pb_kg")) $("pb_kg").value = PB.kg;       // always the current weight
  renderPickle();
}

function renderPickle() {
  const t = PB.totals, k = (l, v) => `<div class="card kpi"><b>${v}</b><span>${l}</span></div>`;
  $("pbKpis").innerHTML = [k("Sessions", t.sessions), k("Time played", fmt(t.hours, 1) + " h"), k("Calories", fmt(t.kcal) + " kcal"),
    k("This week", fmt(t.this_week) + " min"), k("Game record", `${t.wins}–${t.losses}`), k("Win rate", t.win_rate == null ? "-" : fmt(t.win_rate) + "%")].join("");
  $("sum_pbt").textContent = `${fmt(t.this_week)} min this week`;
  $("sum_pbh").textContent = `${t.sessions} session(s)`;
  barChart("cPb", PB.weeks.map((w) => ({ label: w.label, value: w.minutes })), 0, " min");
  $("pbHist").innerHTML = "<tr><th>Date</th><th>Min</th><th>Format</th><th>Intensity</th><th>W–L</th><th>kcal</th><th>Notes</th><th></th></tr>" +
    (PB.sessions.length ? PB.sessions.map((r) => `<tr><td>${esc(r.day)}</td><td>${fmt(r.minutes)}</td><td>${cap(esc(r.format))}</td><td>${cap(esc(r.intensity))}</td>
      <td>${r.wins || 0}–${r.losses || 0}</td><td>${fmt(r.kcal)}</td><td>${esc(r.notes || "")}</td><td><button class="x" data-pdel="${r.id}" title="Delete">✕</button></td></tr>`).join("")
      : '<tr><td colspan="8" class="note">No sessions yet. Log your first one above.</td></tr>');
}

async function savePickle() {
  const r = await api("/api/pickleball", "POST", { day: $("pb_day").value, minutes: $("pb_min").value, format: $("pb_fmt").value,
    intensity: $("pb_int").value, wins: $("pb_w").value, losses: $("pb_l").value, kg: $("pb_kg").value, notes: $("pb_notes").value });
  $("pbMsg").classList.toggle("err", !r.ok);
  $("pbMsg").textContent = r.ok ? `Saved. About ${fmt(r.kcal)} kcal.` : r.error;
  if (!r.ok) return;
  ["pb_min", "pb_w", "pb_l", "pb_notes"].forEach((k) => ($(k).value = ""));
  const msg = $("pbMsg").textContent;
  await loadPickle();
  $("pbMsg").textContent = msg;
}

async function saveGoal(key, input, reload) {
  if (!(+$(input).value > 0)) return;
  await api("/api/settings", "POST", { [key]: $(input).value });
  reload();
}


/* ---------- weight ---------- */
let WT = null;

async function loadWeight() {
  WT = await api("/api/weight");
  if (!$("wt_day").value) $("wt_day").value = localDay();
  if (document.activeElement !== $("wt_kg")) $("wt_kg").value = WT.stats ? WT.stats.current : WT.profile_kg;
  renderWeight();
}

function renderWeight() {
  const st = WT.stats, k = (l, v) => `<div class="card kpi"><b>${v}</b><span>${l}</span></div>`, sgn = (v, d = 1) => (v > 0 ? "+" : "") + fmt(v, d);
  $("wtKpis").innerHTML = st
    ? [k("Current", fmt(st.current, 1) + " kg"), k("Since start", sgn(st.change) + " kg"), k("Last 30 days", st.change30 == null ? "-" : sgn(st.change30) + " kg"),
       k("BMI", fmt(st.bmi, 1)), k("Goal", WT.goal > 0 ? fmt(WT.goal, 1) + " kg" : "not set"),
       k("To goal", st.to_goal == null ? "-" : (st.to_goal > 0 ? fmt(st.to_goal, 1) + " kg to lose" : st.to_goal < 0 ? fmt(-st.to_goal, 1) + " kg below" : "reached"))].join("")
    : k("Weigh-ins", 0) + k("Goal", WT.goal > 0 ? fmt(WT.goal, 1) + " kg" : "not set");
  $("sum_wtc").textContent = st ? `${fmt(st.current, 1)} kg · low ${fmt(st.low, 1)} · high ${fmt(st.high, 1)}` : "no data yet";
  $("sum_wth").textContent = `${WT.entries.length} weigh-in(s)`;
  lineChart("cWtLog", WT.entries.slice().reverse().map((e) => ({ x: e.day, y: e.kg })), 1);
  $("wtGoalNote").textContent = WT.goal > 0 ? `Goal weight: ${fmt(WT.goal, 1)} kg (change it under Bike → Profile).` : "Set a goal weight under Bike → Profile to see how far you have to go.";
  $("wtHist").innerHTML = "<tr><th>Date</th><th>Weight</th><th>Change</th><th>Notes</th><th></th></tr>" + (WT.entries.length
    ? WT.entries.map((e, i) => {
        const prev = WT.entries[i + 1], d = prev ? e.kg - prev.kg : null;
        return `<tr><td>${esc(e.day)}</td><td>${fmt(e.kg, 1)} kg</td><td>${d == null ? "-" : sgn(d)}</td><td>${esc(e.notes || "")}</td>
          <td><button class="x" data-wtdel="${e.id}" title="Delete">✕</button></td></tr>`;
      }).join("")
    : '<tr><td colspan="5" class="note">No weigh-ins yet. Log your first one above.</td></tr>');
}

async function saveWeight() {
  const r = await api("/api/weight", "POST", { day: $("wt_day").value, kg: $("wt_kg").value, notes: $("wt_notes").value });
  $("wtMsg").classList.toggle("err", !r.ok);
  if (!r.ok) { $("wtMsg").textContent = r.error; return; }
  $("wt_notes").value = "";
  await loadWeight();
  $("wtMsg").textContent = (r.replaced ? "Updated this day's weigh-in." : "Saved.") + (r.profile_updated ? " Your weight is updated everywhere in the app." : " (Older entry: your current weight is unchanged.)");
  await load();                       // refresh bike analytics, profile and ride form with the new weight
  if (!$("sub_pickle").hidden || PB) loadPickle();
}


/* ---------- blood pressure ---------- */
let BP = null;
const bpClass = (c) => "bp-" + c.toLowerCase().replace(" ", "");
const bpPill = (c) => `<span class="pill ${bpClass(c)}">${esc(c)}</span>`;

function bpChart(pts) {
  const svg = $("cBp");
  if (!pts.length) { svg.innerHTML = NOTHING; return; }
  const W = 600, H = 170, PX = 34, PT = 14, PB = 28;
  const lo = Math.min(...pts.map((p) => p.dia), 70) - 5, hi = Math.max(...pts.map((p) => p.sys), 130) + 5, span = hi - lo;
  const X = (i) => (pts.length === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (pts.length - 1));
  const Y = (v) => H - PB - ((v - lo) / span) * (H - PB - PT);
  const line = (key, col) => `<polyline points="${pts.map((p, i) => `${X(i).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>` +
    pts.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="3.5" fill="${col}"><title>${esc(p.x)}: ${p.sys}/${p.dia}</title></circle>`).join("");
  const ref = (v) => `<line x1="${PX}" x2="${W - PX}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" opacity=".25" stroke-dasharray="4 4"/>
    <text x="4" y="${(Y(v) + 4).toFixed(1)}" font-size="11" fill="currentColor" opacity=".6">${v}</text>`;
  svg.innerHTML = ref(120) + ref(80) + line("sys", "#d64545") + line("dia", "#4aa3df") +
    `<g fill="currentColor" font-size="11" opacity=".6"><text x="${PX}" y="${H - 8}">${esc(pts[0].x.slice(0, 10))}</text>
     <text x="${W - PX}" y="${H - 8}" text-anchor="end">${esc(pts[pts.length - 1].x.slice(0, 10))}</text></g>`;
}

async function loadBp() {
  BP = await api("/api/bp");
  if (!$("bp_day").value) $("bp_day").value = localDay();
  if (!$("bp_time").value) $("bp_time").value = nowHM();
  renderBp();
}

function renderBp() {
  const k = (l, v) => `<div class="card kpi"><b>${v}</b><span>${l}</span></div>`;
  const av = (a) => (a ? `${fmt(a.sys)}/${fmt(a.dia)}` : "-");
  const L = BP.latest;
  $("bpKpis").innerHTML = [
    k("Latest", L ? `${L.sys}/${L.dia}` : "-") + (L ? "" : ""),
    k("Latest category", L ? bpPill(L.category) : "-"),
    k(`7-day average${BP.avg7 ? ` (${BP.avg7.n})` : ""}`, av(BP.avg7)),
    k(`30-day average${BP.avg30 ? ` (${BP.avg30.n})` : ""}`, av(BP.avg30)),
    k("30-day avg pulse", BP.avg30 && BP.avg30.pulse ? fmt(BP.avg30.pulse) + " bpm" : "-"),
    k("Readings logged", BP.total),
  ].join("");
  const al = $("bpAlert");
  al.hidden = !(L && L.category === "Crisis");
  al.textContent = "Your latest reading is in the crisis range. Rest quietly for 5 minutes and measure again. If it is still this high, or you have chest pain, shortness of breath, severe headache, weakness or trouble speaking, get emergency medical help now.";
  $("sum_bpc").textContent = BP.avg7 ? `7-day avg ${av(BP.avg7)} · ${BP.avg7.category}` : "no recent readings";
  $("sum_bph").textContent = `${BP.total} reading(s)`;
  bpChart(BP.points);
  $("bpHist").innerHTML = "<tr><th>Date</th><th>Time</th><th>BP</th><th>Pulse</th><th>Category</th><th>Notes</th><th></th></tr>" + (BP.entries.length
    ? BP.entries.map((e) => `<tr><td>${esc(e.day)}</td><td>${esc(e.time || "")}</td><td><b>${e.sys}/${e.dia}</b></td><td>${e.pulse || "-"}</td><td>${bpPill(e.category)}</td><td>${esc(e.notes || "")}</td>
        <td><button class="x" data-bpdel="${e.id}" title="Delete">✕</button></td></tr>`).join("")
    : '<tr><td colspan="7" class="note">No readings yet. Record your first one above.</td></tr>');
}

async function saveBp() {
  const r = await api("/api/bp", "POST", { day: $("bp_day").value, time: $("bp_time").value, sys: $("bp_sys").value, dia: $("bp_dia").value,
    pulse: $("bp_pulse").value, notes: $("bp_notes").value });
  $("bpMsg").classList.toggle("err", !r.ok);
  if (!r.ok) { $("bpMsg").textContent = r.error; return; }
  ["bp_sys", "bp_dia", "bp_pulse", "bp_notes"].forEach((id) => ($(id).value = ""));
  $("bp_time").value = nowHM();
  await loadBp();
  $("bpMsg").textContent = `Saved: ${r.category}.`;
}

/* ---------- wiring ---------- */
const goHome = () => showTab("dashboard");
$("brandHome").addEventListener("click", goHome);
$("brandHome").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); } });
$("mainTabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) showTab(b.dataset.tab); });
$("subTabs").addEventListener("click", (e) => { const b = e.target.closest(".segbtn"); if (b) showTab("exercise", b.dataset.sub); });

$("f_day").addEventListener("change", () => { if ($("f_day").value) { F.day = $("f_day").value; loadFood(); } });
$("f_today").addEventListener("click", () => { F.day = localDay(); loadFood(); });
$("f_add").addEventListener("click", addFood);
$("f_saveGoal").addEventListener("click", () => saveGoal("kcal_goal", "f_goal", loadFood));
$("fList").addEventListener("click", async (e) => { const b = e.target.closest("[data-fdel]"); if (b) { await api(`/api/food/${b.dataset.fdel}`, "DELETE"); loadFood(); } });
$("fRecent").addEventListener("click", (e) => {
  const b = e.target.closest("[data-fr]"); if (!b) return;
  const r = F.data.recent[+b.dataset.fr];
  $("f_name").value = r.name; $("f_kcal").value = r.kcal; $("f_p").value = r.protein || ""; $("f_c").value = r.carbs || ""; $("f_f").value = r.fat || "";
  $("f_meal").value = r.meal; $("f_kcal").focus();
});

$("f_macro_sec").addEventListener("input", onMacroInput);
const startMacro = (e) => { if (e.target.closest("[data-m]")) MS = { ...M }; };          // remember the split before this edit starts
$("f_macro_sec").addEventListener("focusin", startMacro);
$("f_macro_sec").addEventListener("pointerdown", startMacro);
$("f_macro_sec").addEventListener("focusout", () => { MS = null; setTimeout(syncMacroInputs, 0); });   // tidy clamped values after typing
$("f_macro_sec").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lock]"); if (!b) return;
  const k = b.dataset.lock;
  if (!ML[k] && Object.values(ML).filter(Boolean).length >= 2) return;                // keep at least one macro free
  ML[k] = !ML[k]; syncMacroInputs();
});
$("mPresets").addEventListener("click", (e) => {
  const b = e.target.closest("[data-p]"); if (!b) return;
  const [p, c, f] = b.dataset.p.split(",").map(Number); M = { protein: p, carbs: c, fat: f }; MS = null;
  renderMacro(); saveMacro();
});
$("mView").addEventListener("click", (e) => {
  const b = e.target.closest(".segbtn"); if (!b) return;
  mView = b.dataset.v; $("mView").dataset.on = mView === "share" ? "a" : "b";
  $("mView").querySelectorAll(".segbtn").forEach((x) => x.classList.toggle("on", x === b));
  mShown = [0, 0, 0]; renderMacro();
});

$("w_day").addEventListener("change", () => { if ($("w_day").value) { W.day = $("w_day").value; loadWater(); } });
$("w_today").addEventListener("click", () => { W.day = localDay(); loadWater(); });
$("w_saveGoal").addEventListener("click", () => saveGoal("water_goal", "w_goal", loadWater));
$("wQuick").addEventListener("click", (e) => { const b = e.target.closest("[data-ml]"); if (b) addWater(+b.dataset.ml); });
$("w_add").addEventListener("click", () => addWater(+$("w_ml").value));
$("wList").addEventListener("click", async (e) => { const b = e.target.closest("[data-wdel]"); if (b) { await api(`/api/water/${b.dataset.wdel}`, "DELETE"); loadWater(); } });

$("wt_save").addEventListener("click", saveWeight);
$("wtHist").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-wtdel]");
  if (b && confirm("Delete this weigh-in?")) { await api(`/api/weight/${b.dataset.wtdel}`, "DELETE"); await loadWeight(); await load(); if (PB) loadPickle(); }
});

$("bp_save").addEventListener("click", saveBp);
$("bpHist").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bpdel]");
  if (b && confirm("Delete this reading?")) { await api(`/api/bp/${b.dataset.bpdel}`, "DELETE"); loadBp(); }
});

$("pb_save").addEventListener("click", savePickle);
$("pbHist").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pdel]");
  if (b && confirm("Delete this session?")) { await api(`/api/pickleball/${b.dataset.pdel}`, "DELETE"); loadPickle(); }
});

(() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("ct_tab")) || {}; } catch (e) {}
  showTab(["dashboard", "exercise", "food", "water", "sleep", "weight", "bp", "analytics"].includes(saved.t) ? saved.t : "dashboard", ["bike", "pickle"].includes(saved.s) ? saved.s : "bike");
})();
