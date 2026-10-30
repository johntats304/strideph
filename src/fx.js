/* STRIDE — interaction layer (v3). Loaded last. Pure progressive enhancement:
   if anything here fails the tracker still works exactly as before. */
(() => {
  const $id = (i) => document.getElementById(i);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const raf = (f) => requestAnimationFrame(f);
  const safe = (f) => { try { f(); } catch (e) { console.warn("fx:", e); } };

  /* ============ 1. scroll progress bar + header elevation ============ */
  safe(() => {
    const bar = document.createElement("div");
    bar.id = "progress";
    document.body.prepend(bar);
    const top = $id("topbar");
    let t = false;
    const upd = () => {
      t = false;
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
      top.classList.toggle("scrolled", scrollY > 8);
    };
    addEventListener("scroll", () => { if (!t) { t = true; raf(upd); } }, { passive: true });
    upd();
  });

  /* ============ 2. greeting strip ============ */
  safe(() => {
    const who = document.querySelector(".tb-user .who")?.textContent.trim() || "";
    const h = new Date().getHours();
    const g = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const el = document.createElement("div");
    el.className = "greet";
    el.innerHTML = `<div><b></b><span></span></div><div class="greet-date"></div>`;
    el.querySelector("b").textContent = `${g}${who ? ", " + who : ""}`;
    el.querySelector("span").textContent = "Here’s how you’re moving today.";
    el.querySelector(".greet-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    document.querySelector("main").prepend(el);
  });

  /* ============ 3. sliding active-tab ink ============ */
  safe(() => {
    const tabs = $id("mainTabs");
    const ink = document.createElement("span");
    ink.className = "tab-ink"; ink.setAttribute("aria-hidden", "true");
    tabs.prepend(ink);
    const place = (instant) => {
      const on = tabs.querySelector(".tab.on");
      if (!on) return;
      if (instant) ink.style.transition = "none";
      ink.style.width = on.offsetWidth + "px";
      ink.style.height = on.offsetHeight + "px";
      ink.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      ink.style.opacity = 1;
      if (instant) { ink.offsetWidth; ink.style.transition = ""; }
      on.scrollIntoView({ block: "nearest", inline: "center", behavior: reduce ? "auto" : "smooth" });
    };
    new MutationObserver(() => place(false)).observe(tabs, { attributes: true, subtree: true, attributeFilter: ["class"] });
    addEventListener("resize", () => place(true));
    document.fonts?.ready.then(() => place(true));
    place(true);
  });

  /* ============ 4. button ripple ============ */
  document.addEventListener("pointerdown", (e) => {
    if (reduce) return;
    const b = e.target.closest("button");
    if (!b || b.disabled || b.id === "toTop") return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
    const d = document.createElement("span");
    d.className = "ripple";
    d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(d);
    setTimeout(() => d.remove(), 650);
  }, { passive: true });

  /* ============ 5. scroll reveal ============ */
  safe(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("vis"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -6% 0px", threshold: 0.02 });
    const mark = (root) => root.querySelectorAll("details.sec:not(.reveal), h3.grp:not(.reveal), main .card:not(.kpi):not(.reveal)")
      .forEach((n) => { n.classList.add("reveal"); io.observe(n); });
    mark(document);
  });

  /* ============ 6. KPI cards: stagger, spotlight, tilt ============ */
  safe(() => {
    ["hero", "kpis", "pbKpis", "wtKpis", "bpKpis"].forEach((id) => {
      const c = $id(id);
      if (!c) return;
      new MutationObserver(() => c.querySelectorAll(".kpi").forEach((k, i) => k.style.setProperty("--i", i))).observe(c, { childList: true });
    });
    if (!fine || reduce) return;
    document.addEventListener("pointermove", (e) => {
      const k = e.target.closest?.(".card.kpi");
      if (!k) return;
      const r = k.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      k.style.setProperty("--mx", x * 100 + "%"); k.style.setProperty("--my", y * 100 + "%");
      k.style.setProperty("--ry", ((x - .5) * 10).toFixed(2) + "deg"); k.style.setProperty("--rx", ((.5 - y) * 8).toFixed(2) + "deg");
    }, { passive: true });
    document.addEventListener("pointerout", (e) => {
      const k = e.target.closest?.(".card.kpi");
      if (k && !k.contains(e.relatedTarget)) { k.style.setProperty("--rx", "0deg"); k.style.setProperty("--ry", "0deg"); }
    });
  });

  /* ============ 7. charts: draw-in animation + rich tooltips ============ */
  safe(() => {
    const io = "IntersectionObserver" in window
      ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.3 })
      : null;
    const prep = (svg) => {
      svg.querySelectorAll("circle > title, rect > title").forEach((t) => {
        const p = t.parentNode; p.dataset.tip = t.textContent; t.remove(); p.setAttribute("tabindex", "0");
      });
      if (svg.id === "cMacro") return;
      svg.classList.add("fx"); svg.classList.remove("in");
      svg.querySelectorAll("polyline").forEach((p) => p.setAttribute("pathLength", "1"));
      svg.querySelectorAll("rect[data-tip], circle[data-tip]").forEach((n, i) => n.style.setProperty("--i", i));
      if (io) io.observe(svg); else svg.classList.add("in");
    };
    document.querySelectorAll("svg[id]").forEach((svg) => {
      if (!/^c[A-Z]/.test(svg.id)) return;
      new MutationObserver(() => prep(svg)).observe(svg, { childList: true });
      prep(svg);
    });

    const tip = document.createElement("div");
    tip.id = "tip"; tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    let cur = null;
    const show = (el, x, y) => {
      if (cur !== el) { cur = el; tip.textContent = el.dataset.tip; tip.classList.add("on"); }
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.transform = `translate(${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px, ${Math.max(8, y - h - 14)}px)`;
    };
    const hide = () => { cur = null; tip.classList.remove("on"); };
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest?.("[data-tip]");
      el ? show(el, e.clientX, e.clientY) : cur && hide();
    }, { passive: true });
    document.addEventListener("pointerdown", (e) => { const el = e.target.closest?.("[data-tip]"); if (el) show(el, e.clientX, e.clientY); else hide(); }, { passive: true });
    document.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-tip]"); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top); } });
    document.addEventListener("focusout", hide);
    addEventListener("scroll", hide, { passive: true });
  });

  /* ============ 8. tables: click-to-sort headers + live filter on history ============ */
  safe(() => {
    const val = (td) => {
      const t = (td?.textContent || "").trim().replace(/,/g, "");
      const n = parseFloat(t.replace(/[^\d.\-]/g, ""));
      return /^[\s₱\-\d.]+\S*$/.test(t) && !isNaN(n) ? n : t.toLowerCase();
    };
    document.addEventListener("click", (e) => {
      const th = e.target.closest("th");
      const tbl = th?.closest("table");
      if (!tbl || !/^(history|pbHist|wtHist|bpHist|months)$/.test(tbl.id)) return;
      const idx = [...th.parentNode.children].indexOf(th);
      if (!th.textContent.trim()) return;
      const dir = th.dataset.dir === "asc" ? "desc" : "asc";
      tbl.querySelectorAll("th").forEach((x) => { delete x.dataset.dir; });
      th.dataset.dir = dir;
      const rows = [...tbl.querySelectorAll("tr")].slice(1).filter((r) => r.children.length > 2);
      const parent = rows[0]?.parentNode;
      if (!parent) return;
      rows.sort((a, b) => {
        const x = val(a.children[idx]), y = val(b.children[idx]);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
        return dir === "asc" ? c : -c;
      }).forEach((r) => parent.appendChild(r));
    });
    const h = $id("history");
    if (h) {
      const wrap = document.createElement("div");
      wrap.className = "tfilter";
      wrap.innerHTML = `<input type="search" id="histQ" placeholder="Filter rides by route, date or notes…" aria-label="Filter ride history">`;
      h.closest(".scroll").before(wrap);
      const apply = () => {
        const q = $id("histQ").value.trim().toLowerCase();
        [...h.querySelectorAll("tr")].slice(1).forEach((r) => { r.hidden = !!q && r.children.length > 2 && !r.textContent.toLowerCase().includes(q); });
      };
      $id("histQ").addEventListener("input", apply);
      new MutationObserver(apply).observe(h, { childList: true });
    }
  });

  /* ============ 9. confetti when a daily/weekly goal is hit ============ */
  safe(() => {
    if (reduce) return;
    const fire = (el) => {
      const r = el.getBoundingClientRect();
      const cv = document.createElement("canvas");
      cv.id = "confetti"; cv.width = innerWidth; cv.height = innerHeight;
      document.body.appendChild(cv);
      const g = cv.getContext("2d"), cols = ["#FC4C02", "#ff8a50", "#4aa3df", "#2ecc71", "#f1c40f", "#9b6bd1"];
      const ox = r.left + r.width / 2, oy = Math.min(Math.max(r.top, 80), innerHeight - 80);
      const ps = Array.from({ length: 90 }, () => {
        const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
        return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, s: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6, vr: (Math.random() - .5) * .4 };
      });
      let f = 0;
      (function step() {
        g.clearRect(0, 0, cv.width, cv.height);
        ps.forEach((p) => { p.vy += .22; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - f / 110); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); g.restore(); });
        if (++f < 110) raf(step); else cv.remove();
      })();
    };
    [["goalBar", "goalText"], ["wBar", "wText"]].forEach(([bar, txt]) => {
      const el = $id(bar); if (!el) return;
      new MutationObserver(() => {
        if (parseFloat(el.style.width) < 99.9) return;
        const key = `ct_cele_${bar}_${new Date().toDateString()}`;
        try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) {}
        setTimeout(() => el.offsetParent && fire(el), 500);
      }).observe(el, { attributes: true, attributeFilter: ["style"] });
    });
  });

  /* ============ 10. command palette (Ctrl/⌘ + K  or  /) ============ */
  safe(() => {
    const click = (id) => $id(id)?.click();
    const goto = (t, s) => () => window.showTab && showTab(t, s);
    const section = (sub, id) => () => {
      window.showTab && showTab("exercise", sub);
      setTimeout(() => { const d = $id(id); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 60); } }, 80);
    };
    const A = [
      [IC("home"), "Dashboard", "Go to", goto("dashboard")], [IC("dumbbell"), "Exercise", "Go to", goto("exercise")], [IC("utensils"), "Food", "Go to", goto("food")], [IC("droplet"), "Water", "Go to", goto("water")], [IC("moon"), "Sleep", "Go to", goto("sleep")],
      [IC("scale"), "Weight", "Go to", goto("weight")], [IC("pulse"), "Blood pressure", "Go to", goto("bp")],
      [IC("bike"), "Bike dashboard", "Go to", goto("exercise", "bike")], [IC("paddle"), "Pickleball", "Go to", goto("exercise", "pickle")],
      [IC("bike"), "Log a ride", "Jump", section("bike", "d_log")], [IC("map"), "Map of all rides", "Jump", section("bike", "d_map")],
      [IC("clipboard"), "Ride history", "Jump", section("bike", "d_history")], [IC("bars"), "Overview & totals", "Jump", section("bike", "d_overview")],
      [IC("bulb"), "Insights", "Jump", section("bike", "d_insights")], [IC("heart"), "Heart-rate zones", "Jump", section("bike", "d_zones")],
      [IC("trend"), "Trends & charts", "Jump", section("bike", "d_trends")], [IC("trophy"), "Personal bests", "Jump", section("bike", "d_records")],
      [IC("gear"), "Profile & settings", "Jump", section("bike", "d_settings")], [IC("plus"), "Log a pickleball session", "Jump", section("pickle", "pb_log")],
      [IC("droplet"), "Add 250 ml water", "Action", () => { goto("water")(); setTimeout(() => $id("wQuick")?.querySelector('[data-ml="250"]')?.click(), 300); }],
      [IC("folder"), "Expand all sections", "Action", () => { goto("exercise")(); setTimeout(() => click("expandAll"), 80); }],
      [IC("folder"), "Collapse all sections", "Action", () => { goto("exercise")(); setTimeout(() => click("collapseAll"), 80); }],
      [IC("theme"), "Switch light / dark theme", "Action", () => click("themeBtn")],
      [IC("logout"), "Log out", "Action", () => click("logout")],
    ];
    const ov = document.createElement("div");
    ov.id = "pal"; ov.hidden = true;
    ov.innerHTML = `<div class="pal-box" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="pal-in"><span>${IC("search")}</span><input id="palQ" placeholder="Search tabs, sections, actions…" autocomplete="off" aria-label="Search"><kbd>esc</kbd></div>
        <ul id="palList" role="listbox"></ul><div class="pal-ft"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> select</span></div></div>`;
    document.body.appendChild(ov);
    const q = $id("palQ"), list = $id("palList");
    let items = A, sel = 0;
    const draw = () => {
      list.innerHTML = items.length ? "" : `<li class="empty">No matches</li>`;
      items.forEach((a, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option"); li.className = i === sel ? "on" : "";
        li.innerHTML = `<i></i><b></b><small></small>`;
        li.children[0].innerHTML = a[0]; li.children[1].textContent = a[1]; li.children[2].textContent = a[2];
        li.addEventListener("click", () => run(i));
        li.addEventListener("pointermove", () => { if (sel !== i) { sel = i; list.querySelector(".on")?.classList.remove("on"); li.classList.add("on"); } });
        list.appendChild(li);
      });
      list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
    };
    const filter = () => {
      const s = q.value.trim().toLowerCase();
      items = s ? A.filter((a) => (a[1] + " " + a[2]).toLowerCase().includes(s)) : A; sel = 0; draw();
    };
    const open = () => { ov.hidden = false; q.value = ""; filter(); raf(() => { ov.classList.add("on"); q.focus(); }); };
    const close = () => { ov.classList.remove("on"); setTimeout(() => (ov.hidden = true), 150); };
    const run = (i) => { const a = items[i]; if (!a) return; close(); setTimeout(a[3], 170); };
    q.addEventListener("input", filter);
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % (items.length || 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + items.length) % (items.length || 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
    });
    ov.addEventListener("pointerdown", (e) => { if (e.target === ov) close(); });
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ov.hidden ? open() : close(); }
      else if (e.key === "/" && !typing && ov.hidden) { e.preventDefault(); open(); }
      else if (e.key === "Escape" && !ov.hidden) close();
    });
    const btn = document.createElement("button");
    btn.className = "ghost sm icon"; btn.id = "palBtn"; btn.title = "Search & shortcuts (Ctrl+K)"; btn.setAttribute("aria-label", "Open command palette"); btn.innerHTML = IC("search");
    btn.addEventListener("click", open);
    $id("themeBtn").before(btn);
  });

  /* ============ 11. misc polish ============ */
  safe(() => {
    // number inputs: select content on focus so quick edits are one keystroke
    document.addEventListener("focusin", (e) => { if (e.target.matches?.('input[type=number]')) setTimeout(() => e.target.select?.(), 0); });
    // inline pop on successful tab change handled by CSS; mark page ready for entry animation
    document.body.classList.add("ready");
  });
})();
