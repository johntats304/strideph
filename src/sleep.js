/* Sleep tab. Uses helpers from app.js ($, api, fmt, esc, localDay). Loaded before tabs.js; tabs.js calls loadSleep(). */
(() => {
  let SL = null;
  const DAYS = (iso) => new Date(iso + "T00:00");
  const shift = (iso, n) => { const d = DAYS(iso); d.setDate(d.getDate() + n); return localDay(d); };
  const wd = (iso) => DAYS(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const hm = (m) => { m = Math.round(m); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };
  const clock = (t) => { if (!t) return "-"; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const stars = (q) => (q ? "★".repeat(q) + "☆".repeat(5 - q) : "");
  window.sleepHM = hm; window.sleepClock = clock;

  function preview() {
    const day = $("sl_day").value, bed = $("sl_bed").value, wake = $("sl_wake").value, el = $("slPreview");
    if (!day || !bed || !wake) { el.textContent = ""; return; }
    const mins = (toMin(wake) - toMin(bed) + 1440) % 1440, bedDay = shift(day, toMin(bed) > toMin(wake) ? -1 : 0);
    el.innerHTML = `<b>${hm(mins)}</b> asleep &nbsp;·&nbsp; bed ${esc(wd(bedDay))} ${clock(bed)} → up ${esc(wd(day))} ${clock(wake)}`;
    el.classList.toggle("warn", mins < 30 || mins > 1200);
  }

  async function loadSleep() {
    SL = await api("/api/sleep");
    if (!$("sl_day").value) {
      $("sl_day").value = localDay();
      const l = SL.latest;
      $("sl_bed").value = l ? l.bed : "22:30";
      $("sl_wake").value = l ? l.wake : "06:30";
    }
    if (document.activeElement !== $("sl_goal")) $("sl_goal").value = SL.goal;
    render(); preview();
  }

  function render() {
    const st = SL.stats, goalM = SL.goal * 60, k = (l, v, s) => `<div class="card kpi"><b>${v}</b><span>${l}${s ? ` · ${s}` : ""}</span></div>`;
    const l = SL.latest;
    $("slKpis").innerHTML = st
      ? [k("Last night", hm(l.minutes), wd(l.day)), k("7-night average", st.avg7 ? hm(st.avg7.minutes) : "-"),
         k("Usual bedtime", st.avg7 ? clock(st.avg7.bed) : "-", "7 nights"), k("Usual wake-up", st.avg7 ? clock(st.avg7.wake) : "-", "7 nights"),
         k("Sleep debt", st.avg7 ? hm(st.avg7.debt) : "-", "last 7 nights")].join("")
      : k("Nights logged", 0) + k("Goal", `${fmt(SL.goal, 1)} h`);
    $("sum_slc").textContent = st ? `avg ${hm(st.avg_all.minutes)} · best ${hm(st.best.minutes)} · shortest ${hm(st.shortest.minutes)}` : "no data yet";
    $("sum_slh").textContent = `${SL.total} night(s)`;
    chart();
    $("slNote").textContent = st && st.avg7 && st.avg7.n >= 3
      ? `Bedtime varies by about ±${Math.round(st.avg7.bed_sd)} min over the last ${st.avg7.n} nights. ${st.avg7.bed_sd <= 30 ? "That is a steady rhythm." : "A steadier bedtime helps sleep quality."}`
      : "Log a few nights to see your bedtime consistency.";
    $("slHist").innerHTML = "<tr><th>Woke up</th><th>Bed</th><th>Up</th><th>Slept</th><th>vs goal</th><th>Rating</th><th>Notes</th><th></th></tr>" + (SL.entries.length
      ? SL.entries.map((e) => {
          const d = e.minutes - goalM;
          return `<tr><td>${esc(wd(e.day))}</td><td>${esc(wd(e.bed_day))} ${clock(e.bed)}</td><td>${clock(e.wake)}</td><td><b>${hm(e.minutes)}</b></td>
            <td style="color:${d >= -15 ? "#16a34a" : "#d97706"}">${d >= 0 ? "+" : "-"}${hm(Math.abs(d))}</td><td>${stars(e.quality)}</td><td>${esc(e.notes || "")}</td>
            <td><button class="x" data-sldel="${e.id}" title="Delete">✕</button></td></tr>`;
        }).join("")
      : '<tr><td colspan="8" class="note">No sleep logged yet. Add last night above.</td></tr>');
  }

  function chart() {
    const svg = $("cSleep"), goal = SL.goal, byDay = {};
    SL.entries.forEach((e) => (byDay[e.day] = e.minutes / 60));
    const end = localDay(), days = Array.from({ length: 14 }, (_, i) => shift(end, i - 13));
    const items = days.map((d) => ({ l: DAYS(d).toLocaleDateString(undefined, { day: "numeric" }), v: byDay[d] || 0, d }));
    const W = 600, H = 170, PB = 26, PT = 18, RM = 50, CW = W - RM, max = Math.max(goal, ...items.map((i) => i.v), 1) * 1.12, bw = CW / items.length;
    const Y = (v) => H - PB - (v / max) * (H - PB - PT);
    svg.innerHTML = items.map((it, i) => `<rect x="${(i * bw + bw * 0.16).toFixed(1)}" y="${Y(it.v).toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${Math.max(0, H - PB - Y(it.v)).toFixed(1)}" rx="4" fill="#6366f1" opacity="${it.v >= goal - 0.25 ? 1 : 0.5}"><title>${esc(wd(it.d))}: ${it.v ? hm(it.v * 60) : "not logged"}</title></rect>
      <text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".6">${it.l}</text>
      ${it.v ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${(Y(it.v) - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${fmt(it.v, 1)}</text>` : ""}`).join("") +
      `<line x1="0" x2="${CW}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" stroke="#6366f1" stroke-dasharray="5 4"/>
       <text x="${W}" y="${(Y(goal) + 4).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="#6366f1">goal ${fmt(goal, 1)}h</text>`;
  }

  async function save() {
    const r = await api("/api/sleep", "POST", { day: $("sl_day").value, bed: $("sl_bed").value, wake: $("sl_wake").value, quality: $("sl_q").value, notes: $("sl_notes").value });
    $("slMsg").classList.toggle("err", !r.ok);
    if (!r.ok) { $("slMsg").textContent = r.error; return; }
    $("sl_notes").value = ""; $("sl_q").value = "";
    await loadSleep();
    $("slMsg").textContent = `${r.replaced ? "Updated" : "Saved"}: ${hm(r.minutes)} of sleep.`;
  }

  async function saveGoal() {
    const v = +$("sl_goal").value;
    if (!(v >= 3 && v <= 14)) { $("slGoalMsg").textContent = "Choose a goal between 3 and 14 hours."; return; }
    await api("/api/settings", "POST", { sleep_goal: v });
    $("slGoalMsg").textContent = "Goal saved."; loadSleep();
  }

  ["sl_day", "sl_bed", "sl_wake"].forEach((id) => $(id).addEventListener("input", preview));
  $("sl_save").addEventListener("click", save);
  $("sl_saveGoal").addEventListener("click", saveGoal);
  $("sl_prev").addEventListener("click", () => { $("sl_day").value = localDay(); preview(); });
  $("slHist").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sldel]");
    if (b && confirm("Delete this sleep entry?")) { await api(`/api/sleep/${b.dataset.sldel}`, "DELETE"); loadSleep(); }
  });
  window.loadSleep = loadSleep;
})();
