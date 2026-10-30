/* UI polish + interactivity. Loaded last; depends only on the DOM and helpers in app.js / tabs.js. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header height -> CSS var (so jumps land below the sticky header) ---------- */
  const topbar = $("topbar");
  const setHdr = () => root.style.setProperty("--hdr", topbar.offsetHeight + "px");
  new ResizeObserver(setHdr).observe(topbar);
  setHdr();

  /* ---------- theme toggle (light / dark / follow system) ---------- */
  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  $("themeBtn").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("ct_theme", next); } catch (e) {}
    $("themeBtn").innerHTML = IC(next === "dark" ? "sun" : "moon");
  });
  $("themeBtn").innerHTML = IC(isDark() ? "sun" : "moon");

  /* ---------- chips: open + jump (pickleball chips share the bike behaviour) ---------- */
  const jump = (id) => {
    const d = $(id);
    if (!d) return;
    d.open = true;
    setTimeout(() => d.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 50);
  };
  $("pbChips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) jump(c.dataset.target); });

  /* ---------- scroll-spy: highlight the chip of the section you are reading ---------- */
  let ticking = false;
  function spy() {
    ticking = false;
    const nav = !$("bikeNav").hidden ? $("chips") : !$("pickleNav").hidden ? $("pbChips") : null;
    document.querySelectorAll(".chip.on").forEach((c) => c !== null && nav && !nav.contains(c) && c.classList.remove("on"));
    if (!nav) return;
    const line = topbar.offsetHeight + 40;
    let cur = null;
    nav.querySelectorAll(".chip").forEach((c) => {
      const d = $(c.dataset.target);
      if (d && d.offsetParent !== null && d.getBoundingClientRect().top <= line) cur = c;
    });
    nav.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === cur));
    if (cur) {                                    // keep the active chip visible in the scrolling strip
      const l = cur.offsetLeft - nav.clientWidth / 2 + cur.offsetWidth / 2;
      nav.scrollTo({ left: l, behavior: reduce ? "auto" : "smooth" });
    }
    $("toTop").classList.toggle("show", scrollY > 500);
  }
  const queueSpy = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
  addEventListener("scroll", queueSpy, { passive: true });
  document.addEventListener("toggle", queueSpy, true);
  window.uiAfterTab = () => { scrollTo({ top: 0 }); queueSpy(); };

  /* ---------- back to top ---------- */
  const top = document.createElement("button");
  top.id = "toTop"; top.title = "Back to top"; top.setAttribute("aria-label", "Back to top"); top.textContent = "↑";
  top.addEventListener("click", () => scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }));
  document.body.appendChild(top);

  /* ---------- toasts: mirror the status messages under each form ---------- */
  const box = document.createElement("div");
  box.id = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
  document.body.appendChild(box);
  function toast(text, err) {
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : "");
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, err ? 4200 : 2400);
  }
  ["msg", "sMsg", "pwMsg", "fMsg", "wMsg", "wtMsg", "bpMsg", "pbMsg"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    new MutationObserver(() => { const t = el.textContent.trim(); if (t) toast(t, el.classList.contains("err")); }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* ---------- count-up animation for KPI numbers ---------- */
  const NUM = /^(-?\d[\d,]*(?:\.\d+)?)(.*)$/s;
  function countUp(b) {
    if (reduce || b.dataset.done === b.textContent) return;
    const m = NUM.exec(b.textContent.trim());
    if (!m || /\d/.test(m[2])) { b.dataset.done = b.textContent; return; }        // skip ranges like "120–340 kcal" and plain text
    const end = parseFloat(m[1].replace(/,/g, "")), dec = (m[1].split(".")[1] || "").length, tail = m[2];
    if (!isFinite(end) || end === 0) { b.dataset.done = b.textContent; return; }
    const final = b.textContent, t0 = performance.now(), dur = 700;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      b.textContent = p < 1 ? (end * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + tail : final;
      if (p < 1) requestAnimationFrame(step); else b.dataset.done = final;
    };
    requestAnimationFrame(step);
  }
  const kpiWatch = new MutationObserver((muts) => {
    muts.forEach((mu) => mu.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      (n.matches?.(".kpi b") ? [n] : [...n.querySelectorAll?.(".kpi b") || []]).forEach(countUp);
    }));
  });
  ["hero", "kpis", "pbKpis", "wtKpis", "bpKpis"].forEach((id) => $(id) && kpiWatch.observe($(id), { childList: true }));

  /* ---------- keyboard: arrow keys move between main tabs ---------- */
  $("mainTabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...document.querySelectorAll("#mainTabs .tab")], i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); n.click();
  });

  /* ---------- friendly defaults: Enter submits the form you are typing in ---------- */
  const submitOn = { f_name: "f_add", f_kcal: "f_add", w_ml: "w_add", pb_notes: "pb_save", wt_notes: "wt_save", bp_notes: "bp_save", notes: "saveRide" };
  Object.entries(submitOn).forEach(([inp, btn]) => $(inp)?.addEventListener("keydown", (e) => { if (e.key === "Enter") $(btn).click(); }));

  window.uiAfterTab();
})();
