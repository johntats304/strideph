/* Dashboard: one-screen summary of every tracker. Uses helpers from app.js ($, api, fmt, esc, localDay)
   and showTab from tabs.js. Everything lives inside this IIFE so it cannot clash with other globals. */
(() => {
  const byId = (id) => document.getElementById(id);
  const COLORS = { cal: "#fc4c02", water: "#2f8cff", act: "#16a34a", wt: "#8b5cf6", sleep: "#6366f1", bp: "#e11d48", pb: "#f59e0b" };
  const BP_COLORS = { Normal: "#16a34a", Elevated: "#d97706", "Stage 1": "#ea580c", "Stage 2": "#dc2626", Crisis: "#991b1b" };
  const nowHM = () => new Date().toTimeString().slice(0, 5);
  const pct = (v, goal) => (goal > 0 ? Math.max(0, Math.min(100, (v / goal) * 100)) : 0);
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const dayLabel = (iso) => {
    const t = localDay(), y = localDay(new Date(Date.now() - 864e5));
    if (iso === t) return "Today";
    if (iso === y) return "Yesterday";
    return new Date(iso + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const wkday = (iso) => new Date(iso + "T00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3);
  const daysAgo = (iso) => Math.round((new Date(localDay() + "T00:00") - new Date(iso + "T00:00")) / 864e5);
  let gid = 0, busy = false;

  /* ---------- small SVG helpers ---------- */
  function ring(p, color, icon, label, big, sub) {
    const r = 44, c = 2 * Math.PI * r;
    return `<div class="dring"><div class="dring-fig">
      <svg viewBox="0 0 110 110" aria-hidden="true"><circle class="trk" cx="55" cy="55" r="${r}"/>
      <circle class="val" cx="55" cy="55" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-off="${(c * (1 - p / 100)).toFixed(1)}"/></svg>
      <div class="mid"><b>${big}</b><small>${sub}</small></div></div>
      <span class="lbl">${icon} ${label}</span></div>`;
  }

  function bars(items, goal, color, unit = "", W = 560, dec = 0) {
    const H = 150, PB = 24, PT = 18, RM = goal ? 52 : 0, CW = W - RM, max = Math.max(goal || 0, ...items.map((i) => i.v), 1) * 1.12, bw = CW / items.length;
    const Y = (v) => H - PB - (v / max) * (H - PB - PT);
    let s = "";
    items.forEach((it, k) => {
      const x = k * bw + bw * 0.18, w = bw * 0.64, y = Y(it.v), hit = goal && it.v >= goal;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, H - PB - y).toFixed(1)}" rx="5" fill="${color}" opacity="${goal && !hit ? 0.45 : 1}"><title>${esc(it.l)}: ${fmt(it.v, dec)}${unit}</title></rect>
        <text x="${(k * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${esc(it.l)}</text>
        ${it.v ? `<text x="${(k * bw + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" class="vl">${fmt(it.v, dec)}</text>` : ""}`;
    });
    if (goal) s += `<line x1="0" x2="${CW}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="${color}" stroke-dasharray="5 4" opacity=".8"/>
      <text x="${W}" y="${(Y(goal) + 4).toFixed(1)}" text-anchor="end" class="vl" fill="${color}" style="opacity:1;font-weight:700">goal ${fmt(goal)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="dchart" role="img">${s}</svg>`;
  }

  function line(pts, color, goal) {
    if (pts.length < 2) return "";
    const W = 560, H = 170, PL = 6, PR = 6, PT = 14, PB = 24, id = "dg" + ++gid;
    const ys = pts.map((p) => p.y).concat(goal > 0 ? [goal] : []);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max((hi - lo) * 0.2, 0.5); lo -= pad; hi += pad;
    const X = (i) => PL + (i / (pts.length - 1)) * (W - PL - PR);
    const Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    const area = `${d} L${X(pts.length - 1).toFixed(1)},${H - PB} L${X(0).toFixed(1)},${H - PB} Z`;
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" class="dchart" role="img">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${goal > 0 ? `<line x1="0" x2="${W}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="5 4"/><text x="${W - 2}" y="${(Y(goal) - 5).toFixed(1)}" text-anchor="end" class="vl">goal ${fmt(goal, 1)}</text>` : ""}
      <circle cx="${X(pts.length - 1).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="5" fill="${color}" stroke="var(--card)" stroke-width="2"/>
      <text x="${PL}" y="${H - 6}" class="ax">${esc(pts[0].x)}</text><text x="${W - PR}" y="${H - 6}" text-anchor="end" class="ax">${esc(last.x)}</text></svg>`;
  }

  function bpChart(points) {
    if (points.length < 2) return "";
    const W = 560, H = 150, PL = 6, PR = 6, PT = 12, PB = 12;
    const lo = Math.min(...points.map((p) => p.dia)) - 8, hi = Math.max(...points.map((p) => p.sys)) + 8;
    const X = (i) => PL + (i / (points.length - 1)) * (W - PL - PR), Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
    const path = (k) => points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join(" ");
    const guide = (v, t) => (v > lo && v < hi ? `<line x1="0" x2="${W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="3 5" opacity=".5"/><text x="${W - 2}" y="${(Y(v) - 3).toFixed(1)}" text-anchor="end" class="vl">${t}</text>` : "");
    return `<svg viewBox="0 0 ${W} ${H}" class="dchart" role="img">${guide(130, "130")}${guide(80, "80")}
      <path d="${path("sys")}" fill="none" stroke="${COLORS.bp}" stroke-width="2.4" stroke-linejoin="round"/><path d="${path("dia")}" fill="none" stroke="#6366f1" stroke-width="2.4" stroke-linejoin="round"/></svg>
      <p class="legend"><i style="background:${COLORS.bp}"></i>Systolic <i style="background:#6366f1"></i>Diastolic</p>`;
  }

  const stat = (label, value, sub = "") => `<div class="dstat"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
  const empty = (msg, btn) => `<div class="dempty"><p>${msg}</p>${btn || ""}</div>`;
  const card = (cls, title, action, body) => `<section class="dcard ${cls}"><header><h3>${title}</h3>${action || ""}</header>${body}</section>`;
  const link = (tab, text, sub) => `<button type="button" class="dlink" data-go="${tab}" ${sub ? `data-sub="${sub}"` : ""}>${text} →</button>`;

  /* ---------- render ---------- */
  function render(D, food, water, pb, wt, bp, sl) {
    const a = D.a, s = D.settings, T = a.totals, tday = localDay();
    const name = (D.user.username || "").replace(/^./, (c) => c.toUpperCase());
    const h = new Date().getHours();
    const greet = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const eaten = food ? num(food.totals.kcal) : 0, goalK = food ? num(food.goal) : num(s.kcal_goal);
    const burned = food ? num(food.burned.bike) + num(food.burned.pickleball) : 0;
    const waterMl = water ? num(water.total) : 0, goalW = water ? num(water.goal) : num(s.water_goal);
        const wst = wt && wt.stats;
    const sGoal = sl ? num(sl.goal) : num(s.sleep_goal) || 8, slLast = sl && sl.latest, slAvg = sl && sl.stats && sl.stats.avg7;
    const slFresh = slLast && daysAgo(slLast.day) <= 1;
    const wGoal = wt ? num(wt.goal) : 0;

    /* alerts */
    const alerts = [];
    if (bp && bp.latest && ["Stage 2", "Crisis"].includes(bp.latest.category))
      alerts.push(["bad", `Your latest blood pressure (${bp.latest.sys}/${bp.latest.dia}) is in the <b>${bp.latest.category}</b> range. Please speak to a doctor or nurse${bp.latest.category === "Crisis" ? " right away" : ""}.`]);
    if (food && goalK && eaten > goalK * 1.1) alerts.push(["warn", `You are ${fmt(eaten - goalK)} kcal over today's food goal.`]);
    if (slFresh && slLast.minutes < 6 * 60) alerts.push(["warn", `You slept only ${sleepHM(slLast.minutes)} last night. Try to catch up on rest today.`]);
    if (wst && daysAgo(wst.day) > 14) alerts.push(["info", `Your last weigh-in was ${daysAgo(wst.day)} days ago.`]);
    if (h >= 17 && water && goalW && waterMl < goalW * 0.5) alerts.push(["info", `Water is at ${Math.round(pct(waterMl, goalW))}% of goal. Time for a glass.`]);

    /* checklist */
    const rodeToday = D.rides.some((r) => r.day === tday), playedToday = pb && pb.sessions.some((x) => x.day === tday);
    const bp7 = bp && bp.avg7, weighedWeek = wst && daysAgo(wst.day) <= 7;
    const check = [
      [food && food.entries.length > 0, "Food logged today"],
      [goalW > 0 && waterMl >= goalW, "Water goal reached"],
      [rodeToday || playedToday, "Exercised today"],
      [slFresh, "Sleep logged for last night"],
      [weighedWeek, "Weighed in this week"],
      [!!bp7, "Blood pressure checked this week"],
    ];
    const done = check.filter((c) => c[0]).length;

    /* macros */
    const mt = food ? food.totals : { protein: 0, carbs: 0, fat: 0 };
    const mk = [num(mt.protein) * 4, num(mt.carbs) * 4, num(mt.fat) * 9], mSum = mk.reduce((x, y) => x + y, 0);
    const macroBar = mSum
      ? `<div class="macro">${["#2f8cff", "#f59e0b", "#e11d48"].map((c, i) => `<i style="width:${(mk[i] / mSum) * 100}%;background:${c}"></i>`).join("")}</div>
         <p class="legend"><i style="background:#2f8cff"></i>Protein ${fmt(mt.protein)} g <i style="background:#f59e0b"></i>Carbs ${fmt(mt.carbs)} g <i style="background:#e11d48"></i>Fat ${fmt(mt.fat)} g</p>`
      : `<p class="hint">No meals logged yet today.</p>`;

    /* recent activity feed */
    const feed = [];
    D.rides.slice(0, 6).forEach((r) => feed.push({ d: r.day, i: IC("bike"), t: `Ride ${fmt(r.km, 1)} km`, s: `${fmt(r.minutes)} min · ${fmt(r.kmh, 1)} km/h · ${fmt(r.kcal_best)} kcal`, k: "r" + r.id }));
    (pb ? pb.sessions : []).slice(0, 6).forEach((x) => feed.push({ d: x.day, i: IC("paddle"), t: `Pickleball ${fmt(x.minutes)} min`, s: `${esc(x.format || "")}${x.wins || x.losses ? ` · ${x.wins}W-${x.losses}L` : ""}`, k: "p" + x.id }));
    (wt ? wt.entries : []).slice(0, 4).forEach((x) => feed.push({ d: x.day, i: IC("scale"), t: `Weigh-in ${fmt(x.kg, 1)} kg`, s: esc(x.notes || ""), k: "w" + x.id }));
    (bp ? bp.entries : []).slice(0, 4).forEach((x) => feed.push({ d: x.day, i: IC("pulse"), t: `BP ${x.sys}/${x.dia}`, s: `${x.category}${x.pulse ? ` · pulse ${x.pulse}` : ""}`, k: "b" + x.id }));
    (sl ? sl.entries : []).slice(0, 4).forEach((x) => feed.push({ d: x.day, i: IC("moon"), t: `Slept ${sleepHM(x.minutes)}`, s: `${sleepClock(x.bed)} → ${sleepClock(x.wake)}${x.quality ? ` · ${"★".repeat(x.quality)}` : ""}`, k: "s" + x.id }));
    feed.sort((x, y) => (y.d > x.d ? 1 : y.d < x.d ? -1 : y.k.localeCompare(x.k)));
    const feedHtml = feed.slice(0, 8).map((f) => `<li><span class="ico">${f.i}</span><div><b>${esc(f.t)}</b><small>${f.s}</small></div><time>${dayLabel(f.d)}</time></li>`).join("");

    /* KPI strip */
    const kpis = [
      [IC("bike"), "Total distance", `${fmt(T.km, 1)} <u>km</u>`, `${fmt(T.rides)} rides`],
      [IC("clock"), "Time in saddle", `${fmt(T.hours, 1)} <u>h</u>`, `avg ${fmt(T.avg_kmh, 1)} km/h`],
      [IC("flame"), "Ride calories", `${fmt(T.kcal)} <u>kcal</u>`, `≈ ${fmt(T.fat_kg, 1)} kg fat`],
      [IC("moon"), "Avg sleep", slAvg ? sleepHM(slAvg.minutes) : "—", slAvg ? `last ${slAvg.n} night${slAvg.n === 1 ? "" : "s"}` : "no nights logged"],
      [IC("leaf"), "CO₂ avoided", `${fmt(T.co2, 1)} <u>kg</u>`, `vs. driving`],
      [IC("coins"), "Transport saved", `${fmt(T.money)}`, `at ${fmt(s.cost_km, 1)} per km`],
    ].map(([i, l, v, sub]) => `<div class="dkpi"><span class="ico">${i}</span><div><small>${l}</small><b>${v}</b><em>${sub}</em></div></div>`).join("");

    const bests = a.bests;
    const lastRide = D.rides[0];
    const tipsHtml = a.tips.filter((t) => !t.startsWith("This week:")).slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join("");

    byId("dashRoot").innerHTML = `
    <section class="dhero">
      <div><p class="date">${dateStr}</p><h1>${greet}, ${esc(name)}</h1>
        <p class="sub">${done === check.length ? "Everything is checked off today. Great work!" : `${done} of ${check.length} daily check-ins done.`}</p></div>
      <div class="dquick">
        <button type="button" data-act="ride">${IC("bike")} Log ride</button>
        <button type="button" data-act="food">${IC("utensils")} Log food</button>
        <button type="button" data-act="water">${IC("droplet")} +250 ml</button>
        <button type="button" data-act="sleep">${IC("moon")} Sleep</button>
        <button type="button" data-act="weight">${IC("scale")} Weigh-in</button>
        <button type="button" data-act="bp">${IC("pulse")} BP</button>
      </div>
    </section>

    ${alerts.length ? `<div class="dalerts">${alerts.map(([k, m]) => `<div class="dalert ${k}">${m}</div>`).join("")}</div>` : ""}

    <section class="drings">
      ${ring(pct(eaten, goalK), COLORS.cal, IC("utensils"), "Calories today", fmt(eaten), `of ${fmt(goalK)} kcal`)}
      ${ring(pct(waterMl, goalW), COLORS.water, IC("droplet"), "Water today", `${(waterMl / 1000).toFixed(1)}L`, `of ${(goalW / 1000).toFixed(1)} L`)}
      ${ring(pct(slFresh ? slLast.minutes / 60 : 0, sGoal), COLORS.sleep, IC("moon"), "Sleep last night", slFresh ? sleepHM(slLast.minutes).replace(/ (\d+)m/, "<small style=\"display:inline;font-size:.6em\">$1m</small>") : "—", slFresh ? `goal ${fmt(sGoal, 1)} h` : "not logged")}
      ${wst && wGoal > 0
        ? ring(pct(Math.max(0, wst.start - wst.current), Math.max(0.1, wst.start - wGoal)), COLORS.wt, IC("scale"), "Weight goal", `${fmt(wst.current, 1)}`, `goal ${fmt(wGoal, 1)} kg`)
        : ring(wst ? 100 : 0, COLORS.wt, IC("scale"), "Current weight", wst ? fmt(wst.current, 1) : "—", wst ? `BMI ${fmt(wst.bmi, 1)}` : "no weigh-ins")}
    </section>

    <section class="dkpis">${kpis}</section>

    <div class="dgrid">
      ${card("span7", "Sleep", link("sleep", "Sleep log"), slLast ? `
        <div class="sleepnow"><div><small>${dayLabel(slLast.day)} · bed → up</small><b>${sleepClock(slLast.bed)} <span>→</span> ${sleepClock(slLast.wake)}</b></div>
          <div class="dur"><b>${sleepHM(slLast.minutes)}</b><em class="pill" style="background:${slLast.minutes >= sGoal * 60 - 15 ? "#16a34a" : "#d97706"}">${slLast.minutes >= sGoal * 60 - 15 ? "Goal met" : sleepHM(sGoal * 60 - slLast.minutes) + " short"}</em></div></div>
        ${slLast.quality ? `<p class="stars">${"★".repeat(slLast.quality)}<span>${"★".repeat(5 - slLast.quality)}</span></p>` : ""}
        <div class="dstats">${slAvg ? stat("7-night avg", sleepHM(slAvg.minutes)) + stat("Usual bedtime", sleepClock(slAvg.bed)) + stat("Usual wake-up", sleepClock(slAvg.wake)) + stat("Sleep debt", sleepHM(slAvg.debt), "last 7 nights") : ""}</div>
        ${bars(sl.week.map((d) => ({ l: wkday(d.day), v: Math.round(d.hours * 10) / 10 })), sGoal, COLORS.sleep, " h", 560, 1)}`
        : empty("No sleep logged yet.", `<button type="button" data-act="sleep">Log last night</button>`))}

      ${card("span5", "Today's energy balance", link("food", "Food log"), `
        <div class="dstats">${stat("Eaten", `${fmt(eaten)}<u>kcal</u>`)}${stat("Burned", `${fmt(burned)}<u>kcal</u>`, "exercise")}${stat("Remaining", `${fmt(goalK - eaten)}<u>kcal</u>`, "vs goal")}</div>
        <div class="bar thick"><i style="width:${pct(eaten, goalK)}%"></i></div>${macroBar}`)}

      ${card("span7", "Weight trend", link("weight", "Weight log"), wst ? `
        <div class="dstats">${stat("Current", `${fmt(wst.current, 1)}<u>kg</u>`, dayLabel(wst.day))}
          ${stat("Change", `${wst.change > 0 ? "+" : ""}${fmt(wst.change, 1)}<u>kg</u>`, "since start")}
          ${stat("BMI", fmt(wst.bmi, 1))}
          ${wst.to_goal != null ? stat("To goal", `${fmt(Math.abs(wst.to_goal), 1)}<u>kg</u>`, wst.to_goal > 0 ? "to lose" : "past goal") : ""}</div>
        ${line(wt.entries.slice(0, 30).reverse().map((e) => ({ x: dayLabel(e.day), y: e.kg })), COLORS.wt, wGoal) || `<p class="hint">Add another weigh-in to see the trend.</p>`}`
        : empty("No weigh-ins yet.", `<button type="button" data-act="weight">Add first weigh-in</button>`))}

      ${card("span5", "Blood pressure", link("bp", "BP log"), bp && bp.latest ? `
        <div class="bpnow"><b>${bp.latest.sys}<span>/</span>${bp.latest.dia}</b><em class="pill" style="background:${BP_COLORS[bp.latest.category]}">${bp.latest.category}</em><small>${dayLabel(bp.latest.day)}${bp.latest.pulse ? ` · pulse ${bp.latest.pulse}` : ""}</small></div>
        <div class="dstats">${bp.avg7 ? stat("7-day avg", `${fmt(bp.avg7.sys)}/${fmt(bp.avg7.dia)}`, bp.avg7.category) : ""}${bp.avg30 ? stat("30-day avg", `${fmt(bp.avg30.sys)}/${fmt(bp.avg30.dia)}`, bp.avg30.category) : ""}${stat("Readings", fmt(bp.total))}</div>
        ${bpChart(bp.points.slice(-20))}`
        : empty("No blood pressure readings yet.", `<button type="button" data-act="bp">Add a reading</button>`))}

      ${card("span4", "Hydration & food · last 7 days", "", `
        <h4>Water (ml)</h4>${water ? bars(water.week.map((d) => ({ l: wkday(d.day), v: Math.round(d.value) })), goalW, COLORS.water, "", 320) : ""}
        <h4>Calories (kcal)</h4>${food ? bars(food.week.map((d) => ({ l: wkday(d.day), v: Math.round(d.value) })), goalK, COLORS.cal, "", 320) : ""}`)}

      ${card("span4", "Cycling highlights", link("exercise", "All rides", "bike"), D.rides.length ? `
        <div class="dstats">${stat("Longest", `${fmt(bests.longest.km, 1)}<u>km</u>`, dayLabel(bests.longest.day))}${stat("Fastest", `${fmt(bests.fastest.kmh, 1)}<u>km/h</u>`, dayLabel(bests.fastest.day))}${stat("Top burn", `${fmt(bests.burn.kcal)}<u>kcal</u>`, dayLabel(bests.burn.day))}</div>
        <div class="lastride"><span class="ico">${IC("bike")}</span><div><small>Latest ride · ${dayLabel(lastRide.day)}</small><b>${esc(lastRide.route || "Ride")}</b>
          <em>${fmt(lastRide.km, 1)} km · ${fmt(lastRide.minutes)} min · ${fmt(lastRide.kmh, 1)} km/h · ${fmt(lastRide.kcal_best)} kcal</em></div></div>
        ${a.trend != null ? `<p class="trend ${a.trend >= 0 ? "up" : "down"}">${a.trend >= 0 ? "▲" : "▼"} Average speed ${a.trend >= 0 ? "up" : "down"} ${fmt(Math.abs(a.trend), 1)}% over time</p>` : ""}`
        : empty("No rides logged yet.", `<button type="button" data-act="ride">Log your first ride</button>`))}

      ${card("span4", "Pickleball", link("exercise", "Sessions", "pickle"), pb && pb.totals.sessions ? `
        <div class="dstats">${stat("This week", `${fmt(pb.totals.this_week)}<u>min</u>`, `${pb.totals.this_week_sessions} session${pb.totals.this_week_sessions === 1 ? "" : "s"}`)}${stat("Win rate", pb.totals.win_rate == null ? "—" : `${fmt(pb.totals.win_rate)}<u>%</u>`, `${pb.totals.wins}W · ${pb.totals.losses}L`)}${stat("All time", `${fmt(pb.totals.hours, 1)}<u>h</u>`, `${pb.totals.sessions} session${pb.totals.sessions === 1 ? "" : "s"}`)}</div>
        ${bars(pb.weeks.map((w) => ({ l: w.label, v: Math.round(w.minutes) })), 0, COLORS.pb, " min", 320)}`
        : empty("No pickleball sessions yet."))}

      ${card("span4", "Today's checklist", "", `<ul class="dcheck">${check.map(([ok, t]) => `<li class="${ok ? "ok" : ""}"><span>${ok ? "✓" : ""}</span>${t}</li>`).join("")}</ul>
        <div class="bar thick"><i style="width:${(done / check.length) * 100}%"></i></div>`)}

      ${card("span4", "Recent activity", "", feedHtml ? `<ul class="dfeed">${feedHtml}</ul>` : empty("Nothing logged yet. Use the quick buttons above to start."))}

      ${card("span4", "Insights", link("exercise", "More", "bike"), `<ul class="dtips">${tipsHtml}</ul>
        <p class="dsub">Heart-rate max ≈ ${fmt(a.body.hrmax)} bpm · BMR ${fmt(a.body.bmr)} kcal/day</p>`)}
    </div>`;

    requestAnimationFrame(() => requestAnimationFrame(() =>
      document.querySelectorAll("#dashRoot .dring .val").forEach((c) => (c.style.strokeDashoffset = c.dataset.off))));
  }

  async function loadDashboard() {
    if (busy) return;
    busy = true;
    const root = byId("dashRoot");
    if (!root.dataset.ready) root.innerHTML = `<div class="dskel"><i></i><i></i><i></i><i></i></div>`;
    const t = localDay(), safe = (p) => p.catch(() => null);
    try {
      const [D, food, water, pb, wt, bp, sl] = await Promise.all([
        api("/api/data"), safe(api(`/api/food?day=${t}`)), safe(api(`/api/water?day=${t}`)),
        safe(api("/api/pickleball")), safe(api("/api/weight")), safe(api("/api/bp")), safe(api("/api/sleep"))]);
      render(D, food && food.totals ? food : null, water && water.week ? water : null,
        pb && pb.totals ? pb : null, wt && wt.entries ? wt : null, bp && bp.entries ? bp : null, sl && sl.entries ? sl : null);
      root.dataset.ready = "1";
    } catch (e) {
      root.innerHTML = `<div class="dempty"><p>Could not load the dashboard.</p><button type="button" id="dashRetry">Try again</button></div>`;
    }
    busy = false;
  }

  /* ---------- actions ---------- */
  function openSection(sub, id) {
    showTab("exercise", sub);
    setTimeout(() => { const d = byId(id); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: "smooth", block: "start" }), 60); } }, 80);
  }
  const ACTS = {
    ride: () => openSection("bike", "d_log"),
    food: () => { showTab("food"); setTimeout(() => byId("f_name") && byId("f_name").focus(), 150); },
    sleep: () => { showTab("sleep"); setTimeout(() => byId("sl_bed") && byId("sl_bed").focus(), 150); },
    weight: () => { showTab("weight"); setTimeout(() => byId("wt_kg") && byId("wt_kg").focus(), 150); },
    bp: () => { showTab("bp"); setTimeout(() => byId("bp_sys") && byId("bp_sys").focus(), 150); },
    water: async (btn) => {
      btn.disabled = true;
      await api("/api/water", "POST", { day: localDay(), ml: 250, time: nowHM() });
      await loadDashboard();
    },
  };

  byId("dashRoot").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]"), go = e.target.closest("[data-go]");
    if (act && ACTS[act.dataset.act]) ACTS[act.dataset.act](act);
    else if (go) showTab(go.dataset.go, go.dataset.sub);
    else if (e.target.id === "dashRetry") loadDashboard();
  });
  byId("dashRefresh").addEventListener("click", loadDashboard);

  window.loadDashboard = loadDashboard;
})();
