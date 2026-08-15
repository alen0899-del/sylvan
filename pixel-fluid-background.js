(() => {
  const canvas = document.getElementById("pixelFluidCanvas");
  if (!canvas) return;

  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;

  const atom = document.getElementById("sharedPlanet");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let cellSize = 9;
  let frame = 0;
  let lastPaint = 0;
  let resizeFrame = 0;
  let originX = 0;
  let originY = 0;
  let targetOriginX = 0;
  let targetOriginY = 0;
  let originReady = false;
  let latestPointerX = 0;
  let latestPointerY = 0;
  let pointerReady = false;
  let activeCycle = -1;
  const frameInterval = 42;
  let gridColumns = 0;
  let gridRows = 0;
  let grainMap = new Float32Array(0);
  let sparkleMap = new Float32Array(0);
  const animationStartedAt = performance.now();
  let backgroundSuppressed = false;
  let scrollResumeTimer = 0;
  let motionResumeTimer = 0;
  let motionHoldUntil = 0;
  let transientMotionActive = false;
  const transientMotionSelector = [
    ".intro-transitioning",
    ".matrix-case-opening",
    ".experience-workspace.is-switching",
    ".experience-workspace.is-enter-left",
    ".experience-workspace.is-enter-right",
    ".experience-workspace-panel.is-soft-entering",
    ".career-scan-line.is-running",
    ".record-matrix.is-wheel-switching",
    ".record-matrix.is-dragging",
    ".operating-carousel.is-dragging",
    ".orbit-visual.is-dragging",
    ".orbit-project-copy.is-changing",
    ".orbit-focus-card.is-changing",
    ".shared-planet.is-transferring",
    ".shared-planet.is-receiving",
    ".shared-planet.is-settling",
    ".shared-planet.is-vanishing",
    ".shared-planet.is-restoring",
    ".hero-ambient.is-playing"
  ].join(",");

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (minimum, maximum, value) => {
    const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return progress * progress * (3 - 2 * progress);
  };
  const hash = (x, y) => {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };

  const clearCanvas = () => context.clearRect(0, 0, width, height);

  const syncSuppressedState = () => {
    const shouldSuppress = transientMotionActive || performance.now() < motionHoldUntil;
    if (backgroundSuppressed === shouldSuppress) return;
    backgroundSuppressed = shouldSuppress;
    document.body?.classList.toggle("dynamic-background-suppressed", backgroundSuppressed);
    cancelAnimationFrame(frame);
    frame = 0;
    if (backgroundSuppressed) {
      clearCanvas();
      return;
    }
    restart();
  };

  const syncTransientMotion = () => {
    transientMotionActive = Boolean(document.querySelector(transientMotionSelector));
    if (transientMotionActive) holdForMotion(1050);
    syncSuppressedState();
  };

  const holdForMotion = (duration = 1200) => {
    motionHoldUntil = Math.max(motionHoldUntil, performance.now() + duration);
    syncSuppressedState();
    clearTimeout(motionResumeTimer);
    motionResumeTimer = window.setTimeout(() => {
      motionResumeTimer = 0;
      syncTransientMotion();
      if (performance.now() < motionHoldUntil) holdForMotion(motionHoldUntil - performance.now());
    }, duration + 30);
  };

  const isBackgroundTarget = (target) => target instanceof Element && (
    target.closest(".fluid-gradient-background, .gilded-aurora-layer")
  );
  const isSmallUiMotion = (target) => target instanceof Element && (
    target.closest(".matrix-preview, .compass-cursor, .cursor-glow")
  );

  document.addEventListener("animationstart", (event) => {
    if (isBackgroundTarget(event.target) || isSmallUiMotion(event.target)) return;
    const iterationCount = getComputedStyle(event.target).animationIterationCount;
    if (iterationCount.includes("infinite")) return;
    holdForMotion(1350);
  }, { passive: true });
  const motionObserver = new MutationObserver(syncTransientMotion);
  motionObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });

  const suppressWhileScrolling = () => {
    if (!document.body) return;
    if (!transientMotionActive) {
      transientMotionActive = true;
      syncSuppressedState();
    }
    clearTimeout(scrollResumeTimer);
    scrollResumeTimer = window.setTimeout(() => {
      transientMotionActive = Boolean(document.querySelector(transientMotionSelector));
      syncSuppressedState();
    }, 140);
  };
  window.addEventListener("scroll", suppressWhileScrolling, { passive: true });
  window.addEventListener("scrollend", () => {
    clearTimeout(scrollResumeTimer);
    scrollResumeTimer = window.setTimeout(() => {
      transientMotionActive = Boolean(document.querySelector(transientMotionSelector));
      syncSuppressedState();
    }, 80);
  }, { passive: true });

  const preparePixelGrid = () => {
    gridColumns = Math.ceil(width / cellSize);
    gridRows = Math.ceil(height / cellSize);
    const count = gridColumns * gridRows;
    grainMap = new Float32Array(count);
    sparkleMap = new Float32Array(count);
    for (let row = 0; row < gridRows; row += 1) {
      for (let column = 0; column < gridColumns; column += 1) {
        const index = row * gridColumns + column;
        grainMap[index] = 0.42 + hash(column, row) * 0.58;
        sparkleMap[index] = hash(column + 113, row + 29);
      }
    }
  };

  const ringRadius = (angle, cycleAngle, baseRadius) => {
    const waveA = Math.sin(angle * 3 + cycleAngle) * 0.026;
    const waveB = Math.sin(angle * 5 - cycleAngle * 0.75 + 1.7) * 0.014;
    const waveC = Math.sin(angle * 2 + cycleAngle * 0.5 - 0.8) * 0.018;
    const ripple = Math.sin(angle * 9 + cycleAngle * 1.25) * 0.006;
    return baseRadius * (1 + waveA + waveB + waveC + ripple);
  };

  const readAtomOrigin = () => {
    if (!atom) return false;
    const rect = atom.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const isVisible = rect.width > 8 && rect.height > 8 && rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height;
    if (!isVisible) return false;
    targetOriginX = centerX;
    targetOriginY = centerY;
    return true;
  };

  const lockCycleOrigin = () => {
    if (pointerReady) {
      targetOriginX = clamp(latestPointerX, 0, width);
      targetOriginY = clamp(latestPointerY, 0, height);
    } else if (!readAtomOrigin()) {
      targetOriginX = width * 0.5;
      targetOriginY = height * 0.5;
    }
    originX = targetOriginX;
    originY = targetOriginY;
    originReady = true;
  };

  const resize = () => {
    cancelAnimationFrame(frame);
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    pixelRatio = 1;
    cellSize = clamp(Math.round(Math.min(width, height) / 76), 10, 15);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    preparePixelGrid();
    if (originReady) {
      originX = clamp(originX, 0, width);
      originY = clamp(originY, 0, height);
      targetOriginX = originX;
      targetOriginY = originY;
    }
    paint(performance.now(), true);
  };

  const drawOriginGlow = (centerX, centerY, baseRadius, opacity, spread) => {
    const glowRadius = clamp((180 + baseRadius * 0.24) * (1 + spread * 0.42), 225, 680);
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
    gradient.addColorStop(0, "rgba(215,249,255,.18)");
    gradient.addColorStop(0.12, "rgba(85,207,255,.15)");
    gradient.addColorStop(0.42, "rgba(38,116,255,.08)");
    gradient.addColorStop(1, "rgba(13,55,145,0)");
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = clamp(opacity * (0.7 + spread * 0.5), 0, 1);
    context.fillStyle = gradient;
    context.fillRect(centerX - glowRadius, centerY - glowRadius, glowRadius * 2, glowRadius * 2);
    context.restore();
  };

  const drawGradientWave = (centerX, centerY, baseRadius, opacity, spread) => {
    const softness = clamp((195 + baseRadius * 0.15) * (1 + spread * 0.65), 225, 620);
    const innerRadius = Math.max(0, baseRadius - softness);
    const outerRadius = baseRadius + softness;
    const gradient = context.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
    gradient.addColorStop(0, "rgba(18,67,181,0)");
    gradient.addColorStop(0.25, "rgba(18,92,224,.035)");
    gradient.addColorStop(0.46, "rgba(0,155,255,.11)");
    gradient.addColorStop(0.58, "rgba(47,211,255,.16)");
    gradient.addColorStop(0.7, "rgba(30,127,255,.075)");
    gradient.addColorStop(1, "rgba(8,44,146,0)");
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = opacity;
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  };

  const drawSoftRing = (centerX, centerY, baseRadius, cycleAngle, opacity, spread) => {
    const blurScale = 1 + spread * 0.45;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = opacity;
    context.beginPath();
    for (let index = 0; index <= 72; index += 1) {
      const angle = (index / 72) * Math.PI * 2;
      const radius = ringRadius(angle, cycleAngle, baseRadius);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.filter = `blur(${Math.round(64 * blurScale)}px)`;
    context.strokeStyle = "rgba(23, 82, 255, .15)";
    context.lineWidth = clamp(baseRadius * 0.285 * blurScale, 78, 250);
    context.stroke();
    context.filter = `blur(${Math.round(34 * blurScale)}px)`;
    context.strokeStyle = "rgba(0, 181, 255, .2)";
    context.lineWidth = clamp(baseRadius * 0.15 * blurScale, 42, 142);
    context.stroke();
    context.filter = `blur(${Math.round(11 * blurScale)}px)`;
    context.strokeStyle = "rgba(105, 231, 255, .19)";
    context.lineWidth = clamp(baseRadius * 0.0675 * blurScale, 15, 58);
    context.stroke();
    context.restore();
  };

  const drawPixelField = (centerX, centerY, baseRadius, cycleAngle, opacity, spread) => {
    const bandWidth = clamp(baseRadius * 0.19 * (1 + spread * 0.55), 48, 168);
    context.save();
    context.globalCompositeOperation = "lighter";

    let row = 0;
    for (let y = cellSize * 0.5; y < height; y += cellSize, row += 1) {
      let column = 0;
      for (let x = cellSize * 0.5; x < width; x += cellSize, column += 1) {
        const normalizedX = x - centerX;
        const normalizedY = y - centerY;
        const angle = Math.atan2(normalizedY, normalizedX);
        const radius = Math.hypot(normalizedX, normalizedY);
        const target = ringRadius(angle, cycleAngle, baseRadius);
        const distance = Math.abs(radius - target);
        const core = Math.exp(-(distance * distance) / (2 * Math.pow(bandWidth * 0.34, 2)));
        const aura = Math.exp(-(distance * distance) / (2 * bandWidth * bandWidth));
        const angularFlow = 0.94 + 0.06 * Math.sin(angle * 7 - cycleAngle * 1.4 + Math.sin(angle * 3 + cycleAngle));
        const mapIndex = row * gridColumns + column;
        const grain = grainMap[mapIndex] || 0.7;
        const intensity = aura * angularFlow * grain;

        if (intensity < 0.035) continue;

        const sparkle = sparkleMap[mapIndex] || 0.5;
        const size = cellSize * (0.25 + core * 0.38 + sparkle * 0.13);
        const alpha = clamp(intensity * (0.18 + core * 0.5) * opacity * (0.76 + spread * 0.34), 0, 0.72);
        const blue = Math.round(232 + core * 23);
        const green = Math.round(156 + core * 75);
        const red = Math.round(12 + core * 72);
        context.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        context.fillRect(Math.round(x - size * 0.5), Math.round(y - size * 0.5), size, size);
      }
    }
    context.restore();
  };

  const paint = (timestamp, force = false) => {
    if (backgroundSuppressed) {
      clearCanvas();
      frame = 0;
      return;
    }
    if (!force && timestamp - lastPaint < frameInterval) {
      frame = requestAnimationFrame(paint);
      return;
    }
    lastPaint = timestamp;
    const elapsed = Math.max(0, timestamp - animationStartedAt);
    const cycleIndex = reducedMotion.matches ? 0 : Math.floor(elapsed / 5000);
    if (cycleIndex !== activeCycle) {
      activeCycle = cycleIndex;
      lockCycleOrigin();
    }
    if (!originReady) {
      lockCycleOrigin();
    }
    const cycleProgress = reducedMotion.matches ? 0.56 : (elapsed % 5000) / 5000;
    const cycleAngle = cycleProgress * Math.PI * 2;
    const expansionProgress = 1 - Math.pow(1 - cycleProgress, 1.55);
    const spread = smoothstep(0.1, 0.92, cycleProgress);
    const energyBoost = 0.78 + spread * 0.72;
    const maximumRadius = Math.max(
      Math.hypot(originX, originY),
      Math.hypot(width - originX, originY),
      Math.hypot(originX, height - originY),
      Math.hypot(width - originX, height - originY)
    ) * 1.08;
    const baseRadius = maximumRadius * (0.028 + expansionProgress * 0.972);
    const fadeIn = smoothstep(0, 0.08, cycleProgress);
    const fadeOut = 1 - smoothstep(0.86, 1, cycleProgress);
    const waveOpacity = fadeIn * fadeOut;

    context.clearRect(0, 0, width, height);
    drawOriginGlow(originX, originY, baseRadius, waveOpacity, spread);
    drawGradientWave(originX, originY, baseRadius * 0.66, waveOpacity * 0.22 * energyBoost, spread);
    drawGradientWave(originX, originY, baseRadius, waveOpacity * 0.9 * energyBoost, spread);
    drawSoftRing(originX, originY, baseRadius * 0.78, cycleAngle - 0.24, waveOpacity * 0.25 * energyBoost, spread);
    drawSoftRing(originX, originY, baseRadius, cycleAngle, waveOpacity * 0.92 * energyBoost, spread);
    drawPixelField(originX, originY, baseRadius, cycleAngle, waveOpacity * 0.82, spread);

    if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(paint);
  };

  const restart = () => {
    cancelAnimationFrame(frame);
    if (backgroundSuppressed) {
      clearCanvas();
      frame = 0;
      return;
    }
    if (document.hidden || reducedMotion.matches) {
      paint(performance.now(), true);
      return;
    }
    frame = requestAnimationFrame(paint);
  };

  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(resize);
  }, { passive: true });
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    latestPointerX = event.clientX;
    latestPointerY = event.clientY;
    pointerReady = true;
  }, { passive: true });
  document.addEventListener("visibilitychange", restart);
  reducedMotion.addEventListener?.("change", restart);

  resize();
  syncTransientMotion();
  restart();
})();
