/* Advanced analytics tab. Uses helpers from app.js ($, api, fmt, esc) and showTab from tabs.js.
   Everything lives inside this IIFE so it cannot clash with other globals. */
(() => {
  const byId = (id) => document.getElementById(id);
  const SHORT = { activity: "Activity", intensity: "Intensity", sleep: "Sleep", hydration: "Hydration", nutrition: "Nutrition",
                  body: "Body", bp: "BP", habit: "Consistency" };
  const BASIS = { guideline: ["Guideline", "Scored against a published guideline range."],
                  goal: ["Your goal", "Scored against the target you set in Profile."],
                  heuristic: ["Rule of thumb", "A simple, transparent estimate, not a clinical standard."] };
  const TLC = { sleep_h: "#6366f1", ex_min: "#16a34a", intake: "#fc4c02", water: "#2f8cff", weight: "#8b5cf6", sys: "#e11d48",
                ride_kmh: "#f59e0b", sleep_q: "#0ea5e9", protein: "#14b8a6", pulse: "#db2777" };
  const VERDICT = { supports: ["Backs up the research", "Your own numbers match what the studies found."],
                    contradicts: ["Goes the other way", "Your numbers point opposite to the studies. One person's log can differ, so double-check your entries."],
                    trend: ["Possible pattern", "There is a hint of a link, but it is not solid yet."],
                    none: ["No clear link yet", "Your numbers do not show a connection so far. That does not disprove the study."],
                    need_data: ["Needs more days", "Log a few more days of both measures and this will be tested."] };
  const TOPICS = ["All", "Activity", "Sleep", "Hydration", "Heart", "Nutrition", "Body", "Habits"];
  const POS = "#2563eb", NEG = "#ea580c";
  const A = { topic: "All", period: 28, demo: false, data: null, sel: null, cell: null, tl: new Set(["sleep_h", "intake", "ex_min"]), smooth: true, tok: 0 };
  try { const s = JSON.parse(localStorage.getItem("ct_an") || "{}"); if ([28, 60, 90, 180].includes(s.period)) A.period = s.period; } catch (e) {}

  const f = (v, d = 0) => (v == null || !Number.isFinite(+v) ? "–" : fmt(v, d));
  const strength = (r) => { const a = Math.abs(r); return a < .1 ? "negligible" : a < .3 ? "weak" : a < .5 ? "moderate" : "strong"; };
  const pfmt = (p) => (p == null ? "–" : p < .001 ? "<0.001" : p.toFixed(3));

  /* ---------- balance ring (same markup as the dashboard rings) ---------- */
  function ring(p, label, big, sub) {
    const r = 44, c = 2 * Math.PI * r, col = p == null ? "var(--bd)" : p >= 75 ? "#16a34a" : p >= 50 ? "#d97706" : "#dc2626";
    return `<div class="dring"><div class="dring-fig">
      <svg viewBox="0 0 110 110" aria-hidden="true"><circle class="trk" cx="55" cy="55" r="${r}"/>
      <circle class="val" cx="55" cy="55" r="${r}" stroke="${col}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-off="${(c * (1 - (p || 0) / 100)).toFixed(1)}"/></svg>
      <div class="mid"><b>${big}</b><small>${sub}</small></div></div></div>`;
  }

  /* ---------- spiderweb ---------- */
  function radarSvg(R) {
    const N = R.axes.length, cx = 290, cy = 228, r0 = 142;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const P = (i, v) => [cx + Math.cos(ang(i)) * r0 * v / 100, cy + Math.sin(ang(i)) * r0 * v / 100];
    const poly = (vals) => vals.map((v, i) => P(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");
    let s = "";
    [25, 50, 75, 100].forEach((v) => { s += `<polygon class="ring${v === 75 ? " t" : ""}" points="${poly(R.axes.map(() => v))}"/>`; });
    R.axes.forEach((a, i) => { const [x, y] = P(i, 100); s += `<line class="spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; });
    [25, 50, 75, 100].forEach((v) => { const [x, y] = P(0, v); s += `<text class="tick" x="${(x + 4).toFixed(1)}" y="${(y + 3).toFixed(1)}">${v}</text>`; });
    if (R.axes.some((a) => a.prev != null)) s += `<polygon class="prv" points="${poly(R.axes.map((a) => a.prev || 0))}"/>`;
    s += `<polygon class="cur" points="${poly(R.axes.map((a) => a.score || 0))}"/>`;
    R.axes.forEach((a, i) => {
      const nd = a.score == null, [px, py] = P(i, a.score || 0), c = Math.cos(ang(i)), sn = Math.sin(ang(i)), lr = r0 + 20;
      const lx = cx + c * lr, ly = cy + sn * lr + (sn < -.6 ? -10 : sn > .6 ? 4 : -4);
      const anchor = c > .3 ? "start" : c < -.3 ? "end" : "middle";
      s += `<g class="ax${nd ? " nd" : ""}${A.sel === a.id ? " sel" : ""}" data-ax="${a.id}" role="button" tabindex="0" aria-label="${esc(a.label)} ${nd ? "no data" : f(a.score) + " out of 100"}">
        <circle class="pt${nd ? " nodata" : ""}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5.5"><title>${esc(a.label)}: ${nd ? "no data yet" : f(a.score, 1) + "/100"}</title></circle>
        <text class="n" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${esc(SHORT[a.id] || a.label)}</text>
        <text class="v" x="${lx.toFixed(1)}" y="${(ly + 15).toFixed(1)}" text-anchor="${anchor}">${nd ? "no data" : f(a.score)}</text></g>`;
    });
    return `<svg class="an-radar" viewBox="0 0 580 460" role="img" aria-label="Spiderweb of eight health scores out of 100">${s}</svg>
      <p class="an-legend"><span><i></i>This period</span>${R.axes.some((a) => a.prev != null) ? `<span><i class="p"></i>Previous period</span>` : ""}<span>Outer ring = 100</span></p>`;
  }

  function delta(a) {
    if (a.score == null || a.prev == null) return "";
    const d = a.score - a.prev;
    return Math.abs(d) < 1 ? `<small class="an-delta eq">=</small>` : `<small class="an-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(0)}</small>`;
  }

  function sideHtml(R, S) {
    const bal = R.balance, bd = bal != null && R.balance_prev != null ? bal - R.balance_prev : null;
    const sel = R.axes.find((a) => a.id === A.sel) || R.axes[0];
    const b = BASIS[sel.basis];
    return `<div class="an-bal">${ring(bal, "Balance", bal == null ? "–" : f(bal), "of 100")}
      <div><h4>Overall balance</h4><p>${bal == null ? "Needs 7+ days and at least 3 scored areas." : "Average of the areas you have data for."}</p>
      ${bd != null ? `<p>vs previous period: <span class="an-delta ${bd >= 1 ? "up" : bd <= -1 ? "down" : "eq"}">${bd >= 0 ? "+" : ""}${bd.toFixed(1)}</span></p>` : ""}</div></div>
      <div class="an-axlist">${R.axes.map((a) => `<button type="button" class="an-ax${a.id === sel.id ? " sel" : ""}" data-ax="${a.id}">
        <span>${IC(a.icon)}</span><span><b>${esc(a.label)}</b><div class="bar2"><i style="width:${a.score == null ? 0 : a.score}%"></i></div></span>
        <span style="text-align:right"><b>${a.score == null ? "–" : f(a.score)}</b> ${delta(a)}</span></button>`).join("")}</div>
      <div class="an-axd"><h4>${IC(sel.icon)} ${esc(sel.label)} <span class="an-badge" title="${esc(b[1])}">${b[0]}</span></h4>
        <p>${esc(sel.detail)}</p><p class="how"><b>To improve:</b> ${esc(sel.how)}</p>
        <div class="an-chips">${sel.studies.map((id) => S[id] ? `<button type="button" class="an-chip" data-lib="${id}" title="${esc(S[id].plain || S[id].finding)}">${esc(S[id].inst)}</button>` : "").join("")}</div>
        ${sel.tab !== "analytics" ? `<button type="button" class="an-link" data-go="${sel.tab}">Open ${esc(sel.label.toLowerCase())} tracker →</button>` : ""}</div>`;
  }

  function drawRadar() {
    const d = A.data;
    byId("anRadar").innerHTML = radarSvg(d.radar);
    byId("anSide").innerHTML = sideHtml(d.radar, d.studies);
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll("#anSide .dring .val").forEach((c) => (c.style.strokeDashoffset = c.dataset.off))));
  }

  /* ---------- scatter ---------- */
  function scatter(pts, xl, yl, W = 380, H = 230) {
    if (!pts || pts.length < 3) return "";
    const PL = 44, PR = 10, PT = 10, PB = 36;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 === x0) { x0 -= 1; x1 += 1; } if (y1 === y0) { y0 -= 1; y1 += 1; }
    const nonneg = (a) => a.every((v) => v >= 0), px = (x1 - x0) * .06, py = (y1 - y0) * .08;
    const fx0 = nonneg(xs), fy0 = nonneg(ys);
    x0 = fx0 ? Math.max(0, x0 - px) : x0 - px; x1 += px; y0 = fy0 ? Math.max(0, y0 - py) : y0 - py; y1 += py;
    const X = (v) => PL + ((v - x0) / (x1 - x0)) * (W - PL - PR), Y = (v) => H - PB - ((v - y0) / (y1 - y0)) * (H - PB - PT);
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, b) => a + (b - mx) ** 2, 0), sxy = xs.reduce((a, b, i) => a + (b - mx) * (ys[i] - my), 0);
    const sl = sxx ? sxy / sxx : 0, ic = my - sl * mx;
    const dec = (r) => (r >= 100 ? 0 : r >= 10 ? 1 : 2);
    const ticks = (lo, hi, axis) => [0, .5, 1].map((t) => {
      const v = lo + (hi - lo) * t;
      return axis === "x"
        ? `<line class="grid" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${PT}" y2="${H - PB}"/><text class="ax" x="${X(v).toFixed(1)}" y="${H - PB + 14}" text-anchor="middle">${fmt(v, dec(hi - lo))}</text>`
        : `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="ax" x="${PL - 5}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v, dec(hi - lo))}</text>`;
    }).join("");
    const dots = pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.4"><title>${fmt(p[0], 1)} / ${fmt(p[1], 1)}</title></circle>`).join("");
    const lx0 = Math.max(x0, Math.min(...xs)), lx1 = Math.max(...xs);
    return `<svg class="an-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot of ${esc(xl)} against ${esc(yl)}">${ticks(x0, x1, "x")}${ticks(y0, y1, "y")}${dots}
      <line class="fit" x1="${X(lx0).toFixed(1)}" y1="${Y(sl * lx0 + ic).toFixed(1)}" x2="${X(lx1).toFixed(1)}" y2="${Y(sl * lx1 + ic).toFixed(1)}"/>
      <text class="ax" x="${(PL + W - PR) / 2}" y="${H - 4}" text-anchor="middle">${esc(xl)}</text>
      <text class="ax" transform="translate(11 ${(PT + H - PB) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text></svg>`;
  }

  /* ---------- heat-map ---------- */
  function drawMatrix() {
    const M = A.data.matrix, ids = M.metrics.map((m) => m.id), by = {};
    M.cells.forEach((c) => { by[c.a + "|" + c.b] = c; by[c.b + "|" + c.a] = c; });
    let h = `<div class="an-hm" style="grid-template-columns:96px repeat(${ids.length},minmax(40px,1fr))"><div></div>`;
    M.metrics.forEach((m) => (h += `<div class="h">${esc(m.label)}</div>`));
    M.metrics.forEach((r) => {
      h += `<div class="h row">${esc(r.label)}</div>`;
      M.metrics.forEach((c) => {
        if (r.id === c.id) { h += `<div class="d"></div>`; return; }
        const cell = by[r.id + "|" + c.id], key = [r.id, c.id].sort().join("|");
        if (cell.r == null) { h += `<button type="button" class="c nd" disabled title="Only ${cell.n} paired days; needs 8+">·</button>`; return; }
        const pct = Math.round(Math.min(1, Math.abs(cell.r)) * 88);
        h += `<button type="button" class="c${cell.sig ? " sig" : ""}${A.cell === key ? " sel" : ""}" data-cell="${key}"
          style="background:color-mix(in srgb, ${cell.r > 0 ? POS : NEG} ${pct}%, var(--soft));${Math.abs(cell.r) > .55 ? "color:#fff;" : ""}"
          title="${esc(r.label)} vs ${esc(c.label)}: rho ${cell.r.toFixed(2)}, n ${cell.n}">${cell.r.toFixed(2).replace("0.", ".").replace("-0.", "-.")}${cell.sig ? "*" : ""}</button>`;
      });
    });
    h += `</div><div class="an-scale"><span>Move opposite</span><i></i><span>Move together</span><span>★ = unlikely to be chance · “·” = fewer than 8 matching days</span></div>`;
    byId("anHm").innerHTML = h;
    const pair = byId("anPair");
    if (!A.cell) { pair.innerHTML = `<p class="an-note">Tap any cell to see the scatter plot behind it. These are same-day links; the research cards below also test next-day effects.</p>`; return; }
    const [a, b] = A.cell.split("|"), c = by[a + "|" + b], ma = M.metrics.find((m) => m.id === a), mb = M.metrics.find((m) => m.id === b);
    pair.innerHTML = `<div class="an-pair"><div><h4>${esc(ma.label)} and ${esc(mb.label)}</h4>
      <p>These two tend to ${c.r > 0 ? "rise and fall together" : "move in opposite directions"}. The link is <b>${strength(c.r)}</b>, based on ${c.n} days.</p>
      <p class="an-note">${c.sig ? "This still holds after a strict check for chance, so it is more likely to be real." : "This could still be chance, so treat it as a hint to watch, not a finding."} Moving together does not prove one causes the other.</p>
      <p class="an-note tech">rho ${c.r.toFixed(2)} · p ${pfmt(c.p)} · adjusted q ${pfmt(c.q)}</p></div>
      <div>${scatter(c.pts, `${ma.label} (${ma.unit})`, `${mb.label} (${mb.unit})`)}</div></div>`;
  }

  /* ---------- evidence cards ---------- */
  function studyCard(id, S, withId) {
    const x = S[id];
    if (!x) return "";
    return `<article class="an-sc"${withId ? ` id="an_lib_${id}"` : ""}>
      <header><b>${esc(x.inst)}</b>${x.kind ? `<span class="an-kind">${esc(x.kind)}</span>` : ""}</header>
      <p class="plain">${esc(x.plain || x.finding)}</p>
      ${x.means ? `<p class="means"><span>What it means for you</span>${esc(x.means)}</p>` : ""}
      <details><summary>Paper details</summary><p class="cite">${esc(x.cite)}</p><p class="cite"><b>Original finding:</b> ${esc(x.finding)}</p>
        <a href="${esc(x.search)}" target="_blank" rel="noopener">Find on PubMed</a></details></article>`;
  }

  function hypHtml(h, S) {
    const studies = h.studies.filter((id) => S[id]), v = VERDICT[h.status];
    return `<article class="an-h st-${h.status}">
      <div class="an-h-top"><span class="an-st ${h.status}">${v[0]}</span><span class="an-when">${esc(h.when)} · ${h.n} ${h.scope === "week" ? "weeks" : "days"}</span></div>
      <h4>${esc(h.title)}</h4>
      <p class="an-simple">${esc(h.plain || "")}</p>
      ${h.status !== "need_data" ? `<div class="an-plot">${scatter(h.pts, h.xlabel, h.ylabel, 340, 200)}</div>` : ""}
      <p class="an-verdict">${v[1]}</p>
      <div class="an-why"><span>Why researchers expect this</span>${esc(h.why)}</div>
      <div class="an-research"><h5>The research behind it</h5>${studies.map((id) => studyCard(id, S, false)).join("")}</div>
      <details class="an-nums"><summary>Show the numbers</summary>
        <p>${esc(h.text)}</p>
        <div class="an-meta"><span>Sample: ${h.n}</span>${h.r != null ? `<span>Spearman rho ${h.r > 0 ? "+" : ""}${h.r.toFixed(2)}</span><span>95% range ${h.ci ? h.ci[0].toFixed(2) + " to " + h.ci[1].toFixed(2) : "–"}</span>` : ""}<span>${esc(h.conf)}</span></div></details></article>`;
  }

  function drawLib() {
    const S = A.data.studies, ids = Object.keys(S).filter((id) => A.topic === "All" || S[id].topic === A.topic);
    const have = new Set(Object.values(S).map((x) => x.topic));
    byId("anLibChips").innerHTML = TOPICS.filter((t) => t === "All" || have.has(t)).map((t) => `<button type="button" data-topic="${t}" class="${A.topic === t ? "on" : ""}">${t}</button>`).join("");
    byId("anLibGrid").innerHTML = ids.map((id) => studyCard(id, S, true)).join("") || `<p class="an-note">No studies in this topic.</p>`;
  }

  function energyHtml(E) {
    if (!E.ready) {
      return `<p>${esc(E.text)}</p><div class="an-stats"><div><span>Days with food</span><b>${E.food_days}</b></div><div><span>Weigh-ins</span><b>${E.weigh_ins}</b></div><div><span>Days in period</span><b>${E.days}</b></div></div>`;
    }
    return `<div class="an-stats"><div><span>Avg net energy</span><b>${E.net_per_day > 0 ? "+" : ""}${f(E.net_per_day)} kcal/day</b></div>
      <div><span>Predicted change</span><b>${E.predicted_kg > 0 ? "+" : ""}${E.predicted_kg.toFixed(1)} kg</b></div>
      <div><span>Scale change</span><b>${E.actual_kg > 0 ? "+" : ""}${E.actual_kg.toFixed(1)} kg</b></div></div><p>${esc(E.text)}</p>`;
  }

  /* ---------- timeline ---------- */
  const TL_IDS = ["sleep_h", "ex_min", "intake", "water", "weight", "sys", "ride_kmh", "sleep_q", "protein", "pulse"];
  function drawTimeline() {
    const d = A.data, M = d.metrics, rows = d.daily, W = 700, H = 250, PL = 8, PR = 8, PT = 12, PB = 24;
    byId("anTlChips").innerHTML = TL_IDS.map((id) => `<button type="button" data-tl="${id}" class="${A.tl.has(id) ? "on" : ""}" style="--c:${TLC[id]}"><i></i>${esc(M[id].label)}</button>`).join("") +
      `<button type="button" data-sm="1" class="${A.smooth ? "on" : ""}" style="--c:var(--mut)"><i></i>7-day average</button>`;
    if (rows.length < 3) { byId("anTl").innerHTML = `<p class="an-note">Not enough days yet.</p>`; return; }
    const X = (i) => PL + (i / (rows.length - 1)) * (W - PL - PR), Z0 = -2.6, Z1 = 2.6;
    const Y = (z) => PT + (1 - (Math.max(Z0, Math.min(Z1, z)) - Z0) / (Z1 - Z0)) * (H - PT - PB);
    let svg = [-2, -1, 0, 1, 2].map((z) => `<line class="${z === 0 ? "zero" : "grid"}" x1="${PL}" x2="${W - PR}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}"/>`).join("");
    [...A.tl].forEach((id) => {
      const raw = rows.map((r) => r[id]);
      const val = raw.map((v, i) => {
        if (!A.smooth) return v;
        const w = raw.slice(Math.max(0, i - 6), i + 1).filter((x) => x != null);
        return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
      });
      const ok = val.filter((v) => v != null);
      if (ok.length < 3) return;
      const m = ok.reduce((a, b) => a + b, 0) / ok.length, sd = Math.sqrt(ok.reduce((a, b) => a + (b - m) ** 2, 0) / ok.length) || 1;
      let path = "", dots = "";
      val.forEach((v, i) => {
        if (v == null) return;
        const x = X(i).toFixed(1), y = Y((v - m) / sd).toFixed(1);
        path += `${path ? "L" : "M"}${x},${y}`;
        if (!A.smooth || rows.length <= 60) dots += `<circle cx="${x}" cy="${y}" r="2.6" fill="${TLC[id]}" opacity=".85"><title>${esc(M[id].label)} ${esc(rows[i].day)}: ${fmt(raw[i] == null ? v : raw[i], M[id].dec)} ${esc(M[id].unit)}</title></circle>`;
      });
      svg += `<path d="${path}" fill="none" stroke="${TLC[id]}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity=".92"/>${dots}`;
    });
    const lab = (i) => rows[i].day.slice(5);
    svg += `<text class="ax" x="${PL}" y="${H - 6}">${lab(0)}</text><text class="ax" x="${W / 2}" y="${H - 6}" text-anchor="middle">${lab(Math.floor(rows.length / 2))}</text><text class="ax" x="${W - PR}" y="${H - 6}" text-anchor="end">${lab(rows.length - 1)}</text>
      <text class="ax" x="${PL}" y="${PT - 2}">above average</text><text class="ax" x="${W - PR}" y="${PT - 2}" text-anchor="end">each line shown against its own average</text>`;
    byId("anTl").innerHTML = `<svg class="an-tl" viewBox="0 0 ${W} ${H}" role="img" aria-label="Normalised timeline of selected metrics">${svg}</svg>`;
  }

  /* ---------- page ---------- */
  function section(id, title, sub, body, cls = "") {
    return `<section class="an-card an-sec ${cls}" id="${id}"><header><div><h3>${title}</h3><p class="sub">${sub}</p></div></header>${body}</section>`;
  }

  function render() {
    const d = A.data, S = d.studies, cov = d.coverage;
    const chip = (n, l) => `<span class="an-cov"><b>${n}</b> ${l}</span>`;
    const covHtml = `<div class="an-covs">${chip(cov.days, "days")}${chip(cov.exercise, "exercise")}${chip(cov.food, "food")}${chip(cov.water, "water")}${chip(cov.sleep, "sleep")}${chip(cov.weight, "weigh-ins")}${chip(cov.bp, "BP")}</div>`;
    const tiny = cov.days < 3 && !d.demo;
    const jumps = [["anOverview", "Overview"], ["anInsights", "Insights"], ["anPatterns", "Patterns"], ["anResearch", "Research"], ["anEnergy", "Calories"], ["anTimeline", "Timeline"], ["anLibrary", "Study library"]];
    byId("anRoot").innerHTML = `
      <div class="an-hero">
        <div class="an-hero-txt"><h1>Analytics</h1>
          <p>See how your exercise, food, water, sleep, weight and blood pressure connect, and check each pattern against published health research.</p></div>
        <div class="an-ctrl"><div class="an-seg" role="group" aria-label="Period">${[28, 60, 90, 180].map((p) => `<button type="button" data-per="${p}" class="${A.period === p ? "on" : ""}">${p} days</button>`).join("")}</div>
          <button type="button" class="ghost" data-copyrep="1">Copy AI report</button>
          <a class="ghost" href="/api/analytics.md?period=${A.period}&demo=${A.demo ? 1 : 0}" download>AI report (.md)</a>
          <a class="ghost" href="/api/analytics.csv?period=${A.period}&demo=${A.demo ? 1 : 0}" download>Export CSV</a>
          <button type="button" class="ghost" data-refresh="1" aria-label="Refresh">↻</button></div></div>
      ${tiny ? `<div class="an-banner">There is very little data in this period. Log a few days of rides, food, water, sleep, weight and blood pressure.</div>` : ""}
      <nav class="an-jump" aria-label="Jump to a section">${jumps.map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join("")}</nav>
      <div class="an-grid" id="anOverview">
        <section class="an-card an-7"><header><div><h3>Your health web</h3><p class="sub">Eight areas scored out of 100. Tap one to see why.</p></div></header><div id="anRadar"></div></section>
        <section class="an-card an-5"><div id="anSide"></div></section>
      </div>
      ${section("anInsights", "What your data is saying", "The main takeaways for this period", covHtml + `<ul class="an-ins">${d.insights.map((i) => `<li class="${i.kind}"><b class="ic">${i.kind === "good" ? "✓" : i.kind === "warn" ? "!" : "i"}</b><span>${esc(i.text)}</span>${i.tab !== "analytics" ? `<button type="button" class="an-link" data-go="${i.tab}">Open</button>` : ""}</li>`).join("")}</ul>`)}
      ${section("anPatterns", "What moves together", `How each pair of measures rises and falls together, last ${d.period} days. Blue means together, orange means opposite.`, `<div class="an-hm-wrap" id="anHm"></div><div id="anPair"></div>`)}
      ${section("anResearch", "Tested against the research", "Each card takes one published finding and checks it against your own numbers, with a plain-English summary of the studies behind it", `<div class="an-hy">${d.hypotheses.map((h) => hypHtml(h, S)).join("")}</div>`)}
      ${section("anEnergy", "Calories in vs. the scale", "Whether what you eat and burn matches what the scale shows", energyHtml(d.energy))}
      ${section("anTimeline", "Everything on one timeline", "Pick up to four measures and see how they rise and fall together", `<div class="an-tl-chips" id="anTlChips"></div><div id="anTl"></div>`)}
      ${section("anLibrary", "Study library", `${Object.keys(S).length} studies behind this page, each explained in simple words`, `<details id="anLib" class="an-libwrap" open><summary>Show or hide the studies</summary><div class="an-tl-chips an-topics" id="anLibChips"></div><div class="an-libgrid" id="anLibGrid"></div></details>`, "an-lib")}
      <section class="an-card an-sec"><header><div><h3>How to read this page</h3></div></header><div class="an-note"><ul>
        <li><b>Health web scores</b> run from 0 to 100. “Guideline” areas use published ranges, “Your goal” areas use targets from your Profile, and “Rule of thumb” areas are simple estimates.</li>
        <li><b>Together does not mean cause.</b> One person’s log shows hints, not proof. Sleep, exercise, food and stress all affect each other.</li>
        <li><b>Small samples mislead.</b> Results with fewer than 14 matching days are marked preliminary. Starred cells survive a strict check for chance findings.</li>
        <li><b>Missing is not zero.</b> Days you did not log food, water, sleep, weight or BP are left out, not counted as zero.</li>
        <li>Study summaries are written in plain words from the published papers. Check the original before relying on any number. This tracker is educational and not medical advice.</li></ul></div></section>`;
    drawRadar(); drawMatrix(); drawTimeline(); drawLib();
  }

  async function loadAnalytics() {
    const root = byId("anRoot"), tok = ++A.tok;
    if (!A.data) root.innerHTML = `<div class="an-skel"></div><div class="an-skel"></div>`;
    try {
      const d = await api(`/api/analytics?period=${A.period}&demo=${A.demo ? 1 : 0}`);
      if (tok !== A.tok) return;
      if (!d || !d.radar) throw new Error("bad response");
      A.data = d; A.cell = null;
      if (!d.radar.axes.some((a) => a.id === A.sel)) A.sel = d.radar.weakest || d.radar.axes[0].id;
      render();
    } catch (e) {
      if (tok !== A.tok) return;
      root.innerHTML = `<div class="dempty"><p>Could not load analytics.</p><button type="button" data-refresh="1">Try again</button></div>`;
    }
  }

  byId("anRoot").addEventListener("click", (e) => {
    const t = (sel) => e.target.closest(sel);
    let n;
    if ((n = t("[data-per]"))) { A.period = +n.dataset.per; try { localStorage.setItem("ct_an", JSON.stringify({ period: A.period })); } catch (x) {} loadAnalytics(); }
    
    else if ((n = t("[data-copyrep]"))) {
      fetch(`/api/analytics.md?period=${A.period}&demo=${A.demo ? 1 : 0}`).then((r) => r.text()).then((x) => navigator.clipboard.writeText(x)).then(() => { n.textContent = "Copied"; setTimeout(() => (n.textContent = "Copy AI report"), 1800); }).catch(() => { n.textContent = "Use the .md download"; });
    }
    else if (t("[data-refresh]")) loadAnalytics();
    else if ((n = t("[data-ax]"))) { A.sel = n.dataset.ax; drawRadar(); }
    else if ((n = t("[data-cell]"))) { A.cell = A.cell === n.dataset.cell ? null : n.dataset.cell; drawMatrix(); }
    else if ((n = t("[data-tl]"))) {
      const id = n.dataset.tl;
      if (A.tl.has(id)) A.tl.delete(id); else { A.tl.add(id); if (A.tl.size > 4) A.tl.delete([...A.tl][0]); }
      drawTimeline();
    }
    else if (t("[data-sm]")) { A.smooth = !A.smooth; drawTimeline(); }
    else if ((n = t("[data-lib]"))) {
      A.topic = "All"; drawLib(); const lib = byId("anLib"); lib.open = true;
      const row = byId("an_lib_" + n.dataset.lib);
      if (row) { setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "center" }), 60); row.style.transition = "background .6s"; row.style.background = "color-mix(in srgb, var(--ac) 18%, transparent)"; setTimeout(() => (row.style.background = ""), 1800); }
    }
    else if ((n = t("[data-jump]"))) { const el = byId(n.dataset.jump); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if ((n = t("[data-topic]"))) { A.topic = n.dataset.topic; drawLib(); }
    else if ((n = t("[data-go]"))) showTab(n.dataset.go);
  });
  byId("anRoot").addEventListener("keydown", (e) => {
    const n = e.target.closest("g[data-ax]");
    if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); A.sel = n.dataset.ax; drawRadar(); }
  });

  window.loadAnalytics = loadAnalytics;
})();
