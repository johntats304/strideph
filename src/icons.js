/* Monochrome line-icon sprite (inherits text colour). Use IC("name") in JS or <svg class="ic"><use href="#i-name"/></svg> in HTML. */
(function () {
  const P = {
    bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    paddle: '<path d="M14 3.5c3.5 0 6 2.5 6 5.5 0 3-2.5 5-5.5 5.5L11 11 9.500 7.500C10.5 5 12 3.5 14 3.5z"/><path d="M11 14 5 20M4 19l2 2"/><circle cx="14.5" cy="8" r=".6"/><circle cx="17" cy="10" r=".6"/><circle cx="13" cy="10.5" r=".6"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    droplet: '<path d="M12 3c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z"/>',
    utensils: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8a2 2 0 0 1-2 2M17 21V3c-2.5 1-4 4-4 8 0 2 1.5 3 4 3"/>',
    scale: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a5 5 0 0 1 8 0M12 9l1.5-2"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    bars: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    person: '<circle cx="12" cy="6" r="3"/><path d="M6 21v-5a6 6 0 0 1 12 0v5"/>',
    heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    crown: '<path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11zM3 21h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    hexagon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8l4 2.3v4.4L12 17l-4-2.3v-4.4z"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19c3-5 6-7 10-9"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15 6.5a6 6 0 1 1-5.5 8.5"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    run: '<circle cx="14" cy="4.5" r="1.5"/><path d="M6 20l4-5 3 2 2-5-3-2-3 1-2 3M14 13l3 3 3-1"/>'
  };
  const sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
    Object.keys(P).map((k) => `<symbol id="i-${k}" viewBox="0 0 24 24">${P[k]}</symbol>`).join("") + "</svg>";
  const put = () => { if (!document.getElementById("i-bike")) document.body.insertAdjacentHTML("afterbegin", sprite); };
  document.body ? put() : document.addEventListener("DOMContentLoaded", put);
  window.IC = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
})();
