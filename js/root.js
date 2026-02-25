(() => {
  const radial = document.getElementById("radial");
  const hubTitle = document.getElementById("hubTitle");
  const hubDesc = document.getElementById("hubDesc");
  const hubInstructions = document.getElementById("hubInstructions");

  const items = Array.from(radial.querySelectorAll(".wedge"));

  // Input detection
  const isCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const canHover = window.matchMedia?.("(hover: hover)").matches ?? false;
  const touchMode = isCoarse && !canHover;

  hubInstructions.textContent = touchMode
    ? "Touch: tap to preview, double-tap to open."
    : "Desktop: move cursor around the ring to preview. Use left-click to open, or middle/right-click for new tab.";

  const state = {
    selectedIndex: 0,
    hoverIndex: null,
    rect: null,
    center: { x: 0, y: 0 },
    rInner: 0,
    rOuter: 0,
  };

  function setSelection(index) {
    const el = items[index];
    if (!el) return;

    items.forEach(b => b.classList.remove("is-selected"));
    el.classList.add("is-selected");

    hubTitle.textContent = el.dataset.title || "Selected";
    hubDesc.textContent = el.dataset.desc || "";

    state.selectedIndex = index;
  }

  function setHover(index) {
    if (state.hoverIndex === index) return;
    state.hoverIndex = index;

    items.forEach(b => b.classList.remove("is-hover"));
    if (index !== null && items[index]) items[index].classList.add("is-hover");

    if (index !== null) setSelection(index);
  }

  // ---- Geometry for clipping + icon placement ----
  function polarToPct(angleRad, radiusPct) {
    const x = 50 + Math.cos(angleRad) * radiusPct;
    const y = 50 + Math.sin(angleRad) * radiusPct;
    return `${x.toFixed(3)}% ${y.toFixed(3)}%`;
  }

  function donutSectorPolygon(startRad, endRad, outerR, innerR, steps = 22) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startRad + (endRad - startRad) * t;
      pts.push(polarToPct(a, outerR));
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const a = startRad + (endRad - startRad) * t;
      pts.push(polarToPct(a, innerR));
    }
    return `polygon(${pts.join(",")})`;
  }

  function computeRadii() {
    state.rect = radial.getBoundingClientRect();
    state.center.x = state.rect.left + state.rect.width / 2;
    state.center.y = state.rect.top + state.rect.height / 2;

    const R = Math.min(state.rect.width, state.rect.height) / 2;
    state.rOuter = R * 0.97;
    state.rInner = R * 0.58;
  }

  function cssVarNumber(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function layout() {
    const n = items.length;

    const gapDeg = cssVarNumber("--gap-deg", 6);
    const gapRad = (gapDeg * Math.PI) / 180;

    // Read from CSS so design changes are one-place
    const outerR = cssVarNumber("--outer-r", 49.0);
    const innerR = cssVarNumber("--inner-r", 29.0);
    const iconR  = cssVarNumber("--icon-r", 39.0);

    for (let i = 0; i < n; i++) {
      const startDeg = -90 + (i * 360) / n;
      const endDeg = -90 + ((i + 1) * 360) / n;

      const startRad = (startDeg * Math.PI) / 180 + gapRad;
      const endRad = (endDeg * Math.PI) / 180 - gapRad;

      const el = items[i];
      el.style.clipPath = donutSectorPolygon(startRad, endRad, outerR, innerR, 22);

      const midRad = (startRad + endRad) / 2;
      

      const icon = el.querySelector(".wedge-icon");
      if (icon) {
        const x = Math.cos(midRad) * iconR;
        const y = Math.sin(midRad) * iconR;

        // position relative to the parent (correct), keep CSS transform for centering
        icon.style.left = `calc(50% + ${x.toFixed(3)}%)`;
        icon.style.top  = `calc(50% + ${y.toFixed(3)}%)`;
        icon.style.transform = "translate(-50%, -50%)";
      }
    }

    computeRadii();
  }

  window.addEventListener("resize", layout, { passive: true });
  layout();

  // ---- Desktop: fluid hover from mouse angle ----
  if (!touchMode) {
    const n = items.length;

    function angleToIndex(angleRad) {
      let deg = angleRad * 180 / Math.PI;
      deg = deg + 90; // top is 0
      deg = (deg % 360 + 360) % 360;
      const seg = 360 / n;
      return Math.floor(deg / seg);
    }

    radial.addEventListener("pointermove", (e) => {
      if (e.pointerType && e.pointerType === "touch") return;

      const dx = e.clientX - state.center.x;
      const dy = e.clientY - state.center.y;
      const dist = Math.hypot(dx, dy);

      if (dist < state.rInner || dist > state.rOuter) {
        setHover(null);
        return;
      }

      const ang = Math.atan2(dy, dx);
      const idx = angleToIndex(ang);
      setHover(idx);
    });

    radial.addEventListener("pointerleave", () => setHover(null));

    // Links (<a href>) handle left/middle/right click naturally.
    if (items[0]) setSelection(0);
  }

  // ---- Touch: tap preview, double tap open ----
  if (touchMode) {
    const lastTap = new WeakMap();
    const DOUBLE_TAP_MS = 350;

    items.forEach((el, i) => {
      el.addEventListener("click", (e) => {
        const now = performance.now();
        const prev = lastTap.get(el) || 0;
        lastTap.set(el, now);

        // Double-tap: allow default link navigation
        if (now - prev <= DOUBLE_TAP_MS) return;

        // Single tap: prevent navigation, just preview
        e.preventDefault();
        setSelection(i);
      }, { passive: false });
    });

    if (items[0]) setSelection(0);
  }

  // Keyboard: arrows only (no Enter/Space)
  document.addEventListener("keydown", (e) => {
    if (!items.length) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const i = (state.selectedIndex + 1) % items.length;
      setSelection(i);
      items[i].focus({ preventScroll: true });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = (state.selectedIndex - 1 + items.length) % items.length;
      setSelection(i);
      items[i].focus({ preventScroll: true });
    }
  });
})();