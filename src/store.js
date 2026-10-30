/* STRIDE in-browser backend. Replaces the Flask + SQLite server: every /api/* call is answered here,
   and all data lives in this browser (IndexedDB). Port of app.py, analytics.py and report_extras.py. */
(() => {
"use strict";
const C = window.STRIDE_C, REAL_FETCH = window.fetch.bind(window);
const SKEY = "stride_session";
const sess = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch (_) { return null; } };

/* ---------- page guard ---------- */
const P = location.pathname, isLogin = /\/login(\.html)?$/.test(P), isAdminPage = /\/admin(\.html)?$/.test(P);
if (!sess() && !isLogin) location.replace("/login");
else if (sess() && isLogin) location.replace("/");
else if (isAdminPage && sess() && sess().role !== "admin") location.replace("/");

/* ---------- small helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toD = (s) => new Date(s + "T00:00:00Z"), iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const wday = (s) => (toD(s).getUTCDay() + 6) % 7, mondayOf = (s) => addDays(s, -wday(s));
const diffDays = (a, b) => Math.round((toD(a) - toD(b)) / 864e5);
const validDay = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(toD(d)) && iso(toD(d)) === d;
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v, def = 0) => { if (v == null || v === "" || typeof v === "boolean") return def; const x = Number(v); return Number.isFinite(x) ? x : def; };
const sum = (a, f = (x) => x) => a.reduce((t, x, i) => t + f(x, i), 0);
const mean = (v) => (v.length ? sum(v) / v.length : null);
const r2 = (v) => Math.round(v * 100) / 100, rn = (v, n) => { const k = 10 ** n; return Math.round(v * k) / k; };
const fx = (v, d = 1) => v.toFixed(d), sg = (v, d = 1) => (v >= 0 ? "+" : "") + v.toFixed(d);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const sd = (v) => { if (v.length < 2) return 0; const m = sum(v) / v.length; return Math.sqrt(sum(v, (a) => (a - m) ** 2) / v.length); };
const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const TXT = (text, type, name) => new Response(text, { status: 200, headers: { "Content-Type": type, "Content-Disposition": `attachment; filename=${name}` } });
const hmMin = (t) => { const [h, m] = String(t).split(":"); return parseInt(h) * 60 + parseInt(m); };
const minHm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
const lastDays = (n, end) => Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));

/* ---------- storage (IndexedDB, in-memory fallback) ---------- */
let DB = null, mem = null;
const idb = () => new Promise((res, rej) => { const q = indexedDB.open("stride", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const kvGet = async () => { if (typeof indexedDB === "undefined") return mem; const d = await idb(); return new Promise((r) => { const g = d.transaction("kv").objectStore("kv").get("db"); g.onsuccess = () => r(g.result); g.onerror = () => r(null); }); };
const kvPut = async () => { if (typeof indexedDB === "undefined") { mem = JSON.parse(JSON.stringify(DB)); return; } const d = await idb(); return new Promise((r) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(DB, "db"); t.oncomplete = () => r(); t.onerror = () => r(); }); };
const save = () => kvPut();
const TABLES = ["users", "rides", "presets", "food", "water", "pickleball", "weight", "bp", "sleep", "goal_changes"];
const newDb = () => { const d = { seq: {}, user_settings: {}, day_status: {} }; TABLES.forEach((t) => (d[t] = [])); return d; };
const nid = (t) => (DB.seq[t] = (DB.seq[t] || 0) + 1);
const mine = (t, uid) => DB[t].filter((r) => r.user_id === uid);
const cyrb = (s) => { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); };
const hashPw = async (pw, salt) => {
  if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw)); return salt + ":" + [...new Uint8Array(b)].map((x) => pad(x.toString(16))).join(""); }
  return salt + ":" + cyrb(salt + pw);
};
const mkPw = (pw) => hashPw(pw, Math.random().toString(36).slice(2, 12));
const checkPw = async (stored, pw) => stored === (await hashPw(pw, stored.split(":")[0]));
let loading = null;
const load = () => loading || (loading = (async () => {
  DB = (await kvGet()) || newDb();
  TABLES.forEach((t) => DB[t] || (DB[t] = []));
  if (!DB.users.length) DB.users.push({ id: nid("users"), username: "admin", pw: await mkPw("admin123"), role: "admin", created: todayStr() });
  await save();
})());

/* ---------- body model ---------- */
const DEFAULTS = { kg: "70", height_cm: "170", bike_kg: "13", load_kg: "2", age: "30", sex: "male", goal_kg: "0", cost_km: "6", goal_min: "150",
  kcal_goal: "2000", water_goal: "2000", sleep_goal: "8", macro_protein: "25", macro_carbs: "50", macro_fat: "25" };
const EXTRA = ["start_weight", "start_date", "target_date"], GOAL_FIELDS = ["goal_kg", "kcal_goal", "water_goal", "goal_min", "target_date"];
const getSettings = (uid) => { const s = { ...DEFAULTS }, us = DB.user_settings[uid] || {}; for (const k in us) if (k in DEFAULTS) s[k] = us[k]; const o = {}; for (const k in s) o[k] = k === "sex" ? s[k] : parseFloat(s[k]); return o; };
const metFor = (kmh) => { for (const [l, m] of [[16.1, 4], [19.3, 6.8], [22.5, 8], [25.7, 10], [32.2, 12]]) if (kmh < l) return m; return 15.8; };
const physics = (km, mins, rider, bike, load, elev) => {
  const t = mins * 60, v = (km * 1000) / t, m = rider + bike + load;
  let p = 0.006 * m * 9.81 * v + 0.5 * 1.18 * 0.5 * v ** 3;
  if (elev) p += (m * 9.81 * elev) / t;
  p /= 0.97; return [p, (p * t) / (0.24 * 4184)];
};
const enrich = (row, s) => {
  const r = { ...row }; delete r.geom;
  const bike = r.bike_kg == null ? s.bike_kg : r.bike_kg, load = r.load_kg == null ? s.load_kg : r.load_kg;
  r.bike_kg = bike; r.load_kg = load; r.elev = r.elev || 0; r.kmh = r.km / (r.minutes / 60);
  [r.watts, r.kcal_phys] = physics(r.km, r.minutes, r.kg, bike, load, r.elev);
  r.kcal_best = (r.kcal + r.kcal_phys) / 2; r.vigorous = r.met >= 6; return r;
};
const bmrOf = (kg, h, age, sex) => 10 * kg + 6.25 * h - 5 * age + (sex === "male" ? 5 : -161);

function dashAnalytics(rowsDesc, s) {
  const rides = rowsDesc.map((r) => enrich(r, s)), asc = [...rides].reverse();
  const h = s.height_cm / 100, kg = s.kg, bmi = kg / h ** 2;
  const cat = (b, cuts) => ["Underweight", "Normal", "Overweight", "Obese"][cuts.findIndex((l) => b < l)];
  const bmr = bmrOf(kg, s.height_cm, s.age, s.sex), hrmax = 208 - 0.7 * s.age;
  const zones = [["Recovery", .5, .6], ["Endurance / fat-burn", .6, .7], ["Tempo", .7, .8], ["Threshold", .8, .9], ["Max", .9, 1]]
    .map(([n, a, b], i) => ({ z: "Z" + (i + 1), name: n, lo: Math.round(hrmax * a), hi: Math.round(hrmax * b) }));
  const body = { bmi, bmi_who: cat(bmi, [18.5, 25, 30, 999]), bmi_asia: cat(bmi, [18.5, 23, 25, 999]), healthy_lo: 18.5 * h * h, healthy_hi_who: 24.9 * h * h,
    healthy_hi_asia: 22.9 * h * h, bmr, tdee: bmr * 1.2, hrmax, zones, total_mass: kg + s.bike_kg + s.load_kg };
  const blank = () => ({ minutes: 0, equiv: 0, km: 0, kcal: 0, rides: 0, metmin: 0 }), wk = {};
  for (const r of rides) {
    const w = (wk[mondayOf(r.day)] ||= blank());
    w.minutes += r.minutes; w.km += r.km; w.kcal += r.kcal_best; w.rides++; w.equiv += r.minutes * (r.vigorous ? 2 : 1); w.metmin += r.met * r.minutes;
  }
  const thisMon = mondayOf(todayStr());
  const weeks = []; for (let i = 7; i >= 0; i--) { const k = addDays(thisMon, -7 * i); weeks.push({ label: k.slice(5), ...(wk[k] || blank()) }); }
  let streak = 0;
  for (let i = 0; i < 60; i++) { const w = wk[addDays(thisMon, -7 * i)] || blank(); if (w.equiv >= s.goal_min) streak++; else if (i > 0) break; }
  const months = {};
  for (const r of rides) { const m = (months[r.day.slice(0, 7)] ||= { rides: 0, km: 0, hours: 0, kcal: 0 }); m.rides++; m.km += r.km; m.hours += r.minutes / 60; m.kcal += r.kcal_best; }
  const monthly = Object.keys(months).sort().reverse().slice(0, 6).map((k) => ({ month: k, ...months[k] }));
  const km = sum(rides, (r) => r.km), mins = sum(rides, (r) => r.minutes), kcal = sum(rides, (r) => r.kcal_best);
  const last4 = weeks.slice(-4), wkKcal = sum(last4, (w) => w.kcal) / 4, wkMet = sum(last4, (w) => w.metmin) / 4;
  const tiers = [[500, "Below guideline", "Under 500 MET-min/week. Even small increases lower risk the most."],
    [1000, "Meets guideline", "500-1000 MET-min/week meets the WHO minimum; cohort studies link this to roughly 20-30% lower mortality."],
    [2500, "Strong benefit zone", "1-5x the guideline is where pooled cohorts (Arem 2015, JAMA IM) show about 30-40% lower mortality."],
    [1e9, "High volume", "Benefits plateau at very high volume. Prioritise rest and sleep."]];
  const tier = tiers.find((t) => wkMet < t[0]);
  const speeds = asc.map((r) => r.kmh), half = Math.floor(speeds.length / 2);
  let trend = null;
  if (speeds.length >= 4) { const a = sum(speeds.slice(0, half)) / half, b = sum(speeds.slice(half)) / (speeds.length - half); trend = ((b - a) / a) * 100; }
  const pts = (key) => asc.map((r) => ({ x: r.day, y: r[key] }));
  const goalLeft = s.goal_kg > 0 ? Math.max(0, kg - s.goal_kg) : 0, equivNow = weeks[weeks.length - 1].equiv;
  const best = (f) => rides.reduce((b, r) => (b == null || f(r) > f(b) ? r : b), null);
  const out = { body, weeks, streak, monthly, this_equiv: equivNow,
    totals: { rides: rides.length, km, hours: mins / 60, kcal, kcal_min: sum(rides, (r) => r.kcal_phys), kcal_max: sum(rides, (r) => r.kcal), fat_kg: kcal / 7700,
      avg_kmh: mins ? km / (mins / 60) : 0, avg_watts: mins ? sum(rides, (r) => r.watts * r.minutes) / mins : 0, co2: km * 0.17, money: km * s.cost_km, steps: km * 1312,
      rice: kcal / 205, metmin: sum(rides, (r) => r.met * r.minutes), vig_share: mins ? (sum(rides.filter((r) => r.vigorous), (r) => r.minutes) / mins) * 100 : 0, water_l: (mins / 60) * 0.5 },
    bests: { longest: best((r) => r.km), fastest: best((r) => r.kmh), burn: best((r) => r.kcal_best) },
    tier: { name: tier[1], text: tier[2], metmin_week: wkMet },
    proj: { weekly_kcal: wkKcal, fat_month: (wkKcal * 4.33) / 7700, weeks_to_goal: goalLeft && wkKcal ? (goalLeft * 7700) / wkKcal : null, goal_left: goalLeft },
    trend, weight_pts: pts("kg"), speed_pts: pts("kmh"), watt_pts: pts("watts") };
  if (out.totals.avg_watts) out.totals.wkg = out.totals.avg_watts / kg;
  for (const k in out.bests) { const v = out.bests[k]; out.bests[k] = v ? { day: v.day, km: v.km, kmh: v.kmh, kcal: v.kcal_best } : null; }
  const tips = [];
  if (!rides.length) tips.push("Log your first ride to unlock personalised analytics.");
  else {
    const left = s.goal_min - equivNow;
    tips.push(`This week: ${fx(equivNow, 0)} of ${fx(s.goal_min, 0)} moderate-equivalent minutes (${left <= 0 ? "goal met" : fx(left, 0) + " min to go"}).`);
    if (body.bmi_asia !== "Normal" || body.bmi_who !== "Normal")
      tips.push(`BMI ${fx(bmi)}: ${body.bmi_who} (WHO) / ${body.bmi_asia} (Asia-Pacific). Healthy range for your height is ${fx(body.healthy_lo, 0)}-${fx(body.healthy_hi_asia, 0)} kg (Asia-Pacific).`);
    if (trend !== null) tips.push(`Your average speed is ${trend >= 0 ? "up" : "down"} ${fx(Math.abs(trend))}% from your early rides to your recent ones` + (trend > 1 ? " - fitness is improving." : "."));
    if (out.totals.vig_share < 30) tips.push("Most of your riding is moderate. One faster interval ride a week would build more VO2max.");
    tips.push(`Drink about 0.5 L of fluid per riding hour. Your ride totals ${fx(out.totals.water_l, 0)} L of cycling hydration so far.`);
    if (s.bike_kg > 15) tips.push(`Your bike plus load weighs ${fx(s.bike_kg + s.load_kg, 0)} kg. Each extra kg costs roughly 1% more effort on climbs.`);
    if (out.proj.weeks_to_goal) tips.push(`At your last-4-week pace, cycling alone would take about ${fx(out.proj.weeks_to_goal, 0)} weeks to reach your goal weight; diet speeds this up.`);
  }
  out.tips = tips; return out;
}

/* ---------- advanced analytics (port of analytics.py) ---------- */
const { STUDIES, METRICS, MATRIX_IDS, HYPOTHESES, AXES, HOW, MIN_N } = C || {};
const rank = (v) => { const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]), r = new Array(v.length).fill(0); let i = 0;
  while (i < v.length) { let j = i; while (j + 1 < v.length && v[idx[j + 1]] === v[idx[i]]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = avg; i = j + 1; } return r; };
const pearson = (x, y) => { const n = x.length, mx = sum(x) / n, my = sum(y) / n, sxx = sum(x, (a) => (a - mx) ** 2), syy = sum(y, (b) => (b - my) ** 2);
  if (sxx === 0 || syy === 0) return null; return sum(x, (a, i) => 0) + x.reduce((t, a, i) => t + (a - mx) * (y[i] - my), 0) / Math.sqrt(sxx * syy); };
const lgamma = (x) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log((2.5066282746310005 * s) / x); };
const betacf = (a, b, x) => { const FP = 1e-300, EPS = 3e-12, qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - (qab * x) / qap; d = 1 / (Math.abs(d) > FP ? d : FP); let h = d;
  for (let m = 1; m < 300; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; d = Math.abs(d) > FP ? d : FP; c = 1 + aa / c; c = Math.abs(c) > FP ? c : FP; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; d = Math.abs(d) > FP ? d : FP; c = 1 + aa / c; c = Math.abs(c) > FP ? c : FP; d = 1 / d; const de = d * c; h *= de; if (Math.abs(de - 1) < EPS) break; }
  return h; };
const betai = (a, b, x) => { if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b; };
const pFromR = (r, n) => { if (n < 3 || r == null) return null; if (Math.abs(r) >= 1) return 0; const df = n - 2, t2 = (r * r * df) / (1 - r * r); return betai(df / 2, 0.5, df / (df + t2)); };
const fisherCi = (r, n, sc = 1) => { if (n <= 3 || r == null || Math.abs(r) >= 1) return null; const z = Math.atanh(r), se = sc / Math.sqrt(n - 3); return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)]; };
const correlate = (xs, ys) => { const n = xs.length; if (n < 3) return { n, r: null };
  const rho = pearson(rank(xs), rank(ys)); if (rho === null) return { n, r: null };
  const pr = pearson(xs, ys), mx = mean(xs), my = mean(ys), sx = sd(xs), sy = sd(ys), slope = pr !== null && sx ? (pr * sy) / sx : null;
  return { n, r: rho, pearson: pr, p: pFromR(rho, n), ci: fisherCi(rho, n, 1.06), slope, intercept: slope !== null ? my - slope * mx : null }; };
const bhFdr = (ps) => { const items = ps.map((p, i) => [p, i]).filter((x) => x[0] != null).sort((a, b) => a[0] - b[0] || a[1] - b[1]), m = items.length, q = new Array(ps.length).fill(null); let prev = 1;
  for (let rk = m; rk > 0; rk--) { const [p, i] = items[rk - 1]; prev = Math.min(prev, (p * m) / rk); q[i] = prev; } return q; };
const strength = (r) => { const a = Math.abs(r); return a < .1 ? "negligible" : a < .3 ? "weak" : a < .5 ? "moderate" : "strong"; };
const confidence = (n) => (n < MIN_N ? "too little data" : n < 14 ? "preliminary" : n < 30 ? "moderate" : "good");
const blankDay = (day) => ({ day, ride_km: 0, ride_min: 0, ride_vig: 0, ride_kcal: 0, ride_kmh: null, ride_watts: null, pb_min: 0, pb_vig: 0, pb_kcal: 0, ex_min: 0, ex_equiv: 0,
  ex_kcal: 0, ex_metmin: 0, intake: null, protein: null, carbs: null, fat: null, water: null, sleep_h: null, sleep_q: null, bed_off: null, weight: null, sys: null, dia: null, pulse: null, logged: [] });

function buildDaily(rides, pbs, foods, waters, sleeps, weights, bps, firstDay, today, span) {
  if (!firstDay) return [];
  const a = addDays(today, -(span - 1)), start = a > firstDay ? a : firstDay, rows = {};
  for (let d = start; d <= today; d = addDays(d, 1)) rows[d] = blankDay(d);
  const mark = (r, k) => { if (!r.logged.includes(k)) r.logged.push(k); }, wsum = {};
  for (const r of rides) { const t = rows[r.day]; if (!t) continue;
    t.ride_km += r.km; t.ride_min += r.minutes; t.ride_kcal += r.kcal_best; t.ride_vig += r.vigorous ? r.minutes : 0; t.ex_metmin += r.met * r.minutes;
    wsum[r.day] = (wsum[r.day] || 0) + r.watts * r.minutes; mark(t, "ride"); }
  for (const p of pbs) { const t = rows[p.day]; if (!t) continue;
    t.pb_min += p.minutes; t.pb_kcal += p.kcal || 0; t.pb_vig += (p.met || 0) >= 6 ? p.minutes : 0; t.ex_metmin += (p.met || 0) * p.minutes; mark(t, "pb"); }
  for (const t of Object.values(rows)) { t.ex_min = t.ride_min + t.pb_min; t.ex_equiv = t.ex_min + t.ride_vig + t.pb_vig; t.ex_kcal = t.ride_kcal + t.pb_kcal;
    if (t.ride_min) { t.ride_kmh = t.ride_km / (t.ride_min / 60); t.ride_watts = wsum[t.day] / t.ride_min; } }
  for (const f of foods) { const t = rows[f.day]; if (t) { t.intake = (t.intake || 0) + (f.kcal || 0); for (const k of ["protein", "carbs", "fat"]) t[k] = (t[k] || 0) + (f[k] || 0); mark(t, "food"); } }
  for (const w of waters) { const t = rows[w.day]; if (t) { t.water = (t.water || 0) + (w.ml || 0); mark(t, "water"); } }
  for (const s of sleeps) { const t = rows[s.day]; if (t) { t.sleep_h = s.minutes / 60; t.sleep_q = s.quality; t.bed_off = (((hmMin(s.bed) - 1080) % 1440) + 1440) % 1440; mark(t, "sleep"); } }
  for (const w of weights) { const t = rows[w.day]; if (t) { t.weight = w.kg; mark(t, "weight"); } }
  const grp = {}; for (const b of bps) if (rows[b.day]) (grp[b.day] ||= []).push(b);
  for (const day in grp) { const t = rows[day], l = grp[day]; t.sys = mean(l.map((b) => b.sys)); t.dia = mean(l.map((b) => b.dia));
    const pl = l.filter((b) => b.pulse).map((b) => b.pulse); t.pulse = pl.length ? mean(pl) : null; mark(t, "bp"); }
  return Object.keys(rows).sort().map((k) => rows[k]);
}
const sleepNight = (h) => (h >= 7 && h <= 9 ? 100 : h < 7 ? clamp(100 - (7 - h) * 25) : clamp(100 - (h - 9) * 25));
const bmiScore = (b) => { const lo = 18.5, hi = 22.9; if (b >= lo && b <= hi) return 100; return b < lo ? clamp(100 - (lo - b) * 20) : clamp(100 - (b - hi) * 15); };
function axisScores(D, s) {
  const out = {}, n = D.length;
  if (n) {
    const wk = Math.max(1, n / 7), equiv = sum(D, (d) => d.ex_equiv), mins = sum(D, (d) => d.ex_min), vig = sum(D, (d) => d.ride_vig + d.pb_vig), goal = Math.max(1, s.goal_min);
    out.activity = { score: clamp((equiv / wk / goal) * 100), detail: `${fx(equiv / wk, 0)} moderate-equivalent min/week vs goal ${fx(goal, 0)} (${fx(sum(D, (d) => d.ex_metmin) / wk, 0)} MET-min/week).` };
    if (mins) { const share = (vig / mins) * 100; out.intensity = { score: clamp((share / 25) * 100), detail: `${fx(share, 0)}% of exercise minutes were vigorous (target 25% = full score).` }; }
    else out.intensity = { score: null, detail: "No exercise logged in this period." };
  } else out.activity = out.intensity = { score: null, detail: "No data in this period." };
  const S = D.filter((d) => d.sleep_h !== null);
  if (S.length >= 3) {
    const parts = [mean(S.map((d) => sleepNight(d.sleep_h)))], w = [.6], bits = [`${fx(mean(S.map((d) => d.sleep_h)))} h average over ${S.length} nights`];
    if (S.length >= 4) { const sdv = sd(S.map((d) => d.bed_off)); parts.push(clamp(100 - ((sdv - 30) / 90) * 100)); w.push(.25); bits.push(`bedtime varies +/-${fx(sdv, 0)} min`); }
    const Q = S.filter((d) => d.sleep_q).map((d) => d.sleep_q);
    if (Q.length) { parts.push(((mean(Q) - 1) / 4) * 100); w.push(.15); bits.push(`quality ${fx(mean(Q))}/5`); }
    out.sleep = { score: sum(parts, (a, i) => 0) + parts.reduce((t, a, i) => t + a * w[i], 0) / sum(w), detail: bits.join("; ") + "." };
  } else out.sleep = { score: null, detail: "Log at least 3 nights of sleep." };
  const W = D.filter((d) => d.water !== null);
  if (W.length >= 3) { const g = Math.max(1, s.water_goal); out.hydration = { score: mean(W.map((d) => Math.min(1, d.water / g))) * 100, detail: `${fx(mean(W.map((d) => d.water)), 0)} ml/day on ${W.length} logged days vs goal ${fx(g, 0)} ml.` }; }
  else out.hydration = { score: null, detail: "Log water on at least 3 days." };
  const F = D.filter((d) => d.intake !== null && d.intake >= 800);
  if (F.length >= 3) {
    const goal = Math.max(1, s.kcal_goal);
    const e = mean(F.map((d) => (Math.abs(d.intake - goal) / goal <= .10 ? 100 : clamp(100 - ((Math.abs(d.intake - goal) / goal - .10) / .30) * 100))));
    const [tp, tc, tf] = ["protein", "carbs", "fat"].map((k) => sum(F, (d) => d[k] || 0)), kc = tp * 4 + tc * 4 + tf * 9;
    const parts = [e], w = [.5], bits = [`${fx(mean(F.map((d) => d.intake)), 0)} kcal/day vs goal ${fx(goal, 0)}`];
    if (kc > 0) {
      const share = [(tp * 4 / kc) * 100, (tc * 4 / kc) * 100, (tf * 9 / kc) * 100], tgt = [s.macro_protein, s.macro_carbs, s.macro_fat];
      const dist = sum(share, (a, i) => Math.abs(a - tgt[i])) / 2;
      parts.push(clamp(100 - dist * 3.33)); w.push(.3);
      bits.push(`macros P${fx(share[0], 0)}/C${fx(share[1], 0)}/F${fx(share[2], 0)}% vs target ${fx(tgt[0], 0)}/${fx(tgt[1], 0)}/${fx(tgt[2], 0)}`);
      const gkg = tp / F.length / Math.max(1, s.kg); parts.push(clamp((gkg / 1.2) * 100)); w.push(.2); bits.push(`protein ${fx(gkg)} g/kg`);
    }
    out.nutrition = { score: parts.reduce((t, a, i) => t + a * w[i], 0) / sum(w), detail: bits.join("; ") + ` (${F.length} complete days).` };
  } else out.nutrition = { score: null, detail: "Log food (800+ kcal) on at least 3 days." };
  const wts = D.filter((d) => d.weight !== null).map((d) => d.weight), kg = wts.length ? wts[wts.length - 1] : s.kg, bmi = kg / (s.height_cm / 100) ** 2;
  out.body = { score: bmiScore(bmi), detail: `BMI ${fx(bmi)} at ${fx(kg)} kg (${wts.length ? "latest weigh-in" : "profile weight"}); Asia-Pacific healthy range 18.5-22.9.`, bmi };
  const B = D.filter((d) => d.sys !== null);
  if (B.length) { const sy = mean(B.map((d) => d.sys)), di = mean(B.map((d) => d.dia));
    out.bp = { score: Math.min(clamp(((160 - sy) / 45) * 100), clamp(((100 - di) / 25) * 100)), detail: `Average ${fx(sy, 0)}/${fx(di, 0)} mmHg over ${B.length} days (100 points at 115/75 or lower).` }; }
  else out.bp = { score: null, detail: "No blood-pressure readings in this period." };
  if (n) {
    const cov = (D.filter((d) => d.logged.length).length / n) * 100, hit = [];
    for (let i = 0; i + 7 <= n; i += 7) hit.push(sum(D.slice(i, i + 7), (d) => d.ex_equiv) >= s.goal_min);
    const nh = hit.filter(Boolean).length;
    out.habit = hit.length ? { score: .5 * cov + (.5 * nh) / hit.length * 100, detail: `Logged on ${fx(cov, 0)}% of days; ${nh} of ${hit.length} full weeks met the activity goal.` }
      : { score: cov, detail: `Logged on ${fx(cov, 0)}% of days (less than one full week of data).` };
  } else out.habit = { score: null, detail: "No data in this period." };
  return out;
}
const radar = (cur, prev, s) => {
  const cs = axisScores(cur, s), ps = axisScores(prev, s), axes = AXES.map(([id, label, icon, tab, studies, basis]) => { const c = cs[id], p = ps[id];
    return { id, label, icon, tab, studies, basis, how: HOW[id], score: c.score === null ? null : rn(c.score, 1), detail: c.detail, prev: p.score === null || !prev.length ? null : rn(p.score, 1) }; });
  const ok = axes.filter((a) => a.score !== null), pk = axes.filter((a) => a.prev !== null);
  const bal = ok.length >= 3 && cur.length >= 7 ? rn(mean(ok.map((a) => a.score)), 1) : null, balp = pk.length >= 3 && prev.length >= 7 ? rn(mean(pk.map((a) => a.prev)), 1) : null;
  const pick = (cmp) => ok.reduce((b, a) => (cmp(a.score, b.score) ? a : b)).id;
  return { axes, balance: bal, balance_prev: balp, scored: ok.length, weakest: bal !== null ? pick((a, b) => a < b) : null, strongest: bal !== null ? pick((a, b) => a > b) : null };
};
const pairs = (D, xk, yk, lag) => { const by = {}; D.forEach((d) => (by[d.day] = d)); const out = [];
  for (const d of D) { const t = by[addDays(d.day, lag)]; if (!t || d[xk] == null || t[yk] == null) continue; out.push([d[xk], t[yk]]); } return out; };
const weekly = (D) => { const wk = {}; for (const d of D) (wk[mondayOf(d.day)] ||= []).push(d); const rows = [];
  for (const k of Object.keys(wk).sort()) { const L = wk[k]; if (L.length < 7) continue; const m = (key) => mean(L.filter((x) => x[key] != null).map((x) => x[key]));
    rows.push({ day: k, ex_min: sum(L, (x) => x.ex_min), sys: m("sys"), sleep_h: m("sleep_h"), intake: m("intake"), water: m("water"), weight: m("weight"), logged: [] }); } return rows; };
const lcw = (w) => { const t = w.slice(0, 2); return t === t.toUpperCase() && t !== t.toLowerCase() ? w : w[0].toLowerCase() + w.slice(1); };
function hypResult(h, D) {
  const [xl, xu] = METRICS[h.x], [yl, yu, yd] = METRICS[h.y], scope = h.scope || "day";
  const pts = scope === "week" ? pairs(weekly(D), h.x, h.y, 0) : pairs(D, h.x, h.y, h.lag);
  const c = pts.length >= 3 ? correlate(pts.map((p) => p[0]), pts.map((p) => p[1])) : { n: pts.length, r: null };
  const out = { id: h.id, title: h.title, why: h.why, x: h.x, y: h.y, lag: h.lag, scope, xlabel: `${xl} (${xu})` + (scope === "week" ? " - weekly total" : ""),
    ylabel: `${yl} (${yu})` + (scope === "week" ? " - weekly mean" : ""), when: scope === "day" ? (h.lag === 0 ? "same day" : "next day") : "same week",
    expected: h.expected, studies: h.studies, n: c.n, conf: confidence(scope === "day" ? c.n : c.n * 2), pts: pts.slice(-150).map(([a, b]) => [r2(a), r2(b)]) };
  const needN = scope === "week" ? 6 : MIN_N, unitW = scope === "week" ? "weeks" : "days";
  if (c.n < needN || c.r === null) { Object.assign(out, { plain: "Not enough days logged yet to say anything.", status: "need_data", text: `Needs about ${Math.max(needN - c.n, 1)} more paired ${unitW} of both measures before a pattern can be tested. You have ${c.n}.` }); return out; }
  const { r, p, slope } = c, agree = r > 0 === h.expected > 0;
  const status = p < .05 ? (agree ? "supports" : "contradicts") : p < .20 && Math.abs(r) >= .25 ? "trend" : "none";
  const direction = r > 0 ? "higher" : "lower"; let eff = "";
  if (slope !== null && Math.abs(r) >= .15) { const ux = { sleep_h: 1, ex_min: 30, water: 500 }[h.x] || 1, v = slope * ux;
    eff = ` Roughly ${sg(v, Math.abs(v) >= 1 ? yd : 2)} ${yu} in ${lcw(yl)} for every ${ux} ${xu} of ${lcw(xl)}.`; }
  const verdicts = { supports: "Your data agrees with the published evidence.", contradicts: "Your data points the opposite way to the published evidence; check your logging or treat as personal quirk.",
    trend: "A possible pattern, not yet statistically solid.", none: "No clear link in your data yet (this does not disprove the study; you may need more days)." };
  const timing = { "same day": "that same day", "next day": "the next day", "same week": "that same week" }[out.when];
  out.plain = status !== "none" ? `When your ${lcw(xl)} goes up, your ${lcw(yl)} tends to go ${r > 0 ? "up" : "down"} ${timing}. The link is ${strength(r)}.` : "Your numbers do not show a clear connection yet.";
  Object.assign(out, { status, r: rn(r, 3), p: rn(p, 4), ci: c.ci ? c.ci.map((v) => r2(v)) : null, pearson: c.pearson !== null ? rn(c.pearson, 3) : null, strength: strength(r),
    slope: slope !== null ? rn(slope, 4) : null, intercept: c.intercept !== null ? rn(c.intercept, 3) : null,
    text: `More ${lcw(xl)} goes with ${direction} ${lcw(yl)} (${strength(r)}, rho ${sg(r, 2)}, p ${p < .001 ? "<0.001" : fx(p, 3)}, n ${c.n}).${eff} ${verdicts[status]}` });
  return out;
}
function matrix(D) {
  const cells = [];
  MATRIX_IDS.forEach((a, i) => { for (const b of MATRIX_IDS.slice(i + 1)) { const pts = D.filter((d) => d[a] != null && d[b] != null).map((d) => [d[a], d[b]]);
    const c = pts.length >= MIN_N ? correlate(pts.map((p) => p[0]), pts.map((p) => p[1])) : { n: pts.length, r: null };
    cells.push({ a, b, n: pts.length, r: c.r === null ? null : rn(c.r, 3), p: c.p == null ? null : c.p, pts: c.r !== null ? pts.slice(-120).map(([x, y]) => [r2(x), r2(y)]) : [] }); } });
  const q = bhFdr(cells.map((c) => c.p));
  cells.forEach((c, i) => { const qq = q[i]; c.q = qq === null ? null : rn(qq, 4); c.p = c.p === null ? null : rn(c.p, 4); c.sig = qq !== null && qq < .10; });
  return { metrics: MATRIX_IDS.map((m) => ({ id: m, label: METRICS[m][0], unit: METRICS[m][1] })), cells };
}
function energy(D, s) {
  const F = D.filter((d) => d.intake !== null && d.intake >= 800), W = []; D.forEach((d, i) => { if (d.weight !== null) W.push([i, d.weight]); });
  if (D.length < 14 || F.length < Math.max(7, .6 * D.length) || W.length < 2)
    return { ready: false, text: "To compare calories with the scale, log food on most days for two weeks or more and weigh in at least twice.", food_days: F.length, weigh_ins: W.length, days: D.length };
  const tdee = bmrOf(s.kg, s.height_cm, s.age, s.sex) * 1.2, net = sum(F, (d) => d.intake - tdee - d.ex_kcal) / F.length;
  const [i0, w0] = W[0], [i1, w1] = W[W.length - 1], span = Math.max(1, i1 - i0), pred = (net * span) / 7700, act = w1 - w0;
  return { ready: true, net_per_day: Math.round(net), predicted_kg: r2(pred), actual_kg: r2(act), span_days: span, food_days: F.length, weigh_ins: W.length, days: D.length,
    text: `What you logged eating, minus what you burn, averages ${sg(net, 0)} kcal a day. Over ${span} days that would predict about ${sg(pred)} kg, and the scale actually moved ${sg(act)} kg. Gaps are normal: water weight, forgotten food logs and your body adapting all play a part.` };
}
function insights(rd, hyps, en, cov) {
  const items = [], ax = {}; rd.axes.forEach((a) => (ax[a.id] = a));
  if (rd.balance === null) items.push({ kind: "info", text: "Log at least three kinds of data (for example rides, sleep and food) to unlock your balance index.", tab: "dashboard" });
  else {
    if (rd.balance_prev !== null) { const diff = rd.balance - rd.balance_prev, move = Math.abs(diff) < 1 ? "about the same as" : `${diff > 0 ? "up" : "down"} ${fx(Math.abs(diff), 0)} points on`;
      items.push({ kind: diff >= 2 ? "good" : diff <= -2 ? "warn" : "info", text: `Your overall balance is ${fx(rd.balance, 0)} out of 100, ${move} the previous period.`, tab: "dashboard" }); }
    if (rd.weakest) { const w = ax[rd.weakest]; items.push({ kind: "warn", text: `Weakest link: ${w.label} (${fx(w.score, 0)}). ${w.how}`, tab: w.tab }); }
    if (rd.strongest) { const st = ax[rd.strongest]; items.push({ kind: "good", text: `Strongest area: ${st.label} (${fx(st.score, 0)}). Keep it steady while you lift the weaker areas.`, tab: st.tab }); }
  }
  for (const h of hyps) if (["supports", "contradicts", "trend"].includes(h.status)) {
    const tail = { supports: "Your data agrees with the research.", contradicts: "Your data goes the other way from the research.", trend: "A possible pattern, not solid yet." }[h.status];
    items.push({ kind: { supports: "good", contradicts: "warn", trend: "info" }[h.status], text: `${h.title}: ${h.plain || ""} ${tail}`, tab: "analytics" }); }
  if (en.ready) items.push({ kind: "info", text: en.text, tab: "food" });
  const low = Object.keys(cov).filter((k) => k !== "days" && cov[k] < 5);
  if (low.length && cov.days >= 7) { const names = { sleep: "sleep", food: "food", water: "water", weight: "weight", bp: "blood pressure", exercise: "exercise" };
    items.push({ kind: "info", text: "More data sharpens every result. Thin trackers right now: " + low.map((k) => names[k]).join(", ") + ".", tab: "dashboard" }); }
  return items;
}
const qplus = (s) => encodeURIComponent(s).replace(/%20/g, "+");
function analyze(daily, s, period, today) {
  const cut = addDays(today, -period), cutp = addDays(today, -2 * period);
  const cur = daily.filter((d) => d.day > cut), prev = daily.filter((d) => d.day > cutp && d.day <= cut), cnt = (f) => cur.filter(f).length;
  const cov = { days: cur.length, exercise: cnt((d) => d.ex_min), food: cnt((d) => d.intake !== null), water: cnt((d) => d.water !== null), sleep: cnt((d) => d.sleep_h !== null), weight: cnt((d) => d.weight !== null), bp: cnt((d) => d.sys !== null) };
  const rd = radar(cur, prev, s), hyps = HYPOTHESES.map((h) => hypResult(h, cur)), en = energy(cur, s);
  const used = new Set([...rd.axes.flatMap((a) => a.studies), ...hyps.flatMap((h) => h.studies)]);
  const keep = ["day", "ex_min", "ride_kmh", "intake", "protein", "water", "sleep_h", "sleep_q", "weight", "sys", "dia", "pulse"], studies = {};
  [...used].sort().forEach((k) => { if (STUDIES[k]) { const c = STUDIES[k].cite; studies[k] = { ...STUDIES[k], search: "https://pubmed.ncbi.nlm.nih.gov/?term=" + qplus(c.includes(". ") ? c.split(". ")[1] : c) }; } });
  const metrics = {}; for (const k in METRICS) metrics[k] = { label: METRICS[k][0], unit: METRICS[k][1], dec: METRICS[k][2] };
  return { period, today, coverage: cov, radar: rd, matrix: matrix(cur), hypotheses: hyps, energy: en, insights: insights(rd, hyps, en, cov), metrics,
    daily: cur.map((d) => { const o = {}; keep.forEach((k) => (o[k] = k === "day" || d[k] === null ? d[k] : r2(d[k]))); return o; }), studies };
}
function reportMd(out, s) {
  const f = (v, d = 1) => (v == null ? "n/a" : v.toFixed(d)), L = [], A = (x) => L.push(x);
  A("# STRIDE advanced analytics report");
  A(`Generated for ${out.today}. Window: last ${out.period} days. Data is the person's own logs.`);
  A("\n## Instructions for the AI reading this");
  A("You are a careful health-data analyst. Use only the numbers below. Explain findings in plain language, separate strong evidence from weak, do not claim causation (this is one person's observational log), flag logging gaps, and give 3 to 5 practical next steps. This is educational, not medical advice; suggest a clinician for anything concerning (especially blood pressure).");
  A("\n## Profile");
  A(`Age ${s.age}, sex ${s.sex}, height ${s.height_cm} cm, body weight ${s.kg} kg, goal weight ${s.goal_kg}, weekly activity goal ${s.goal_min} min, calorie goal ${s.kcal_goal} kcal, water goal ${s.water_goal} ml, macro split P${s.macro_protein}/C${s.macro_carbs}/F${s.macro_fat} %.`);
  const c = out.coverage;
  A("\n## Data coverage (days with data in window)");
  A(`Days ${c.days}; exercise ${c.exercise}; food ${c.food}; water ${c.water}; sleep ${c.sleep}; weigh-ins ${c.weight}; blood pressure ${c.bp}. Missing days are excluded, not zero.`);
  const R = out.radar;
  A("\n## Balance score (0-100)");
  A(`Overall balance: ${f(R.balance)} (previous period ${f(R.balance_prev)}). Weakest: ${R.weakest}. Strongest: ${R.strongest}.`);
  A("\n| Area | Score | Previous | Basis | What the score means | How to improve |\n|---|---|---|---|---|---|");
  for (const a of R.axes) A(`| ${a.label} | ${f(a.score, 0)} | ${f(a.prev, 0)} | ${a.basis} | ${a.detail} | ${a.how} |`);
  A("\n## Key insights"); for (const i of out.insights) A(`- [${i.kind}] ${i.text}`);
  A("\n## Research hypotheses tested on this person's data");
  A("Method: Spearman rank correlation, two-sided p, 95% CI; status supports/contradicts = p<0.05 vs. the published direction; trend = p<0.20 and |rho|>=0.25.\n");
  for (const h of out.hypotheses) {
    A(`### ${h.title}  [${h.status}]`); A(`- Timing: ${h.when}; paired observations n=${h.n}; confidence: ${h.conf}`);
    if (h.r != null) A(`- rho ${sg(h.r, 2)}, p ${h.p}, 95% CI [${h.ci ? h.ci.join(", ") : "None"}], strength ${h.strength}, expected sign ${h.expected > 0 ? "+" : "-"}`);
    A(`- Plain result: ${h.plain}`); A(`- Detail: ${h.text}`); A(`- Why researchers expect it: ${h.why}`); A(`- Studies: ${h.studies.join(", ")}\n`);
  }
  const M = out.matrix, lab = {}; M.metrics.forEach((m) => (lab[m.id] = m.label));
  A("## Same-day correlation matrix (Spearman; q = Benjamini-Hochberg adjusted)");
  A("| Pair | rho | n | p | q | Survives correction |\n|---|---|---|---|---|---|");
  for (const x of M.cells) if (x.r !== null) A(`| ${lab[x.a]} vs ${lab[x.b]} | ${sg(x.r, 2)} | ${x.n} | ${f(x.p, 3)} | ${f(x.q, 3)} | ${x.sig ? "yes" : "no"} |`);
  const E = out.energy;
  A("\n## Calories in vs. the scale"); A(E.text + (E.ready ? ` (net ${E.net_per_day >= 0 ? "+" : ""}${E.net_per_day} kcal/day, predicted ${sg(E.predicted_kg, 1)} kg, actual ${sg(E.actual_kg, 1)} kg)` : ""));
  A("\n## Evidence library");
  for (const k in out.studies) { const v = out.studies[k]; A(`- **${v.inst}** (${v.kind || ""}): ${v.cite} Finding: ${v.finding} Plain: ${v.plain || ""}`); }
  const keys = ["day", "ex_min", "ride_kmh", "intake", "protein", "water", "sleep_h", "sleep_q", "weight", "sys", "dia", "pulse"];
  A("\n## Daily data (blank = not logged)");
  A("Units: ex_min minutes, ride_kmh km/h, intake kcal, protein g, water ml, sleep_h hours, sleep_q 1-5, weight kg, sys/dia mmHg, pulse bpm.\n");
  A("| " + keys.join(" | ") + " |\n|" + "---|".repeat(keys.length));
  for (const d of out.daily) A("| " + keys.map((k) => (d[k] == null ? "" : String(d[k]))).join(" | ") + " |");
  A("\n## Limits\nObservational single-person data; correlation is not causation; small samples (<14 pairs) are preliminary; citations written from memory of the papers, verify before relying on numbers.");
  return L.join("\n");
}

/* ---------- report extras (port of report_extras.py) ---------- */
const XM = ["ex_min", "ride_kmh", "intake", "protein", "water", "sleep_h", "sleep_q", "weight", "sys", "dia", "pulse"];
const XL = { ex_min: "Exercise min", ride_kmh: "Ride km/h", intake: "Intake kcal", protein: "Protein g", water: "Water ml", sleep_h: "Sleep h", sleep_q: "Sleep quality", weight: "Weight kg", sys: "Systolic", dia: "Diastolic", pulse: "Pulse" };
const XADD = "Extra rules: treat days marked no_entry as missing, never as zero. Days marked 'rest' are real rest days. Check the Data-quality flags before trusting any number; say when a value may be a default, copy or estimate. Use the Goal reality check before praising or criticising progress. Lead with ONE top priority, then supporting findings, then a confidence level (low/medium/high) based on the n shown. Answer the person's own questions first if listed.";
const xf = (v, nd = 1) => (v == null ? "-" : nd ? v.toFixed(nd).replace(/0+$/, "").replace(/\.$/, "") : v.toFixed(0));
const xwin = (data, end, days, off = 0) => { const hi = addDays(end, -off), lo = addDays(hi, -(days - 1)), o = {}; for (const d in data) if (d >= lo && d <= hi) o[d] = data[d]; return o; };
const xvals = (win, m) => Object.values(win).filter((r) => r[m] != null).map((r) => r[m]);
const xslope = (win, m) => { const pts = Object.keys(win).filter((d) => win[d][m] != null).sort().map((d) => [diffDays(d, "1970-01-01"), win[d][m]]); if (pts.length < 3) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1])), den = sum(pts, (p) => (p[0] - mx) ** 2); return den === 0 ? null : (sum(pts, (p) => (p[0] - mx) * (p[1] - my)) / den) * 7; };
const xbmr = (p) => { const { weight_kg: w, height_cm: h, age: a } = p; if (!(w && h && a)) return null; return 10 * w + 6.25 * h - 5 * a + (String(p.sex || "").toLowerCase().startsWith("m") ? 5 : -161); };
const xex = (row, w) => { if (!row.ex_min || !w) return 0; const v = row.ride_kmh, met = v == null || v < 16 ? 6 : v < 19.3 ? 8 : v < 22.5 ? 10 : 12; return (met * w * row.ex_min) / 60; };
function buildExtras(p, rows, end, changes, questions) {
  const data = {};
  for (const r of rows) {
    const row = {}; XM.forEach((m) => (row[m] = r[m] == null || r[m] === "" ? null : Number(r[m]))); row.estimated = new Set(r.estimated || []);
    const others = XM.some((m) => m !== "ex_min" && row[m] != null), ex = row.ex_min; let status, basis;
    if (["logged", "rest", "no_entry"].includes(r.status)) { status = r.status; basis = "explicit"; }
    else if (ex && ex > 0) { status = "logged"; basis = "inferred"; }
    else if (ex === 0 && others) { status = "rest"; basis = "inferred (0 min but other data logged)"; }
    else if (ex === 0) { status = r.day >= end ? "no_entry" : "rest"; basis = "inferred (0 min, nothing else logged" + (r.day >= end ? ", report day = probably unfilled)" : "; could be unfilled)"); }
    else [status, basis] = others ? ["logged", "inferred"] : ["no_entry", "inferred"];
    if (status === "no_entry") row.ex_min = null; row.status = status; row.basis = basis; data[r.day] = row;
  }
  const w = p.weight_kg, bmr = xbmr(p);
  const status = ["## Day status (logged / rest / no_entry)", "no_entry days are missing data, not zero. 'explicit' = set by the person in the app.", "", "| day | status | basis | metrics logged |", "|---|---|---|---|"];
  for (const d of Object.keys(xwin(data, end, 14)).sort()) status.push(`| ${d} | ${data[d].status} | ${data[d].basis} | ${XM.filter((m) => data[d][m] != null).length}/${XM.length} |`);
  const w28 = xwin(data, end, 28), p28 = xwin(data, end, 28, 28), w90 = xwin(data, end, 90);
  const hist = ["## History and trends (last 28 d vs previous 28 d vs 90 d)", "Averages use logged days only. Slope = change per week (needs 3+ points). n = data points.", "",
    "| metric | last 28d avg (n) | previous 28d avg (n) | 90d avg (n) | 90d slope/wk |", "|---|---|---|---|---|"];
  const cell = (v) => (v.length ? `${xf(mean(v))} (${v.length})` : "- (0)");
  for (const m of XM) hist.push(`| ${XL[m]} | ${cell(xvals(w28, m))} | ${cell(xvals(p28, m))} | ${cell(xvals(w90, m))} | ${xf(xslope(w90, m), 2)} |`);
  const goals = ["## Goal reality check"], h = p.height_cm, gw = p.goal_weight;
  const active = Object.values(w28).filter((r) => ["logged", "rest"].includes(r.status)), exAvg = active.length && w ? mean(active.map((r) => xex(r, w))) : 0, maint = bmr ? bmr * 1.2 + exAvg : null;
  if (bmr) { goals.push(`- Estimated BMR (Mifflin-St Jeor): ${xf(bmr, 0)} kcal. Estimated maintenance (BMR x1.2 + avg logged exercise ${xf(exAvg, 0)} kcal/day): ${xf(maint, 0)} kcal. These are estimates (+/-10%).`);
    const cg = p.calorie_goal; if (cg) { const gap = maint - cg, flag = cg < bmr ? "BELOW BMR - too low to sustain" : gap > 1000 ? "VERY steep deficit (>1000)" : gap > 750 ? "steep deficit (>750)" : gap > 0 ? "reasonable (<=750)" : "at/above maintenance";
      goals.push(`- Calorie goal ${xf(cg, 0)} kcal = deficit of about ${xf(gap, 0)} kcal/day vs maintenance: ${flag}.`); } }
  if (w && h && gw) { const hm = h / 100; goals.push(`- Goal weight ${fx(gw)} kg = BMI ${fx(gw / hm ** 2)} (current BMI ${fx(w / hm ** 2)}). Asia-Pacific healthy max weight at this height: ${fx(22.9 * hm ** 2)} kg; general 24.9: ${fx(24.9 * hm ** 2)} kg.`);
    const rem = w - gw; goals.push(`- Remaining to goal: ${fx(rem)} kg. At 0.25-0.5 kg/week that is about ${fx(rem / 0.5, 0)}-${fx(rem / 0.25, 0)} weeks.`);
    if (p.target_date) { const wks = Math.max(diffDays(p.target_date, end) / 7, 0.1), req = rem / wks; goals.push(`- Target date ${p.target_date}: needs ${fx(req, 2)} kg/week -> ${req > 1 ? "unrealistic (>1)" : req > 0.5 ? "aggressive (>0.5)" : "realistic"}.`); }
    else goals.push("- No target date set, so required weekly rate cannot be checked."); }
  if (p.start_weight && w) goals.push(`- Started ${fx(p.start_weight)} kg` + (p.start_date ? ` on ${p.start_date}` : "") + `; change so far ${sg(w - p.start_weight)} kg.`);
  const obs = xslope(xwin(data, end, 90), "weight"); goals.push(`- Observed weight trend (90d): ${xf(obs, 2)} kg/week` + (obs !== null ? "" : " (needs 3+ weigh-ins)") + ".");
  const cg = p.calorie_goal, wg = p.water_goal, der = ["## Derived daily numbers (pre-computed)", "Energy balance = intake - (BMR x1.2 + exercise kcal); estimate only, blank when intake not logged. Roll7 = 7-day average intake over logged days.", "",
    "| day | status | protein g/kg | kcal % of goal | est. burn | energy balance | roll7 intake |", "|---|---|---|---|---|---|---|"];
  const hits = { "calories within +/-10% of goal": [0, 0], "protein >=1.2 g/kg": [0, 0], "water >= goal": [0, 0], "sleep >=7 h": [0, 0] };
  for (const d of Object.keys(xwin(data, end, 28)).sort()) { const r = data[d];
    const pk = r.protein != null && w ? r.protein / w : null, pct = r.intake != null && cg ? (r.intake / cg) * 100 : null, burn = bmr && r.status !== "no_entry" ? bmr * 1.2 + xex(r, w) : null;
    const bal = burn !== null && r.intake != null ? r.intake - burn : null, roll = Object.keys(data).filter((k) => k >= addDays(d, -6) && k <= d && data[k].intake != null).map((k) => data[k].intake);
    if (d >= addDays(end, -13)) der.push(`| ${d} | ${r.status} | ${xf(pk, 2)} | ${xf(pct, 0)} | ${xf(burn, 0)} | ${xf(bal, 0)} | ${xf(roll.length ? mean(roll) : null, 0)} |`);
    for (const [k, ok, has] of [["calories within +/-10% of goal", pct !== null && pct >= 90 && pct <= 110, pct !== null], ["protein >=1.2 g/kg", pk !== null && pk >= 1.2, pk !== null],
      ["water >= goal", !!(wg && r.water != null && r.water >= wg), r.water != null], ["sleep >=7 h", r.sleep_h != null && r.sleep_h >= 7, r.sleep_h != null]]) if (has) { hits[k][1]++; hits[k][0] += ok ? 1 : 0; } }
  der.push("", "Goals hit (last 28 days, logged days only):", ...Object.entries(hits).map(([k, [a, n]]) => `- ${k}: ${a}/${n}`));
  if (p.weekly_goal_min) der.push(`- Exercise last 7 days: ${fx(sum(Object.values(xwin(data, end, 7)), (r) => r.ex_min || 0), 0)} min vs goal ${fx(p.weekly_goal_min, 0)} min (raw minutes, no intensity weighting).`);
  const qual = ["## Data-quality flags", "Possible defaults, copied values or implausible entries. Verify before drawing conclusions.", ""], flags = [];
  for (const m of ["ex_min", "ride_kmh", "intake", "protein", "water", "weight"]) { const v = xvals(w28, m);
    if (v.length >= 3 && new Set(v.map((x) => rn(x, 1))).size === 1) flags.push(`${XL[m]} is identical (${xf(v[0])}) on all ${v.length} logged days: default or copied?`);
    else if (m === "weight" && v.length === 2 && v[0] === v[1]) flags.push(`Weight identical (${xf(v[0])}) on both weigh-ins: re-measured or copied?`); }
  for (const d of Object.keys(w28).sort()) { const r = w28[d];
    if (r.intake != null && (r.intake < 800 || r.intake > 6000)) flags.push(`${d}: intake ${fx(r.intake, 0)} kcal looks implausible or partial logging.`);
    if (r.intake && r.protein && r.protein * 4 > 0.6 * r.intake) flags.push(`${d}: protein is over 60% of calories, check entries.`);
    if (r.sleep_h != null && (r.sleep_h < 3 || r.sleep_h > 14)) flags.push(`${d}: sleep ${r.sleep_h} h is unusual.`);
    if (r.sys != null && (r.sys < 70 || r.sys > 250 || (r.dia != null && r.dia >= r.sys))) flags.push(`${d}: BP ${xf(r.sys, 0)}/${xf(r.dia, 0)} looks like an entry error.`);
    if (r.estimated.size) flags.push(`${d}: estimated values (not measured): ${[...r.estimated].sort().join(", ")}.`); }
  const ws = Object.keys(data).sort().filter((d) => data[d].weight != null).map((d) => [d, data[d].weight]);
  for (let i = 0; i + 1 < ws.length; i++) { const [d1, a] = ws[i], [d2, b] = ws[i + 1], dd = diffDays(d2, d1); if (dd <= 3 && Math.abs(b - a) > 2) flags.push(`Weight changed ${sg(b - a)} kg in ${dd} d (${d1} to ${d2}): scale/entry error or fluid shift?`); }
  const nbp = Object.values(w28).filter((r) => r.sys != null).length; if (nbp < 3) flags.push(`Only ${nbp} BP reading(s) in 28 days: not enough to call a pattern.`);
  qual.push(...(flags.length ? flags.map((x) => "- " + x) : ["- No flags raised."]));
  const parts = [status, hist, goals, der, qual];
  if (changes.length) parts.push(["## Goal change log", ...changes.map(([d, f, o, n]) => `- ${d}: ${f} ${o} -> ${n}`)]);
  if (questions.length) parts.push(["## The person's questions (answer these first)", ...questions.map((q) => "- " + q)]);
  parts.push(["## Extra AI rules", XADD]);
  return parts.map((x) => x.join("\n")).join("\n\n") + "\n";
}

/* ---------- API routes ---------- */
const routes = [], R = (method, re, fn, auth = "user") => routes.push({ method, re: new RegExp("^/api/" + re + "$"), fn, auth });
const USER_RE = /^[A-Za-z0-9_.-]{3,32}$/, MIN_PW = 6;
const badUser = (n, role) => (!USER_RE.test(n) ? "Username must be 3-32 characters: letters, numbers, dot, dash or underscore." : !["admin", "user"].includes(role) ? "Role must be admin or user." : null);
const badPw = (pw) => (pw.length < MIN_PW ? `Password must be at least ${MIN_PW} characters.` : null);
const adminCount = () => DB.users.filter((u) => u.role === "admin").length;
const nameTaken = (n, exceptId) => DB.users.some((u) => u.id !== exceptId && u.username.toLowerCase() === n.toLowerCase());
const del = (t, id, uid) => { const i = DB[t].findIndex((r) => r.id === id && r.user_id === uid); if (i >= 0) DB[t].splice(i, 1); };
const OK = async () => { await save(); return J({ ok: true }); };
const byDayIdDesc = (a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.id - a.id);

R("POST", "login", async ({ b }) => {
  const name = String(b.username || "").trim(), u = DB.users.find((x) => x.username.toLowerCase() === name.toLowerCase());
  if (!u || !(await checkPw(u.pw, String(b.password || "")))) return J({ ok: false, error: "Wrong username or password." }, 401);
  localStorage.setItem(SKEY, JSON.stringify({ uid: u.id, username: u.username, role: u.role })); return J({ ok: true });
}, "none");
R("POST", "logout", async () => { localStorage.removeItem(SKEY); return J({ ok: true }); }, "none");
R("POST", "me/password", async ({ user, b }) => {
  if (!(await checkPw(user.pw, String(b.current || "")))) return J({ ok: false, error: "Current password is wrong." }, 400);
  const err = badPw(String(b.new || "")); if (err) return J({ ok: false, error: err }, 400);
  user.pw = await mkPw(b.new); return OK();
});
R("GET", "users", async ({ user }) => J({ users: DB.users.map((u) => ({ id: u.id, username: u.username, role: u.role, created: u.created, rides: DB.rides.filter((r) => r.user_id === u.id).length })), me: user.id }), "admin");
R("POST", "users", async ({ b }) => {
  const name = String(b.username || "").trim(), role = b.role || "user", pw = String(b.password || ""), err = badUser(name, role) || badPw(pw);
  if (err) return J({ ok: false, error: err }, 400); if (nameTaken(name)) return J({ ok: false, error: "That username is already taken." }, 409);
  DB.users.push({ id: nid("users"), username: name, pw: await mkPw(pw), role, created: todayStr() }); return OK();
}, "admin");
R("PUT", "users/(\\d+)", async ({ b, m, user }) => {
  const id = +m[1], u = DB.users.find((x) => x.id === id); if (!u) return J({ ok: false, error: "User not found." }, 404);
  const name = String(b.username ?? u.username).trim(), role = b.role ?? u.role, pw = String(b.password || ""), err = badUser(name, role) || (pw ? badPw(pw) : null);
  if (err) return J({ ok: false, error: err }, 400);
  if (u.role === "admin" && role !== "admin" && adminCount() <= 1) return J({ ok: false, error: "There must be at least one admin." }, 400);
  if (nameTaken(name, id)) return J({ ok: false, error: "That username is already taken." }, 409);
  u.username = name; u.role = role; if (pw) u.pw = await mkPw(pw);
  if (id === user.id) localStorage.setItem(SKEY, JSON.stringify({ uid: u.id, username: u.username, role: u.role }));
  return OK();
}, "admin");
R("DELETE", "users/(\\d+)", async ({ m, user }) => {
  const id = +m[1], u = DB.users.find((x) => x.id === id); if (!u) return J({ ok: false, error: "User not found." }, 404);
  if (id === user.id) return J({ ok: false, error: "You can't delete your own account." }, 400);
  if (u.role === "admin" && adminCount() <= 1) return J({ ok: false, error: "There must be at least one admin." }, 400);
  for (const t of ["rides", "presets", "food", "water", "pickleball", "weight", "bp", "sleep", "goal_changes"]) DB[t] = DB[t].filter((r) => r.user_id !== id);
  delete DB.user_settings[id]; delete DB.day_status[id]; DB.users = DB.users.filter((x) => x.id !== id); return OK();
}, "admin");

R("GET", "data", async ({ user, uid }) => {
  const s = getSettings(uid), rows = mine("rides", uid).sort(byDayIdDesc);
  return J({ presets: mine("presets", uid).sort((a, b) => a.id - b.id), settings: s, unmapped: rows.filter((r) => r.geom == null && r.s_lat == null).length,
    user: { username: user.username, role: user.role }, rides: rows.map((r) => enrich(r, s)), a: dashAnalytics(rows, s) });
});
R("GET", "map", async ({ uid }) => {
  const s = getSettings(uid);
  return J(mine("rides", uid).filter((r) => r.geom != null || (r.s_lat != null && r.e_lat != null)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)).map((r) => {
    const e = enrich(r, s); return { id: r.id, day: r.day, route: r.route, km: r.km, kmh: e.kmh, kcal: e.kcal_best, geom: r.geom ? JSON.parse(r.geom) : [[r.s_lat, r.s_lng], [r.e_lat, r.e_lng]] }; }));
});
R("POST", "preset", async ({ uid, b }) => { DB.presets.push({ id: nid("presets"), user_id: uid, name: b.name, s_lat: b.s_lat, s_lng: b.s_lng, e_lat: b.e_lat, e_lng: b.e_lng, km: b.km, elev: b.elev || 0 }); return OK(); });
R("DELETE", "preset/(\\d+)", async ({ uid, m }) => { del("presets", +m[1], uid); return OK(); });
R("POST", "ride", async ({ uid, b }) => {
  const s = getSettings(uid), km = Number(b.km), mins = Number(b.minutes);
  if (!(km > 0) || !(mins > 0)) return J({ ok: false, error: "Distance and time must be positive" }, 400);
  const kg = Number(b.kg || s.kg), bike = Number(b.bike_kg || s.bike_kg), load = Number(b.load_kg || s.load_kg), elev = Number(b.elev || 0), met = metFor(km / (mins / 60)), kcalMet = (met * kg * mins) / 60, [, kcalP] = physics(km, mins, kg, bike, load, elev);
  DB.rides.push({ id: nid("rides"), user_id: uid, day: b.day, route: b.route, km, minutes: mins, kg, met, kcal: kcalMet, notes: b.notes || "", bike_kg: bike, load_kg: load, elev,
    s_lat: b.s_lat ?? null, s_lng: b.s_lng ?? null, e_lat: b.e_lat ?? null, e_lng: b.e_lng ?? null, geom: b.geom ? JSON.stringify(b.geom) : null });
  await save(); return J({ ok: true, kcal: (kcalMet + kcalP) / 2, kcal_min: kcalP, kcal_max: kcalMet, met });
});
R("DELETE", "ride/(\\d+)", async ({ uid, m }) => { del("rides", +m[1], uid); return OK(); });
const syncWeight = (uid) => { const l = mine("weight", uid).sort(byDayIdDesc)[0]; if (l) (DB.user_settings[uid] ||= {}).kg = String(l.kg); return l ? l.kg : null; };
R("POST", "settings", async ({ uid, b }) => {
  const us = (DB.user_settings[uid] ||= {}), oldS = getSettings(uid), newKg = num(b.kg, 0), td = todayStr();
  if (newKg >= 20 && newKg <= 400 && newKg !== oldS.kg) { const ex = DB.weight.find((w) => w.user_id === uid && w.day === td); if (ex) ex.kg = newKg; else DB.weight.push({ id: nid("weight"), user_id: uid, day: td, kg: newKg, notes: "" }); }
  const raw = { ...us };
  for (const k in b) { const v = b[k]; if ((k in DEFAULTS || EXTRA.includes(k)) && String(v) !== "") {
    if (EXTRA.includes(k)) { const sv = String(v); if (k === "start_weight" ? !(Number(sv) >= 20 && Number(sv) <= 400) : !/^\d{4}-\d{2}-\d{2}$/.test(sv)) continue; }
    if (GOAL_FIELDS.includes(k)) { const before = k in raw ? raw[k] : k in oldS ? String(oldS[k]) : "", a = Number(before), c = Number(v), same = isNaN(a) || isNaN(c) ? before === String(v) : a === c;
      if (!same && before !== "") DB.goal_changes.push({ id: nid("goal_changes"), user_id: uid, day: td, field: k, old: String(before), new: String(v) }); }
    us[k] = String(v); } }
  return OK();
});
R("POST", "day_status", async ({ uid, b }) => {
  const day = b.day || todayStr(), st = b.status;
  if (!validDay(day) || !["rest", "logged", "auto", "", null, undefined].includes(st)) return J({ ok: false, error: "Bad day or status." }, 400);
  const m = (DB.day_status[uid] ||= {}); if (st === "rest" || st === "logged") m[day] = st; else delete m[day]; return OK();
});

const MEALS = ["breakfast", "lunch", "dinner", "snack"], PB_FORMATS = ["doubles", "singles", "drills"], PB_MET = { casual: 3.5, recreational: 4.5, competitive: 6.0 };
const dayArg = (q) => { const d = q.get("day") || todayStr(); return validDay(d) ? d : null; };
const weekTotals = (table, col, uid, day) => { const days = lastDays(7, day), t = {}; for (const r of mine(table, uid)) if (r.day >= days[0] && r.day <= day) t[r.day] = (t[r.day] || 0) + (r[col] || 0); return days.map((d) => ({ day: d, value: t[d] || 0 })); };
const clampMacro = (v) => Math.max(0, Math.min(num(v), 2000));
R("GET", "food", async ({ uid, q }) => {
  const day = dayArg(q); if (!day) return J({ ok: false, error: "Bad date." }, 400);
  const s = getSettings(uid), all = mine("food", uid), rows = all.filter((r) => r.day === day).sort((a, b) => a.id - b.id), tot = {}; ["kcal", "protein", "carbs", "fat"].forEach((k) => (tot[k] = sum(rows, (r) => r[k] || 0)));
  const seen = new Set(), recent = []; for (const r of [...all].sort((a, b) => b.id - a.id)) { const k = r.name.toLowerCase(); if (seen.has(k)) continue; seen.add(k); recent.push({ name: r.name, meal: r.meal, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, "MAX(id)": r.id }); if (recent.length >= 12) break; }
  const bike = sum(mine("rides", uid).filter((r) => r.day === day), (r) => enrich(r, s).kcal_best), pb = sum(mine("pickleball", uid).filter((r) => r.day === day), (r) => r.kcal || 0);
  return J({ day, entries: rows, totals: tot, week: weekTotals("food", "kcal", uid, day), recent, goal: s.kcal_goal, burned: { bike, pickleball: pb }, macro: { protein: s.macro_protein, carbs: s.macro_carbs, fat: s.macro_fat } });
});
R("POST", "food", async ({ uid, b }) => {
  const day = b.day || todayStr(), name = String(b.name || "").trim().slice(0, 80), kcal = num(b.kcal, -1);
  if (!validDay(day) || !name || kcal < 0 || kcal > 10000) return J({ ok: false, error: "Enter a food name and its calories." }, 400);
  DB.food.push({ id: nid("food"), user_id: uid, day, meal: MEALS.includes(b.meal) ? b.meal : "snack", name, kcal, protein: clampMacro(b.protein), carbs: clampMacro(b.carbs), fat: clampMacro(b.fat), estimated: 0 }); return OK();
});
R("POST", "food/bulk", async ({ uid, b }) => {
  const dd = b.day || todayStr(), items = b.entries; if (!Array.isArray(items) || !items.length) return J({ ok: false, error: "No food items found." }, 400);
  let added = 0; const skipped = [];
  items.slice(0, 50).forEach((it, i) => { i++; if (!it || typeof it !== "object" || Array.isArray(it)) { skipped.push(`#${i}: not an object`); return; }
    const name = String(it.name || "").trim().slice(0, 80), kcal = num(it.kcal, -1), day = it.day || dd;
    if (!name || kcal < 0 || kcal > 10000 || !validDay(day)) { skipped.push(`#${i}: ${name || "missing name"} (check name, kcal, day)`); return; }
    const meal = String(it.meal || "").toLowerCase();
    DB.food.push({ id: nid("food"), user_id: uid, day, meal: MEALS.includes(meal) ? meal : "snack", name, kcal, protein: clampMacro(it.protein), carbs: clampMacro(it.carbs), fat: clampMacro(it.fat), estimated: 1 }); added++; });
  if (!added) return J({ ok: false, error: "Nothing imported. " + skipped.slice(0, 3).join("; ") }, 400);
  await save(); return J({ ok: true, added, skipped });
});
R("DELETE", "food/(\\d+)", async ({ uid, m }) => { del("food", +m[1], uid); return OK(); });
R("GET", "water", async ({ uid, q }) => {
  const day = dayArg(q); if (!day) return J({ ok: false, error: "Bad date." }, 400);
  const s = getSettings(uid), rows = mine("water", uid).filter((r) => r.day === day).sort((a, b) => a.id - b.id);
  return J({ day, entries: rows, total: sum(rows, (r) => r.ml), goal: s.water_goal, week: weekTotals("water", "ml", uid, day) });
});
R("POST", "water", async ({ uid, b }) => {
  const day = b.day || todayStr(), ml = num(b.ml), t = TIME_RE.test(String(b.time || "")) ? b.time : nowHM();
  if (!validDay(day) || !(ml > 0 && ml <= 5000)) return J({ ok: false, error: "Enter an amount between 1 and 5000 ml." }, 400);
  DB.water.push({ id: nid("water"), user_id: uid, day, time: t, ml }); return OK();
});
R("DELETE", "water/(\\d+)", async ({ uid, m }) => { del("water", +m[1], uid); return OK(); });
R("GET", "pickleball", async ({ uid }) => {
  const s = getSettings(uid), rows = mine("pickleball", uid).sort(byDayIdDesc), mins = sum(rows, (r) => r.minutes), wins = sum(rows, (r) => r.wins || 0), losses = sum(rows, (r) => r.losses || 0), wk = {};
  for (const r of rows) { const w = (wk[mondayOf(r.day)] ||= { minutes: 0, sessions: 0 }); w.minutes += r.minutes; w.sessions++; }
  const thisMon = mondayOf(todayStr()), weeks = []; for (let i = 7; i >= 0; i--) { const d = addDays(thisMon, -7 * i); weeks.push({ label: d.slice(5), ...(wk[d] || { minutes: 0, sessions: 0 }) }); }
  const lw = weeks[weeks.length - 1];
  return J({ sessions: rows, kg: s.kg, weeks, totals: { sessions: rows.length, minutes: mins, hours: mins / 60, kcal: sum(rows, (r) => r.kcal), wins, losses, win_rate: wins + losses ? (wins / (wins + losses)) * 100 : null, this_week: lw.minutes, this_week_sessions: lw.sessions } });
});
R("POST", "pickleball", async ({ uid, b }) => {
  const s = getSettings(uid), day = b.day || todayStr(), mins = num(b.minutes);
  if (!validDay(day) || !(mins > 0 && mins <= 600)) return J({ ok: false, error: "Enter a date and a duration between 1 and 600 minutes." }, 400);
  const fmt = PB_FORMATS.includes(b.format) ? b.format : "doubles", inten = b.intensity in PB_MET ? b.intensity : "recreational", kg = num(b.kg) || s.kg, met = PB_MET[inten], kcal = (met * kg * mins) / 60;
  DB.pickleball.push({ id: nid("pickleball"), user_id: uid, day, minutes: mins, format: fmt, intensity: inten, wins: Math.max(0, Math.trunc(num(b.wins))), losses: Math.max(0, Math.trunc(num(b.losses))), kg, met, kcal, notes: String(b.notes || "").slice(0, 200) });
  await save(); return J({ ok: true, kcal, met });
});
R("DELETE", "pickleball/(\\d+)", async ({ uid, m }) => { del("pickleball", +m[1], uid); return OK(); });
R("GET", "weight", async ({ uid }) => {
  const s = getSettings(uid), asc = mine("weight", uid).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));
  const out = { entries: [...asc].reverse(), goal: s.goal_kg, height_cm: s.height_cm, profile_kg: s.kg, stats: null };
  if (asc.length) { const last = asc[asc.length - 1], cur = last.kg, first = asc[0], cut = addDays(last.day, -30), past = asc.filter((e) => e.day <= cut), base = past.length ? past[past.length - 1] : null;
    out.stats = { current: cur, day: last.day, start: first.kg, start_day: first.day, change: cur - first.kg, low: Math.min(...asc.map((e) => e.kg)), high: Math.max(...asc.map((e) => e.kg)),
      change30: base ? cur - base.kg : null, bmi: cur / (s.height_cm / 100) ** 2, to_goal: s.goal_kg > 0 ? cur - s.goal_kg : null }; }
  return J(out);
});
R("POST", "weight", async ({ uid, b }) => {
  const day = b.day || todayStr(), kg = num(b.kg); if (!validDay(day) || !(kg >= 20 && kg <= 400)) return J({ ok: false, error: "Enter a date and a weight between 20 and 400 kg." }, 400);
  const notes = String(b.notes || "").slice(0, 200), ex = DB.weight.find((w) => w.user_id === uid && w.day === day);
  if (ex) { ex.kg = kg; ex.notes = notes; } else DB.weight.push({ id: nid("weight"), user_id: uid, day, kg, notes });
  const latest = mine("weight", uid).sort((a, b) => (a.day < b.day ? 1 : -1))[0], updated = !!(latest && latest.day === day); if (updated) syncWeight(uid);
  await save(); return J({ ok: true, profile_updated: updated, replaced: !!ex });
});
R("DELETE", "weight/(\\d+)", async ({ uid, m }) => { del("weight", +m[1], uid); const kg = syncWeight(uid); await save(); return J({ ok: true, profile_kg: kg }); });
const bpCat = (sy, di) => (sy > 180 || di > 120 ? "Crisis" : sy >= 140 || di >= 90 ? "Stage 2" : sy >= 130 || di >= 80 ? "Stage 1" : sy >= 120 ? "Elevated" : "Normal");
const bpAvg = (rows) => { if (!rows.length) return null; const sy = mean(rows.map((r) => r.sys)), di = mean(rows.map((r) => r.dia)), pl = rows.filter((r) => r.pulse).map((r) => r.pulse); return { sys: sy, dia: di, n: rows.length, category: bpCat(sy, di), pulse: pl.length ? mean(pl) : null }; };
R("GET", "bp", async ({ uid }) => {
  const rows = mine("bp", uid).sort((a, b) => (a.day !== b.day ? (a.day < b.day ? 1 : -1) : (a.time || "") !== (b.time || "") ? ((a.time || "") < (b.time || "") ? 1 : -1) : b.id - a.id)).map((r) => ({ ...r, category: bpCat(r.sys, r.dia) }));
  const td = todayStr(), within = (n) => rows.filter((r) => r.day >= addDays(td, -(n - 1)));
  return J({ entries: rows.slice(0, 500), total: rows.length, latest: rows[0] || null, avg7: bpAvg(within(7)), avg30: bpAvg(within(30)), points: rows.slice(0, 60).reverse().map((r) => ({ x: `${r.day} ${r.time || ""}`.trim(), sys: r.sys, dia: r.dia })) });
});
R("POST", "bp", async ({ uid, b }) => {
  const day = b.day || todayStr(), t = TIME_RE.test(String(b.time || "")) ? b.time : nowHM(), sy = Math.trunc(num(b.sys)), di = Math.trunc(num(b.dia)), pulse = Math.trunc(num(b.pulse)) || null;
  if (!validDay(day)) return J({ ok: false, error: "Enter a valid date." }, 400);
  if (!(sy >= 50 && sy <= 300 && di >= 30 && di <= 200) || sy <= di) return J({ ok: false, error: "Enter systolic (top) and diastolic (bottom) numbers, e.g. 120 and 80. Systolic must be higher." }, 400);
  if (pulse !== null && !(pulse >= 20 && pulse <= 250)) return J({ ok: false, error: "Pulse should be between 20 and 250 bpm, or left blank." }, 400);
  DB.bp.push({ id: nid("bp"), user_id: uid, day, time: t, sys: sy, dia: di, pulse, notes: String(b.notes || "").slice(0, 200) }); await save(); return J({ ok: true, category: bpCat(sy, di) });
});
R("DELETE", "bp/(\\d+)", async ({ uid, m }) => { del("bp", +m[1], uid); return OK(); });
R("GET", "sleep", async ({ uid }) => {
  const s = getSettings(uid), rows = mine("sleep", uid).sort(byDayIdDesc), td = todayStr(), within = (n) => rows.filter((r) => r.day >= addDays(td, -(n - 1))), goalMin = s.sleep_goal * 60;
  const out = { entries: rows.slice(0, 500), total: rows.length, goal: s.sleep_goal, latest: rows[0] || null, stats: null, week: lastDays(7, td).map((d) => ({ day: d, hours: ((rows.find((r) => r.day === d) || { minutes: 0 }).minutes) / 60 })) };
  if (rows.length) {
    const avg = (rs) => { if (!rs.length) return null; const offs = rs.map((r) => (((hmMin(r.bed) - 1080) % 1440) + 1440) % 1440), mn = mean(offs), sdv = Math.sqrt(sum(offs, (o) => (o - mn) ** 2) / offs.length);
      return { n: rs.length, minutes: mean(rs.map((r) => r.minutes)), bed: minHm(mn + 1080), wake: minHm(mean(rs.map((r) => hmMin(r.wake)))), bed_sd: sdv, debt: Math.max(0, sum(rs, (r) => goalMin - r.minutes)) }; };
    out.stats = { avg7: avg(within(7)), avg30: avg(within(30)), avg_all: avg(rows), best: rows.reduce((a, r) => (r.minutes > a.minutes ? r : a)), shortest: rows.reduce((a, r) => (r.minutes < a.minutes ? r : a)) };
  }
  return J(out);
});
R("POST", "sleep", async ({ uid, b }) => {
  const day = b.day || todayStr(), bed = String(b.bed || ""), wake = String(b.wake || "");
  if (!validDay(day)) return J({ ok: false, error: "Enter the date you woke up." }, 400);
  if (!(TIME_RE.test(bed) && TIME_RE.test(wake))) return J({ ok: false, error: "Enter both the time you went to bed and the time you woke up." }, 400);
  const bm = hmMin(bed), wm = hmMin(wake), mins = (((wm - bm) % 1440) + 1440) % 1440;
  if (mins < 30 || mins > 1200) return J({ ok: false, error: "That works out to " + (mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : "0 minutes") + " of sleep. Please check the bed and wake times." }, 400);
  let q = Math.trunc(num(b.quality)) || null; if (q !== null && !(q >= 1 && q <= 5)) q = null;
  const bedDay = addDays(day, bm > wm ? -1 : 0), notes = String(b.notes || "").slice(0, 200), ex = DB.sleep.find((x) => x.user_id === uid && x.day === day);
  if (ex) Object.assign(ex, { bed_day: bedDay, bed, wake, minutes: mins, quality: q, notes }); else DB.sleep.push({ id: nid("sleep"), user_id: uid, day, bed_day: bedDay, bed, wake, minutes: mins, quality: q, notes });
  await save(); return J({ ok: true, minutes: mins, replaced: !!ex, bed_day: bedDay });
});
R("DELETE", "sleep/(\\d+)", async ({ uid, m }) => { del("sleep", +m[1], uid); return OK(); });

const analyticsDaily = (uid, s, today, period) => {
  const span = period * 2, since = addDays(today, -(span - 1)), tabs = ["rides", "food", "water", "pickleball", "weight", "bp", "sleep"];
  const firsts = tabs.map((t) => mine(t, uid).reduce((m, r) => (m === null || r.day < m ? r.day : m), null)).filter(Boolean); if (!firsts.length) return [];
  const q = (t) => mine(t, uid).filter((r) => r.day >= since);
  return buildDaily(q("rides").map((r) => enrich(r, s)), q("pickleball"), q("food"), q("water"), q("sleep"), q("weight"), q("bp"), firsts.sort()[0], today, span);
};
const periodArg = (qs) => { const p = parseInt(qs.get("period") || "28"); return [28, 60, 90, 180].includes(p) ? p : 28; };
R("GET", "analytics", async ({ uid, q }) => { const s = getSettings(uid), td = todayStr(), p = periodArg(q), out = analyze(analyticsDaily(uid, s, td, p), s, p, td); out.demo = false; return J(out); });
R("GET", "analytics\\.csv", async ({ uid, q }) => {
  const td = todayStr(), d = analyticsDaily(uid, getSettings(uid), td, periodArg(q)), cols = ["day", "ride_km", "ride_min", "ride_kmh", "pb_min", "ex_min", "ex_kcal", "intake", "protein", "carbs", "fat", "water", "sleep_h", "sleep_q", "weight", "sys", "dia", "pulse"];
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const body = [cols.join(","), ...d.map((r) => cols.map((c) => esc(r[c] == null ? "" : typeof r[c] === "number" ? r2(r[c]) : r[c])).join(","))].join("\r\n") + "\r\n";
  return TXT(body, "text/csv", `stride_daily_${td}.csv`);
});
R("GET", "analytics\\.md", async ({ uid, q }) => {
  const s = getSettings(uid), td = todayStr(), p = periodArg(q); let md = reportMd(analyze(analyticsDaily(uid, s, td, p), s, p, td), s);
  try {
    const daily = analyticsDaily(uid, s, td, 60), status = DB.day_status[uid] || {}, est = new Set(mine("food", uid).filter((r) => r.estimated).map((r) => r.day)), raw = DB.user_settings[uid] || {};
    const changes = mine("goal_changes", uid).map((r) => [r.day, r.field, r.old, r.new]);
    const rows = daily.map((d) => { const r = {}; XM.forEach((k) => (r[k] = d[k])); const hasEx = d.ex_min > 0; r.ex_min = hasEx ? d.ex_min : 0;
      if (d.day in status) r.status = status[d.day]; else if (hasEx) r.status = "logged"; else if (!XM.some((k) => k !== "ex_min" && d[k] != null)) r.status = "no_entry";
      r.day = d.day; if (est.has(d.day)) r.estimated = ["intake", "protein"]; return r; });
    const prof = { age: s.age, sex: s.sex, height_cm: s.height_cm, weight_kg: s.kg, goal_weight: s.goal_kg || null, calorie_goal: s.kcal_goal, water_goal: s.water_goal, weekly_goal_min: s.goal_min, target_date: raw.target_date, start_date: raw.start_date };
    if (raw.start_weight) prof.start_weight = Number(raw.start_weight);
    md += "\n\n" + buildExtras(prof, rows, td, changes, q.getAll("q").map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 5));
  } catch (e) { md += `\n\n(Extra report sections unavailable: ${e.name})\n`; }
  return TXT(md, "text/markdown; charset=utf-8", `stride_ai_report_${td}.md`);
});

/* ---------- fetch interception ---------- */
async function handle(method, url, body) {
  await load(); const u = new URL(url, location.href), s = sess();
  for (const r of routes) { if (r.method !== method) continue; const m = u.pathname.match(r.re); if (!m) continue;
    const user = s ? DB.users.find((x) => x.id === s.uid) : null;
    if (r.auth !== "none") { if (!user) { localStorage.removeItem(SKEY); return J({ ok: false, error: "Please sign in." }, 401); } if (r.auth === "admin" && user.role !== "admin") return J({ ok: false, error: "Admins only." }, 403); }
    try { return await r.fn({ user, uid: user && user.id, q: u.searchParams, b: body || {}, m }); } catch (e) { console.error(e); return J({ ok: false, error: "Something went wrong: " + e.message }, 500); } }
  return J({ ok: false, error: "Not found." }, 404);
}
window.__strideHandle = handle;
window.fetch = (input, init = {}) => {
  const u = new URL(typeof input === "string" ? input : input.url, location.href);
  if (u.origin === location.origin && u.pathname.startsWith("/api/")) { let body; try { body = init.body ? JSON.parse(init.body) : undefined; } catch (_) {} return handle((init.method || "GET").toUpperCase(), u.href, body); }
  return REAL_FETCH(input, init);
};

/* ---------- page wiring: user chip, downloads, backup ---------- */
const download = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
document.addEventListener("click", async (e) => {
  const a = e.target.closest && e.target.closest('a[href^="/api/"]'); if (!a) return; e.preventDefault();
  const r = await handle("GET", a.getAttribute("href")), cd = r.headers.get("Content-Disposition") || "", name = (cd.match(/filename=(.+)/) || [])[1] || "download.txt"; download(await r.blob(), name);
});
document.addEventListener("DOMContentLoaded", () => {
  const s = sess(); if (!s) return;
  document.querySelectorAll(".who").forEach((el) => { el.textContent = s.username; el.dataset.i = s.username.slice(0, 1); });
  const ul = document.getElementById("usersLink"); if (ul && s.role === "admin") ul.style.display = "";
  if (!isLogin && !isAdminPage) {
    const box = document.createElement("div"); box.style.cssText = "position:fixed;right:10px;bottom:8px;font-size:12px;opacity:.7;z-index:5;background:var(--card,#fff);padding:2px 8px;border-radius:8px";
    box.innerHTML = 'Data stays in this browser: <a href="#" id="bkExp">export backup</a> &middot; <a href="#" id="bkImp">import</a>'; document.body.appendChild(box);
    document.getElementById("bkExp").onclick = async (e) => { e.preventDefault(); await load(); download(new Blob([JSON.stringify(DB)], { type: "application/json" }), `stride_backup_${todayStr()}.json`); };
    document.getElementById("bkImp").onclick = (e) => { e.preventDefault(); const i = document.createElement("input"); i.type = "file"; i.accept = ".json,application/json";
      i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); if (!d.users || !d.rides) throw 0; if (!confirm("Replace ALL data in this browser with the backup?")) return; await load(); DB = d; TABLES.forEach((t) => DB[t] || (DB[t] = [])); await save();
        const me = DB.users.find((u) => u.username === s.username); if (me) localStorage.setItem(SKEY, JSON.stringify({ uid: me.id, username: me.username, role: me.role })); else localStorage.removeItem(SKEY); location.reload(); } catch (_) { alert("That file is not a STRIDE backup."); } }; i.click(); };
  }
});
})();
