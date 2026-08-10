const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const runtimePlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
document.documentElement.classList.toggle("is-windows", /windows|win32|win64/i.test(runtimePlatform));

const introGate = $("#introGate");
const introEnter = $(".intro-enter", introGate);
const sharedPlanet = $("#sharedPlanet");
const earthCanvas = $(".earth-surface", sharedPlanet);
const introParticleCanvas = $("#introParticleCanvas");
const introWelcome = $("#introWelcome");
let introLeaving = false;
let earthTransferActive = false;
let earthRenderedTurn = 0;

const reduceIntroMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (introWelcome) {
  const welcomeCharacters = [...introWelcome.textContent.trim()];
  const welcomeMidpoint = (welcomeCharacters.length - 1) / 2;
  introWelcome.innerHTML = welcomeCharacters.map((character, index) => {
    const side = index % 4;
    const distance = 80 + Math.abs(index - welcomeMidpoint) * 17;
    const entryX = side === 0 ? -distance : side === 1 ? distance : (index - welcomeMidpoint) * 13;
    const entryY = side === 2 ? -distance * .7 : side === 3 ? distance * .7 : Math.sin(index * 1.7) * 42;
    const exitX = -entryX * 1.15;
    const exitY = -entryY * 1.2;
    return `<span class="intro-welcome-char" style="--welcome-index:${index};--gather-x:${entryX.toFixed(1)}px;--gather-y:${entryY.toFixed(1)}px;--scatter-x:${exitX.toFixed(1)}px;--scatter-y:${exitY.toFixed(1)}px">${character}</span>`;
  }).join('');
}

let heroCharacterIndex = 0;
$$('.hero-copy h1 > span, .hero-copy h1 > em').forEach((line) => {
  const label = line.textContent;
  line.setAttribute('aria-label', label);
  line.innerHTML = [...label].map((character) => {
    const index = heroCharacterIndex;
    heroCharacterIndex += 1;
    return `<i class="char" aria-hidden="true" style="--char-index:${index}">${character === ' ' ? '&nbsp;' : character}</i>`;
  }).join('');
});

const syncIntroLayout = () => {
  if (!introGate || introLeaving) return;
  const viewportWidth = innerWidth;
  const viewportHeight = innerHeight;
  const artworkRatio = 1672 / 941;
  let artworkWidth;
  let artworkHeight;
  let artworkLeft;
  let artworkTop;
  let anchorX;
  let anchorY;
  let planetSize;
  if (viewportWidth <= 900) {
    artworkWidth = viewportWidth * 1.45;
    artworkHeight = artworkWidth / artworkRatio;
    artworkLeft = (viewportWidth - artworkWidth) / 2;
    artworkTop = (viewportHeight - artworkHeight) * .42;
    anchorX = .31;
    anchorY = .68;
    planetSize = Math.max(170, Math.min(210, artworkWidth * .31));
  } else {
    artworkWidth = Math.max(viewportWidth, viewportHeight * artworkRatio);
    artworkHeight = artworkWidth / artworkRatio;
    artworkLeft = (viewportWidth - artworkWidth) / 2;
    artworkTop = (viewportHeight - artworkHeight) / 2;
    anchorX = .27;
    anchorY = .53;
    planetSize = Math.max(230, Math.min(370, artworkWidth * .243));
  }
  introGate.style.setProperty('--intro-planet-x', `${artworkLeft + artworkWidth * anchorX}px`);
  introGate.style.setProperty('--intro-planet-y', `${artworkTop + artworkHeight * anchorY}px`);
  introGate.style.setProperty('--intro-planet-size', `${planetSize}px`);
};
syncIntroLayout();
addEventListener('resize', syncIntroLayout, { passive: true });

const initEarthSurface = () => {
  if (!earthCanvas) return;
  const texture = new Image();
  texture.decoding = "async";
  texture.src = "./assets/earth-equirectangular-v6.png";
  texture.addEventListener("load", () => {
    const gl = earthCanvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) return;
    const size = innerWidth < 700 ? 384 : 640;
    earthCanvas.width = size;
    earthCanvas.height = size;

    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main(){
        vUv = aPosition * .5 + .5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uMap;
      uniform float uTurn;
      const float PI = 3.141592653589793;
      void main(){
        vec2 point = vUv * 2.0 - 1.0;
        point.y *= -1.0;
        float radius2 = dot(point, point);
        if(radius2 > 1.0){ discard; }
        float depth = sqrt(max(0.0, 1.0 - radius2));
        vec3 normal = normalize(vec3(point.x, point.y, depth));
        float longitude = atan(normal.x, normal.z) / (2.0 * PI) + .5 - uTurn;
        float latitude = asin(clamp(normal.y, -1.0, 1.0)) / PI + .5;
        vec3 surface = texture2D(uMap, vec2(fract(longitude), latitude)).rgb;
        vec3 lightDirection = normalize(vec3(-.34, .22, .94));
        float diffuse = .18 + .88 * max(dot(normal, lightDirection), 0.0);
        float fresnel = pow(1.0 - depth, 3.25);
        vec3 atmosphere = vec3(.12, .38, 1.0) * fresnel * 1.08;
        float alpha = 1.0 - smoothstep(.965, 1.0, radius2);
        gl_FragColor = vec4(surface * diffuse + atmosphere, alpha);
      }
    `;
    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 1024;
    textureCanvas.height = 512;
    textureCanvas.getContext("2d").drawImage(texture, 0, 0, textureCanvas.width, textureCanvas.height);
    const globeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, globeTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, "uMap"), 0);
    const turnUniform = gl.getUniformLocation(program, "uTurn");
    gl.viewport(0, 0, earthCanvas.width, earthCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    sharedPlanet.classList.add("is-textured", "is-3d-globe");

    let lastRenderTime = performance.now();
    let lastDrawTime = -100;
    let globeInView = true;
    const frameInterval = innerWidth < 700 ? 32 : 15;
    const heroSection = $('.hero');
    if (heroSection) new IntersectionObserver(([entry]) => { globeInView = entry.isIntersecting; }, { threshold: 0 }).observe(heroSection);
    const renderGlobe = (time = lastRenderTime) => {
      const delta = Math.max(0, time - lastRenderTime);
      lastRenderTime = time;
      if (!reduceIntroMotion && !earthTransferActive) earthRenderedTurn += delta / 20000;
      if (globeInView && time - lastDrawTime >= frameInterval) {
        lastDrawTime = time;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(turnUniform, earthRenderedTurn);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (!reduceIntroMotion) requestAnimationFrame(renderGlobe);
    };
    renderGlobe();
  }, { once: true });
};
if (!sharedPlanet?.classList.contains("atom-mode")) initEarthSurface();

const runIntroParticleDissolve = () => {
  if (!introParticleCanvas || reduceIntroMotion) return;
  const context = introParticleCanvas.getContext("2d");
  const sourceImage = new Image();
  sourceImage.decoding = "async";
  sourceImage.src = "./assets/intro-orbit-side-v2.png";
  sourceImage.addEventListener("load", () => {
    const width = innerWidth;
    const height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.25);
    introParticleCanvas.width = Math.round(width * ratio);
    introParticleCanvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    const cover = Math.max(width / sourceImage.width, height / sourceImage.height);
    const drawWidth = sourceImage.width * cover;
    const drawHeight = sourceImage.height * cover;
    sampleContext.save();
    sampleContext.translate(width, 0);
    sampleContext.scale(-1, 1);
    sampleContext.drawImage(sourceImage, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    sampleContext.restore();
    const pixels = sampleContext.getImageData(0, 0, width, height).data;
    const particles = [];
    const targetCount = innerWidth < 700 ? 420 : 900;
    let attempts = 0;
    while (particles.length < targetCount && attempts < targetCount * 38) {
      attempts += 1;
      const x = Math.floor(width * .41 + Math.random() * width * .59);
      const y = Math.floor(height * .04 + Math.random() * height * .92);
      const pixel = (y * width + x) * 4;
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const luminance = red * .22 + green * .68 + blue * .1;
      if (luminance < 11 || Math.random() > Math.min(.9, luminance / 95)) continue;
      particles.push({
        x, y, red, green, blue,
        size: .45 + Math.random() * 1.65,
        delay: Math.random() * .22 + (x / width) * .16,
        driftX: -(34 + Math.random() * 150),
        driftY: -48 + Math.random() * 82,
        phase: Math.random() * Math.PI * 2
      });
    }
    const started = performance.now();
    let lastParticleFrame = -100;
    const drawParticles = (now) => {
      if (now - lastParticleFrame < 32) {
        requestAnimationFrame(drawParticles);
        return;
      }
      lastParticleFrame = now;
      const elapsed = (now - started) / 3000;
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        const progress = Math.max(0, Math.min(1, (elapsed - particle.delay) / (1 - particle.delay)));
        if (progress <= 0 || progress >= 1) return;
        const eased = 1 - Math.pow(1 - progress, 2.3);
        const alpha = Math.pow(1 - progress, 1.7) * .88;
        const x = particle.x + particle.driftX * eased + Math.sin(progress * 9 + particle.phase) * 8;
        const y = particle.y + particle.driftY * eased - progress * progress * 30;
        context.beginPath();
        context.fillStyle = `rgba(${Math.min(255, particle.red + 34)},${Math.min(255, particle.green + 54)},${Math.min(255, particle.blue + 86)},${alpha})`;
        context.arc(x, y, particle.size * (1 - progress * .45), 0, Math.PI * 2);
        context.fill();
      });
      if (elapsed < 1) requestAnimationFrame(drawParticles);
      else context.clearRect(0, 0, width, height);
    };
    requestAnimationFrame(drawParticles);
  }, { once: true });
};

introGate.addEventListener("pointermove", (event) => {
  if (introLeaving || event.pointerType !== "mouse") return;
  const x = (event.clientX / innerWidth - .5) * -12;
  const y = (event.clientY / innerHeight - .5) * -8;
  introGate.style.setProperty("--intro-x", `${x}px`);
  introGate.style.setProperty("--intro-y", `${y}px`);
});

introEnter.addEventListener("click", () => {
  if (introLeaving) return;
  introLeaving = true;
  const introStartedAt = performance.now();
  document.body.classList.remove("intro-locked");
  document.body.classList.add("intro-transitioning", "home-locked");
  window.scrollTo({ top: 0, behavior: "auto" });
  runIntroParticleDissolve();
  setTimeout(() => introWelcome?.classList.add("is-visible"), reduceIntroMotion ? 0 : 2050);
  setTimeout(() => introWelcome?.classList.remove("is-visible"), reduceIntroMotion ? 20 : 4050);
  const targetSlot = $(".hero-planet-slot");
  const origin = sharedPlanet.getBoundingClientRect();
  targetSlot.classList.add("is-receiving");
  const target = targetSlot.getBoundingClientRect();
  let planetTurn = null;
  let planetDocked = false;

  const dockPlanet = () => {
    if (planetDocked) return;
    planetDocked = true;
    planetTurn?.cancel();
    sharedPlanet.classList.add("is-settling");
    targetSlot.append(sharedPlanet);
    sharedPlanet.classList.remove("is-transferring");
    sharedPlanet.removeAttribute("style");
    sharedPlanet.classList.remove("is-home-gate");
    sharedPlanet.setAttribute("aria-hidden", "true");
    sharedPlanet.removeAttribute("role");
    sharedPlanet.removeAttribute("tabindex");
    sharedPlanet.removeAttribute("aria-label");
    targetSlot.removeAttribute("aria-hidden");
    targetSlot.classList.add("click-guided");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sharedPlanet.classList.remove("is-settling");
      // The transfer writes a transform on every frame. Clear every motion
      // property after docking so the shared atom cannot retain an upward
      // offset when the first scene hands off to the page.
      ["transform", "translate", "scale", "rotate", "top", "left", "width", "height"].forEach((prop) => sharedPlanet.style.removeProperty(prop));
    }));
    targetSlot.classList.remove("is-receiving");
    earthTransferActive = false;
    introEnter.blur();
    setTimeout(() => unlockHomeFromAtom(), reduceIntroMotion ? 40 : 2000);
    const finishIntro = () => {
      introGate.hidden = true;
      introGate.setAttribute("aria-hidden", "true");
      document.body.classList.remove("intro-transitioning");
      // Keep the first frame of the home scene pinned to the viewport. This
      // prevents browser scroll restoration/smooth-scroll settling from
      // reading as a residual upward float after the intro has completed.
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    const remaining = reduceIntroMotion ? 0 : Math.max(0, 5150 - (performance.now() - introStartedAt));
    setTimeout(finishIntro, remaining);
  };

  sharedPlanet.classList.add("is-transferring");
  Object.assign(sharedPlanet.style, {
    left: `${origin.left}px`, top: `${origin.top}px`,
    width: `${origin.width}px`, height: `${origin.height}px`
  });
  document.body.append(sharedPlanet);
  requestAnimationFrame(() => introGate.classList.add("is-fading"));
  setTimeout(() => document.body.classList.add("intro-complete"), reduceIntroMotion ? 0 : 3300);

  if (reduceIntroMotion) {
    dockPlanet();
    return;
  }

  const centerX = innerWidth / 2;
  const centerY = innerHeight / 2;
  const originCenterX = origin.left + origin.width / 2;
  const originCenterY = origin.top + origin.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const radiusX = Math.max(innerWidth * .3, Math.abs(originCenterX - centerX));
  const radiusY = Math.min(innerHeight * .34, 290);
  const startAngle = originCenterX < centerX ? Math.PI : 0;
  const orbitOffsetX = originCenterX - (centerX + Math.cos(startAngle) * radiusX);
  const orbitOffsetY = originCenterY - (centerY + Math.sin(startAngle) * radiusY);
  const sweepSize = Math.hypot(innerWidth, innerHeight) * 1.18;
  const transferDuration = 5000;
  const transferStarted = performance.now();
  const earthTurnAtStart = earthRenderedTurn;
  earthTransferActive = true;
  let transferFrame = 0;
  let transferCancelled = false;
  const smoothstep = (from, to, value) => {
    const progress = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return progress * progress * (3 - 2 * progress);
  };
  const animatePlanetOrbit = (now) => {
    if (transferCancelled) return;
    const progress = Math.min(1, (now - transferStarted) / transferDuration);
    const orbitProgress = progress - Math.sin(progress * Math.PI * 2) / (Math.PI * 2);
    const angle = startAngle + orbitProgress * Math.PI;
    earthRenderedTurn = earthTurnAtStart + progress * .5;
    const front = Math.exp(-Math.pow((progress - .5) / .115, 2));
    const dockBlend = smoothstep(.79, 1, progress);
    const offsetFade = 1 - smoothstep(0, .35, progress);
    let x = centerX + Math.cos(angle) * radiusX + orbitOffsetX * offsetFade;
    let y = centerY + Math.sin(angle) * radiusY + orbitOffsetY * offsetFade;
    x += (centerX - x) * front;
    y += (centerY - y) * front;
    x += (targetCenterX - x) * dockBlend;
    y += (targetCenterY - y) * dockBlend;
    const restingSize = origin.width + (target.width - origin.width) * smoothstep(.62, 1, progress);
    const size = restingSize + (sweepSize - restingSize) * front;
    const banking = Math.sin(angle) * 7 * (1 - dockBlend);
    const translateX = x - originCenterX;
    const translateY = y - originCenterY;
    const scale = size / origin.width;
    sharedPlanet.style.transform = `translate3d(${translateX.toFixed(2)}px,${translateY.toFixed(2)}px,0) scale(${scale.toFixed(4)}) rotateZ(${banking.toFixed(2)}deg)`;
    if (progress < 1) transferFrame = requestAnimationFrame(animatePlanetOrbit);
    else dockPlanet();
  };
  planetTurn = {
    cancel() {
      transferCancelled = true;
      cancelAnimationFrame(transferFrame);
    }
  };
  transferFrame = requestAnimationFrame(animatePlanetOrbit);
});

const magicGlassSelector = ".site-header,.section-head,.experience-row,.orbit-project-panel,.orbit-visual,.record-matrix,.operating-panel,.finale-contact";
let magicPointerFrame = 0;
let magicPointerX = innerWidth * .5;
let magicPointerY = innerHeight * .3;
let magicPointerPanel = null;
const renderMagicPointer = () => {
  document.documentElement.style.setProperty("--mx", `${magicPointerX}px`);
  document.documentElement.style.setProperty("--my", `${magicPointerY}px`);
  if (magicPointerPanel) {
    const rect = magicPointerPanel.getBoundingClientRect();
    magicPointerPanel.style.setProperty("--glass-x", `${magicPointerX - rect.left}px`);
    magicPointerPanel.style.setProperty("--glass-y", `${magicPointerY - rect.top}px`);
  }
  magicPointerFrame = 0;
};
document.addEventListener("pointermove", (event) => {
  if (event.pointerType && event.pointerType !== "mouse") return;
  magicPointerX = event.clientX;
  magicPointerY = event.clientY;
  const nextPanel = event.target.closest?.(magicGlassSelector) || null;
  if (nextPanel !== magicPointerPanel) {
    magicPointerPanel?.classList.remove("is-pointer-lit");
    nextPanel?.classList.add("is-pointer-lit");
    magicPointerPanel = nextPanel;
  }
  document.body.classList.add("pointer-is-active");
  const cursor = $(".compass-cursor");
  cursor?.classList.toggle("is-action", Boolean(event.target.closest?.("a,button,[role='button'],[data-experience],[data-matrix-card],.orbit-thumb")));
  if (!magicPointerFrame) magicPointerFrame = requestAnimationFrame(renderMagicPointer);
}, { passive: true });
document.addEventListener("pointerdown", (event) => {
  if (!event.pointerType || event.pointerType === "mouse") {
    const cursor = $(".compass-cursor");
    cursor?.classList.add("is-pressed");
    cursor?.classList.remove("is-click-flash");
    void cursor?.offsetWidth;
    cursor?.classList.add("is-click-flash");
    setTimeout(() => cursor?.classList.remove("is-click-flash"), 380);
  }
}, { passive: true });
document.addEventListener("pointerup", () => $(".compass-cursor")?.classList.remove("is-pressed"), { passive: true });
document.documentElement.addEventListener("mouseleave", () => {
  document.body.classList.remove("pointer-is-active");
  magicPointerPanel?.classList.remove("is-pointer-lit");
  magicPointerPanel = null;
});
window.addEventListener("blur", () => {
  document.body.classList.remove("pointer-is-active");
  magicPointerPanel?.classList.remove("is-pointer-lit");
  magicPointerPanel = null;
});

const orbitBodies = [
  { element: $(".planet-orbit-a"), radiusX:.43, radiusY:.43, duration:30, phase:-2.25, direction:1, tilt:0 },
  { element: $(".planet-orbit-b"), radiusX:.49, radiusY:.17, duration:46, phase:.1, direction:-1, tilt:-.08 },
  { element: $(".planet-orbit-c"), radiusX:.16, radiusY:.5, duration:68, phase:2.2, direction:1, tilt:.31 }
];
const reduceHeroOrbitMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let heroOrbitVisible = true;
const positionOrbitBodies = (time = 0) => {
  const ambient = $(".hero-ambient");
  const diameter = ambient?.clientWidth || 0;
  orbitBodies.forEach(({ element, radiusX, radiusY, duration, phase, direction, tilt }) => {
    if (!element || !diameter) return;
    const angle = phase + direction * (time / 1000) * Math.PI * 2 / duration;
    const rawX = Math.cos(angle) * radiusX * diameter;
    const rawY = Math.sin(angle) * radiusY * diameter;
    const x = rawX * Math.cos(tilt) - rawY * Math.sin(tilt);
    const y = rawX * Math.sin(tilt) + rawY * Math.cos(tilt);
    element.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    element.style.zIndex = Math.sin(angle) > 0 ? "6" : "1";
  });
  if (!reduceHeroOrbitMotion && heroOrbitVisible && !document.hidden) requestAnimationFrame(positionOrbitBodies);
};
positionOrbitBodies();
const heroOrbitObserver = new IntersectionObserver(([entry]) => {
  const wasVisible = heroOrbitVisible;
  heroOrbitVisible = entry.isIntersecting;
  if (heroOrbitVisible && !wasVisible && !reduceHeroOrbitMotion) requestAnimationFrame(positionOrbitBodies);
}, { rootMargin: "10% 0px", threshold: 0 });
const heroSectionForOrbit = $("#home");
if (heroSectionForOrbit) heroOrbitObserver.observe(heroSectionForOrbit);

if (false) { // Archived retro audio-player layer.
const heroTonearmToggle = $('[data-hero-tonearm]');
const heroTurntable = $('.hero-ambient');
const heroVinylHint = $('.vinyl-play-hint');
let spaceAudioEngine = null;
let spaceAudioToken = 0;

function setVinylPlaybackState(playing) {
  const turntable = document.querySelector('.hero-ambient');
  const toggle = document.querySelector('[data-hero-tonearm]');
  const hint = document.querySelector('.vinyl-play-hint');
  turntable?.classList.toggle('is-playing', playing);
  toggle?.setAttribute('aria-pressed', String(playing));
  toggle?.setAttribute(
    'aria-label',
    playing ? '点击唱片并停止原创太空氛围音乐' : '点击唱片并播放原创太空氛围音乐'
  );
  if (hint) hint.textContent = playing ? 'PLAYING · 点击暂停' : '点击唱片播放';
}

function createSpaceAudioEngine() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  const delay = context.createDelay(2.5);
  const feedback = context.createGain();
  const nodes = [];

  master.gain.setValueAtTime(.0001, context.currentTime);
  filter.type = 'lowpass';
  filter.frequency.value = 1180;
  filter.Q.value = 1.4;
  delay.delayTime.value = .62;
  feedback.gain.value = .24;
  filter.connect(master);
  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(master);
  master.connect(context.destination);

  const organVoices = [
    { frequency: 73.42, type: 'sine', gain: .085, detune: -5 },
    { frequency: 110, type: 'triangle', gain: .038, detune: 3 },
    { frequency: 146.83, type: 'sine', gain: .03, detune: -2 },
    { frequency: 220, type: 'sine', gain: .012, detune: 5 }
  ];
  organVoices.forEach((voice, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    const tremolo = context.createOscillator();
    const tremoloDepth = context.createGain();
    oscillator.type = voice.type;
    oscillator.frequency.value = voice.frequency;
    oscillator.detune.value = voice.detune;
    voiceGain.gain.value = voice.gain;
    tremolo.frequency.value = .045 + index * .012;
    tremoloDepth.gain.value = voice.gain * .18;
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(voiceGain.gain);
    oscillator.connect(voiceGain);
    voiceGain.connect(filter);
    oscillator.start();
    tremolo.start();
    nodes.push(oscillator, tremolo);
  });

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) {
    const dust = Math.random() > .997 ? (Math.random() * 2 - 1) * .75 : (Math.random() * 2 - 1) * .025;
    noiseData[index] = dust;
  }
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2300;
  noiseFilter.Q.value = .7;
  noiseGain.gain.value = .028;
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();
  nodes.push(noise);

  return { context, master, nodes };
}

async function startSpaceScore() {
  setVinylPlaybackState(true);
  if (spaceAudioEngine) return;
  const token = ++spaceAudioToken;
  const engine = createSpaceAudioEngine();
  if (!engine) return;
  spaceAudioEngine = engine;
  if (engine.context.state === 'suspended') await engine.context.resume();
  if (token !== spaceAudioToken) return;
  const now = engine.context.currentTime;
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setValueAtTime(.0001, now);
  engine.master.gain.exponentialRampToValueAtTime(.72, now + 2.4);
}

function stopSpaceScore() {
  spaceAudioToken += 1;
  const engine = spaceAudioEngine;
  spaceAudioEngine = null;
  setVinylPlaybackState(false);
  if (!engine) return;
  const now = engine.context.currentTime;
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setTargetAtTime(.0001, now, .28);
  setTimeout(() => {
    engine.nodes.forEach((node) => { try { node.stop(); } catch {} });
    engine.context.close().catch(() => {});
  }, 1400);
}

window.toggleHeroVinylAudio = (playing) => {
  if (playing) startSpaceScore().catch(() => {
    spaceAudioEngine = null;
  });
  else stopSpaceScore();
};

}

$$("[data-jump]").forEach((button) => button.addEventListener("click", () => {
  document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "center" });
}));

const unlockHomeFromAtom = () => {
  if (sharedPlanet.classList.contains("is-vanishing")) return;
  if (!document.body.classList.contains("home-locked")) {
    $("#profile")?.scrollIntoView({ behavior: reduceIntroMotion ? "auto" : "smooth", block: "start" });
    return;
  }
  ["transform", "translate", "scale", "rotate"].forEach((prop) => sharedPlanet.style.removeProperty(prop));
  sharedPlanet.classList.remove("is-settling", "is-restoring");
  sharedPlanet.parentElement?.classList.remove("click-guided");
  sharedPlanet.classList.add("is-vanishing");
  sharedPlanet.setAttribute("aria-disabled", "true");
  const vanishDelay = reduceIntroMotion ? 40 : 1450;
  setTimeout(() => {
    document.body.classList.remove("home-locked", "profile-entry-pending");
    document.body.classList.add("profile-collision-entry");
    $("#profile")?.scrollIntoView({ behavior: reduceIntroMotion ? "auto" : "smooth", block: "start" });
    setTimeout(() => {
      sharedPlanet.classList.remove("is-vanishing");
      sharedPlanet.classList.add("is-restoring");
      sharedPlanet.removeAttribute("aria-disabled");
      setTimeout(() => {
        sharedPlanet.classList.remove("is-restoring");
        ["transform", "translate", "scale", "rotate"].forEach((prop) => sharedPlanet.style.removeProperty(prop));
      }, reduceIntroMotion ? 20 : 1200);
    }, reduceIntroMotion ? 60 : 1650);
  }, vanishDelay);
};
sharedPlanet.addEventListener("click", unlockHomeFromAtom);
sharedPlanet.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    unlockHomeFromAtom();
  }
});

const menuButton = $(".menu-toggle");
menuButton.addEventListener("click", () => {
  const open = $(".main-nav").classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(open));
});
$$(".main-nav a").forEach(a => a.addEventListener("click", () => $(".main-nav").classList.remove("is-open")));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("in-view"));
}, { threshold: .12 });
$$(".reveal").forEach((el) => observer.observe(el));

const profileSection = $("#profile");
const workSection = $("#work");
const timelineSection = $("#timeline");
const experienceStack = $(".experience-stack", profileSection);
const experienceIntro = $(".experience-intro", profileSection);
if (experienceStack && experienceIntro) experienceStack.after(experienceIntro);
if (profileSection && workSection && timelineSection) {
  profileSection.after(workSection);
  workSection.after(timelineSection);
}
const sceneSections = [...$$("main > section")];
const sceneEffects = { home: "aperture", profile: "glass-rise", work: "grid-wave", timeline: "orbit-dive", lifestyle: "finale-split" };
const reduceSceneMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

sceneSections.forEach((section, index) => {
  section.dataset.scene = sceneEffects[section.id] || "glass-rise";
  const rect = section.getBoundingClientRect();
  if (rect.top < innerHeight * .82 && rect.bottom > innerHeight * .18) section.classList.add("is-scene-active");
});

if (!reduceSceneMotion) {
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && entry.intersectionRatio > .1) entry.target.classList.add("is-scene-active");
      if (!entry.isIntersecting) {
        const rect = entry.boundingClientRect;
        if (rect.bottom < 0 || rect.top > innerHeight) entry.target.classList.remove("is-scene-active");
      }
    });
  }, { threshold: [0, .1, .28], rootMargin: "-5% 0px -5% 0px" });
  sceneSections.forEach((section) => sceneObserver.observe(section));

  requestAnimationFrame(() => document.body.classList.add("motion-ready"));
} else {
  sceneSections.forEach((section) => section.classList.add("is-scene-active"));
}

const experienceRows = $$("[data-experience]");
experienceRows.forEach((row) => {
  const summary = $(".experience-summary", row);
  const detail = $(".experience-detail", row);
  detail.setAttribute("aria-hidden", "true");

  summary.addEventListener("click", () => {
    const willOpen = !row.classList.contains("is-open");
    experienceRows.forEach((item) => {
      item.classList.remove("is-open");
      $(".experience-summary", item).setAttribute("aria-expanded", "false");
      $(".experience-detail", item).setAttribute("aria-hidden", "true");
    });
    if (willOpen) {
      row.classList.add("is-open");
      summary.setAttribute("aria-expanded", "true");
      detail.setAttribute("aria-hidden", "false");
    }
  });

  row.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = row.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    row.style.setProperty("--glow-x", `${localX}px`);
    row.style.setProperty("--glow-y", `${localY}px`);
    row.style.setProperty("--row-tilt-x", `${((localY / rect.height) - .5) * -1.2}deg`);
    row.style.setProperty("--row-tilt-y", `${((localX / rect.width) - .5) * 1.5}deg`);
  });
  row.addEventListener("pointerleave", () => {
    row.style.setProperty("--row-tilt-x", "0deg");
    row.style.setProperty("--row-tilt-y", "0deg");
  });
});

const operatingCarousel = $('[data-operating-carousel]');
const operatingSlides = $$('[data-operating-slide]');
const operatingCurrent = $('[data-operating-current]');
const reduceOperatingMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let operatingActive = 0;
let operatingTimer = null;

const renderOperatingCarousel = () => {
  const total = operatingSlides.length;
  const incoming = (operatingActive + 1) % total;
  const outgoing = (operatingActive - 1 + total) % total;
  operatingSlides.forEach((slide, index) => {
    slide.classList.remove('is-prev', 'is-active', 'is-next', 'is-far');
    if (index === operatingActive) slide.classList.add('is-active');
    else if (index === incoming) slide.classList.add('is-prev');
    else if (index === outgoing) slide.classList.add('is-next');
    else slide.classList.add('is-far');
    slide.setAttribute('aria-hidden', String(index !== operatingActive));
  });
  if (operatingCurrent) operatingCurrent.textContent = String(operatingActive + 1).padStart(2, '0');
};

const startOperatingCarousel = () => {
  if (reduceOperatingMotion || document.body.classList.contains('player-paused') || operatingTimer || operatingSlides.length < 2) return;
  operatingTimer = setInterval(() => {
    operatingActive = (operatingActive + 1) % operatingSlides.length;
    renderOperatingCarousel();
  }, 4000);
};

const stopOperatingCarousel = () => {
  clearInterval(operatingTimer);
  operatingTimer = null;
};

if (operatingCarousel && operatingSlides.length) {
  renderOperatingCarousel();
  requestAnimationFrame(() => operatingCarousel.classList.add('is-ready'));
  const operatingObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) startOperatingCarousel();
    else stopOperatingCarousel();
  }, { threshold: .15 });
  operatingObserver.observe(operatingCarousel);

  let operatingDragStartY = 0;
  let operatingDragDistance = 0;
  let operatingDragging = false;

  const finishOperatingDrag = (event, cancelled = false) => {
    if (!operatingDragging) return;
    operatingDragging = false;
    operatingCarousel.classList.remove('is-dragging');
    operatingCarousel.style.removeProperty('--operating-drag-y');
    if (operatingCarousel.hasPointerCapture?.(event.pointerId)) operatingCarousel.releasePointerCapture(event.pointerId);
    if (!cancelled && Math.abs(operatingDragDistance) > 42) {
      operatingActive = (operatingActive + (operatingDragDistance > 0 ? 1 : -1) + operatingSlides.length) % operatingSlides.length;
      renderOperatingCarousel();
    }
    operatingDragDistance = 0;
    startOperatingCarousel();
  };

  operatingCarousel.addEventListener('dragstart', (event) => event.preventDefault());
  operatingCarousel.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    operatingDragging = true;
    operatingDragStartY = event.clientY;
    operatingDragDistance = 0;
    stopOperatingCarousel();
    operatingCarousel.classList.add('is-dragging');
    operatingCarousel.setPointerCapture(event.pointerId);
  });
  operatingCarousel.addEventListener('pointermove', (event) => {
    if (!operatingDragging) return;
    operatingDragDistance = event.clientY - operatingDragStartY;
    const easedDistance = Math.max(-105, Math.min(105, operatingDragDistance * .72));
    operatingCarousel.style.setProperty('--operating-drag-y', `${easedDistance}px`);
  });
  operatingCarousel.addEventListener('pointerup', (event) => finishOperatingDrag(event));
  operatingCarousel.addEventListener('pointercancel', (event) => finishOperatingDrag(event, true));
}

const recordMatrix = $('[data-record-matrix]');
const matrixCards = $$('[data-matrix-card]');
const matrixCurrent = $('[data-matrix-current]');
const pdfViewerDialog = $('.pdf-viewer-dialog');
let matrixActive = 0;
let matrixDragging = false;
let matrixDragStartX = 0;
let matrixDragDistance = 0;
let matrixDragStartedAt = 0;
let matrixPressedCard = null;
let matrixAutoplay = 0;

const renderRecordMatrix = () => {
  const total = matrixCards.length;
  matrixCards.forEach((card, index) => {
    card.classList.remove('is-active', 'is-left-1', 'is-left-2', 'is-left-3', 'is-left-4', 'is-right-1', 'is-right-2', 'is-right-3', 'is-right-4', 'is-far');
    let offset = (index - matrixActive + total) % total;
    if (offset > total / 2) offset -= total;
    if (offset === 0) card.classList.add('is-active');
    else if (offset === -1) card.classList.add('is-left-1');
    else if (offset === -2) card.classList.add('is-left-2');
    else if (offset === -3) card.classList.add('is-left-3');
    else if (offset === -4) card.classList.add('is-left-4');
    else if (offset === 1) card.classList.add('is-right-1');
    else if (offset === 2) card.classList.add('is-right-2');
    else if (offset === 3) card.classList.add('is-right-3');
    else if (offset === 4) card.classList.add('is-right-4');
    else card.classList.add('is-far');
    card.setAttribute('aria-pressed', String(offset === 0));
  });
  if (matrixCurrent) matrixCurrent.textContent = String(matrixActive + 1).padStart(2, '0');
};

if (recordMatrix && matrixCards.length) {
  const stopMatrixAutoplay = () => clearInterval(matrixAutoplay);
  const openConceptReader = (card) => {
    if (!card?.dataset.pdf || pdfViewerDialog.open) return;
    stopMatrixAutoplay();
    const reader = card.dataset.reader;
    $$('[data-reader-pages]').forEach((pages) => {
      pages.hidden = pages.dataset.readerPages !== reader;
    });
    $('.pdf-viewer-bar [data-reader-title]').textContent = card.dataset.readerTitle || 'Concept Project';
    $('.pdf-viewer-bar [data-reader-kicker]').textContent = card.dataset.readerKicker || 'CONCEPT PROJECT';
    pdfViewerDialog.showModal();
    document.body.classList.add('pdf-viewer-open');
    $('.pdf-viewer-content')?.scrollTo({ top: 0, behavior: 'auto' });
  };
  const activateMatrixCard = (card) => {
    if (!card) return;
    const pressedIndex = Number(card.dataset.matrixIndex || 0);
    if (card.dataset.project) {
      matrixActive = pressedIndex;
      renderRecordMatrix();
      const linkedProject = card.dataset.project.startsWith('orbit-')
        ? Number(card.dataset.project.replace('orbit-', ''))
        : orbitProjects.findIndex((project) => project.caseStudy === card.dataset.project);
      if (linkedProject >= 0) {
        orbitActive = linkedProject;
        renderOrbit(orbitActive, true, "manual");
        openOrbitProject();
      }
    } else if (pressedIndex !== matrixActive) {
      matrixActive = pressedIndex;
      renderRecordMatrix();
    } else if (card.dataset.pdf) {
      openConceptReader(card);
    }
  };
  const startMatrixAutoplay = () => {
    stopMatrixAutoplay();
    if (document.body.classList.contains('home-locked')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    matrixAutoplay = setInterval(() => {
      if (document.hidden || matrixDragging) return;
      matrixActive = (matrixActive + 1) % matrixCards.length;
      renderRecordMatrix();
    }, 3000);
  };
  renderRecordMatrix();
  const finishMatrixDrag = (event, cancelled = false) => {
    if (!matrixDragging) return;
    matrixDragging = false;
    recordMatrix.classList.remove('is-dragging');
    recordMatrix.style.removeProperty('--matrix-drag-x');
    if (recordMatrix.hasPointerCapture?.(event.pointerId)) recordMatrix.releasePointerCapture(event.pointerId);
    const travel = Math.abs(matrixDragDistance);
    const elapsed = Math.max(60, performance.now() - matrixDragStartedAt);
    const velocity = travel / elapsed;
    if (!cancelled && travel > 38) {
      const distanceSteps = Math.max(1, Math.floor(travel / 155));
      const velocitySteps = velocity > 1.75 ? 3 : velocity > 1.05 ? 2 : velocity > .58 ? 1 : 0;
      const steps = Math.min(4, distanceSteps + velocitySteps);
      const direction = matrixDragDistance < 0 ? 1 : -1;
      matrixActive = (matrixActive + direction * steps + matrixCards.length * 4) % matrixCards.length;
      renderRecordMatrix();
    } else if (!cancelled && matrixPressedCard) {
      activateMatrixCard(matrixPressedCard);
    }
    matrixDragDistance = 0;
    matrixPressedCard = null;
  };

  recordMatrix.addEventListener('dragstart', (event) => event.preventDefault());
  recordMatrix.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    matrixDragging = true;
    stopMatrixAutoplay();
    matrixDragStartX = event.clientX;
    matrixDragDistance = 0;
    matrixDragStartedAt = performance.now();
    matrixPressedCard = event.target.closest('[data-matrix-card]');
    recordMatrix.classList.add('is-dragging');
    recordMatrix.setPointerCapture(event.pointerId);
  });
  recordMatrix.addEventListener('pointermove', (event) => {
    if (!matrixDragging) return;
    matrixDragDistance = event.clientX - matrixDragStartX;
    const easedDistance = Math.max(-190, Math.min(190, matrixDragDistance * .72));
    recordMatrix.style.setProperty('--matrix-drag-x', `${easedDistance}px`);
  });
  recordMatrix.addEventListener('pointerup', (event) => {
    finishMatrixDrag(event);
    if (!pdfViewerDialog?.open) startMatrixAutoplay();
  });
  recordMatrix.addEventListener('pointercancel', (event) => { finishMatrixDrag(event, true); startMatrixAutoplay(); });
  recordMatrix.addEventListener('mouseenter', stopMatrixAutoplay);
  matrixCards.forEach((card) => card.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    stopMatrixAutoplay();
    activateMatrixCard(card);
  }));
  recordMatrix.addEventListener('mouseleave', startMatrixAutoplay);

  // Do not let the carousel advance behind the intro or while it is off-screen.
  // It now starts from project 01 when the work section first enters view.
  const matrixVisibility = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) {
      stopMatrixAutoplay();
      return;
    }
    startMatrixAutoplay();
  }, { threshold: .28 });
  matrixVisibility.observe(recordMatrix);

  // Entering the portfolio section always presents project 01 first, instead
  // of inheriting an autoplay position that changed behind the intro screen.
  $$('a[href="#work"]').forEach((link) => link.addEventListener('click', () => {
    matrixActive = 0;
    renderRecordMatrix();
    stopMatrixAutoplay();
    // Give the first project a clear reading window before the 3 s cycle begins.
    setTimeout(startMatrixAutoplay, 6000);
  }));
}

const orbitProjects = [
  {
    year: "2026", tag: "大屏 OS", type: "功能规划", title: "vivo OriginOS 6 HD",
    description: "负责平板与折叠屏的软件功能规划与质量管理，推动原子笔记专业学习功能、PC 级 CAD 生态适配与 OriginOS 6 HD 质量闭环。",
    image: "./assets/vivo/originos6-hd.jpg", alt: "vivo OriginOS 6 HD 平板系统项目视觉", role: "软件产品经理 / 平板与折叠屏", method: "竞品研究 / 功能规划 / 质量闭环", caseStudy: "vivo-os"
  },
  {
    year: "2026", tag: "AI 陪伴", type: "睡眠规划", title: "TCL AiMe 睡眠陪伴机器人",
    description: "基于 500 份问卷与 30+ 深度访谈，识别家长低效哄睡和儿童睡前难安抚问题，定义下一代 AI 睡眠陪伴方案。",
    image: "./assets/orbit/tcl-ai.png", alt: "TCL AiMe 睡眠陪伴机器人视觉", role: "AI 产品经理 / 新品迭代", method: "定量调研 / 深度访谈 / 主动式 AI 规划", caseStudy: "tcl-aime"
  },
  {
    year: "2026", tag: "空间计算", type: "概念探索", title: "AI 智能眼镜交互",
    description: "研究第一视角下的轻量信息呈现与无手交互，平衡即时帮助、注意力负担与隐私边界。",
    image: "./assets/orbit/ai-glasses.png", alt: "AI 智能眼镜交互视觉", role: "概念产品 / 用户体验", method: "交互原型 / 使用情境"
  },
  {
    year: "2025", tag: "泳池机器人", type: "产品迭代", title: "Aiper 泳池机器人",
    description: "主导海外 Beta 内测体验，收敛用户体验与视觉识别问题；并从水质检测设备竞品研究延展智能庭院生态。",
    image: "./assets/aiper/scuba-s3-hero.png", alt: "Aiper Scuba S3 泳池机器人水下清洁视觉", role: "产品经理 / 海外 Beta 体验", method: "Beta 测试 / VOC 收敛 / 竞品研究", caseStudy: "aiper-pool"
  },
  {
    year: "2025", tag: "全球上市", type: "产品交付", title: "Anker 车载无线充支架",
    description: "完成全球上市前竞争力测试、卖点与定价策略支持，推动产品于 2025 年 7 月成功上市并覆盖线上、线下头部渠道。",
    image: "./assets/orbit/anker-car.png", alt: "Anker 车载无线充支架项目视觉", role: "硬件产品经理 / 全球上市支持", method: "场景测试 / PSM 定价 / 卖点验证", caseStudy: "anker-car"
  },
  {
    year: "2026", tag: "全球洞察", type: "产品规划", title: "Anker 收纳充电短线",
    description: "独立负责中、美、德、英四国用户研究，以 KANO 模型量化功能优先级，锁定 2026 年新品 Roadmap 与上市排期。",
    image: "./assets/orbit/anker-cable-lineup.png", alt: "Anker 收纳充电短线产品规划视觉", role: "2026 产品 Roadmap 负责人", method: "全球调研 / KANO 模型 / 竞品分析", caseStudy: "anker-short-cable"
  },
  {
    year: "2026", tag: "主动式 AI", type: "系统规划", title: "vivo 折叠屏主动式 AIOS",
    description: "面向商务人群工作场景，设计 AI 主动预测日程、聚合任务与生成简报的系统方案，降低跨应用点击、检索和切换成本。",
    image: "./assets/vivo-aios/foldable-overview.jpg", alt: "vivo 折叠屏主动式 AIOS 待办简报界面", role: "AIOS 产品规划 / 交互定义", method: "场景拆解 / 信息架构 / 高保真原型", caseStudy: "vivo-aios"
  },
  {
    year: "2026", tag: "欧洲市场", type: "上市交付", title: "ADO E-bike 欧洲上市",
    description: "推动 Air 20 Pro、Air 20S、Air 28、Air One Pro 与 Air 28 Pro 五款车型完成上市准备，并于 7 月成功上市。",
    image: "./assets/orbit/ebike.png", alt: "ADO E-bike 欧洲上市项目视觉", role: "产品及项目交付", method: "上市评审 / Beta 测试 / 质量闭环", caseStudy: "ebike"
  }
];

let orbitActive = 0;
const orbitVisual = $(".orbit-visual");
const orbitCopy = $(".orbit-project-copy");
const orbitFocus = $(".orbit-focus-card");
const orbitThumbs = $$(".orbit-thumb");
const reduceOrbitMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const orbitMotionProfiles = [
  { hold: 3200, duration: 1.35 },
  { hold: 1550, duration: .62 },
  { hold: 4100, duration: 1.6 },
  { hold: 2100, duration: .82 }
];
let orbitAutoTimer;
let orbitTransitionTimer;
let orbitMotionStep = 0;
let orbitMouseInside = false;
let orbitFocusInside = false;
let orbitScheduleToken = 0;
let orbitManualHoldUntil = 0;

function positionOrbitThumbs() {
  orbitThumbs.forEach((thumb, index) => {
    const isActive = index === orbitActive;
    thumb.classList.toggle("is-active", isActive);
    if (isActive) {
      thumb.style.left = "50%";
      thumb.style.top = "50%";
      thumb.style.zIndex = "12";
      thumb.style.opacity = "1";
      thumb.style.filter = "none";
      thumb.style.transform = "translate(-50%,-50%) rotate(2deg)";
      return;
    }
    let relative = index - orbitActive;
    if (relative > 3) relative -= orbitProjects.length;
    if (relative < -4) relative += orbitProjects.length;
    const angle = (-90 + relative * 45) * Math.PI / 180;
    // Keep both axes on the same radius so every satellite follows the
    // visible circular guide rather than a compressed elliptical path.
    const circularRadius = 43;
    const x = 50 + Math.cos(angle) * circularRadius;
    const y = 50 + Math.sin(angle) * circularRadius;
    const depth = (Math.sin(angle) + 1) / 2;
    const scale = .72 + depth * .36;
    thumb.style.left = `${x}%`;
    thumb.style.top = `${y}%`;
    thumb.style.zIndex = String(3 + Math.round(depth * 5));
    thumb.style.opacity = String(.28 + depth * .7);
    thumb.style.filter = "none";
    thumb.style.transform = `translate(-50%,-50%) scale(${scale}) rotate(${relative * 2.4}deg)`;
  });
}

function renderOrbit(index, immediate = false, source = "manual") {
  clearTimeout(orbitTransitionTimer);
  if (source === "manual") orbitVisual.style.setProperty("--orbit-duration", ".82s");
  orbitActive = (index + orbitProjects.length) % orbitProjects.length;
  const project = orbitProjects[orbitActive];
  positionOrbitThumbs();
  orbitCopy.classList.add("is-changing");
  orbitFocus.classList.add("is-changing");
  const update = () => {
    $(".orbit-year").textContent = project.year;
    $(".orbit-year-shadow").textContent = project.year;
    $(".orbit-project-meta span:first-child").textContent = project.tag;
    $(".orbit-project-meta span:last-child").textContent = project.type;
    $(".orbit-project-copy h2").textContent = project.title;
    $(".orbit-project-copy p").textContent = project.description;
    $(".orbit-project-count b").textContent = String(orbitActive + 1).padStart(2, "0");
    $(".orbit-progress-fill").style.width = `${(orbitActive / (orbitProjects.length - 1)) * 100}%`;
    $(".orbit-focus-card img").src = project.image;
    $(".orbit-focus-card img").alt = project.alt;
    $(".focus-card-label b").textContent = String(orbitActive + 1).padStart(2, "0");
    $(".focus-card-corner").textContent = project.year;
    requestAnimationFrame(() => {
      orbitCopy.classList.remove("is-changing");
      orbitFocus.classList.remove("is-changing");
    });
  };
  immediate ? update() : orbitTransitionTimer = setTimeout(update, source === "auto" ? 150 : 180);
  $$(".orbit-time-marker").forEach((marker) => {
    marker.classList.toggle("is-active", Number(marker.dataset.orbitTime) === orbitActive);
  });
}

function scheduleOrbit() {
  clearTimeout(orbitAutoTimer);
  const scheduleToken = ++orbitScheduleToken;
  if (reduceOrbitMotion || document.body.classList.contains('player-paused') || orbitMouseInside || orbitFocusInside || document.hidden) return;
  const profile = orbitMotionProfiles[orbitMotionStep % orbitMotionProfiles.length];
  const hold = Math.max(profile.hold, orbitManualHoldUntil - performance.now());
  orbitAutoTimer = setTimeout(() => {
    if (scheduleToken !== orbitScheduleToken) return;
    orbitVisual.style.setProperty("--orbit-duration", `${profile.duration}s`);
    renderOrbit(orbitActive + 1, false, "auto");
    orbitMotionStep += 1;
    scheduleOrbit();
  }, hold);
}

let orbitPulseTimer;
function confirmCenteredCard() {
  const centeredCard = $(".orbit-thumb.is-active");
  if (!centeredCard) return;
  centeredCard.classList.remove("is-focus-confirmed");
  requestAnimationFrame(() => centeredCard.classList.add("is-focus-confirmed"));
  clearTimeout(orbitPulseTimer);
  orbitPulseTimer = setTimeout(() => centeredCard.classList.remove("is-focus-confirmed"), 680);
}

function selectOrbitProject(index, confirm = false) {
  const normalizedIndex = (index + orbitProjects.length) % orbitProjects.length;
  const alreadyCentered = normalizedIndex === orbitActive;
  orbitManualHoldUntil = performance.now() + 5000;
  renderOrbit(index, false, "manual");
  orbitMotionStep = 0;
  scheduleOrbit();
  if (confirm) setTimeout(confirmCenteredCard, alreadyCentered ? 30 : 850);
}

$(".orbit-prev").addEventListener("click", () => selectOrbitProject(orbitActive - 1));
$(".orbit-next").addEventListener("click", () => selectOrbitProject(orbitActive + 1));
orbitThumbs.forEach((thumb) => thumb.addEventListener("click", () => {
  const index = Number(thumb.dataset.orbitIndex);
  if (index === orbitActive && orbitProjects[index]?.caseStudy) {
    clearTimeout(orbitAutoTimer);
    openOrbitProject();
    return;
  }
  selectOrbitProject(index, true);
}));
$$(".orbit-time-marker").forEach((marker) => marker.addEventListener("click", () => selectOrbitProject(Number(marker.dataset.orbitTime), true)));

orbitVisual.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "mouse") {
    orbitMouseInside = true;
    clearTimeout(orbitAutoTimer);
  }
});
orbitVisual.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") {
    orbitMouseInside = false;
    scheduleOrbit();
  }
});
orbitVisual.addEventListener("focusin", () => {
  orbitFocusInside = true;
  clearTimeout(orbitAutoTimer);
});
orbitVisual.addEventListener("focusout", () => {
  orbitFocusInside = false;
  scheduleOrbit();
});
document.addEventListener("visibilitychange", scheduleOrbit);

let orbitDragStart = 0;
let orbitDragging = false;
orbitVisual.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".orbit-thumb")) return;
  orbitDragging = true;
  orbitDragStart = event.clientX;
  clearTimeout(orbitAutoTimer);
  orbitVisual.setPointerCapture(event.pointerId);
});
orbitVisual.addEventListener("pointerup", (event) => {
  if (!orbitDragging) return;
  const distance = event.clientX - orbitDragStart;
  if (Math.abs(distance) > 38) selectOrbitProject(orbitActive + (distance < 0 ? 1 : -1));
  else if (event.pointerType !== "mouse") scheduleOrbit();
  orbitDragging = false;
});
orbitVisual.addEventListener("pointercancel", () => {
  orbitDragging = false;
  scheduleOrbit();
});

if (pdfViewerDialog) {
  const closePdfViewer = () => {
    pdfViewerDialog.close();
    document.body.classList.remove('pdf-viewer-open');
    if (recordMatrix && matrixCards.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearInterval(matrixAutoplay);
      matrixAutoplay = setInterval(() => {
        if (document.hidden || matrixDragging) return;
        matrixActive = (matrixActive + 1) % matrixCards.length;
        renderRecordMatrix();
      }, 3000);
    }
  };
  $('.pdf-viewer-close')?.addEventListener('click', closePdfViewer);
  pdfViewerDialog.addEventListener('click', (event) => {
    if (event.target === pdfViewerDialog) closePdfViewer();
  });
  pdfViewerDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closePdfViewer();
  });
}

const dialog = $(".project-dialog");
const closeOrbitProject = () => {
  dialog.close();
  document.body.classList.remove("project-dialog-open");
};
const openOrbitProject = () => {
  const project = orbitProjects[orbitActive];
  $(".dialog-index").textContent = `PROJECT ${String(orbitActive + 1).padStart(2,"0")} / 08`;
  $(".project-dialog h2").textContent = project.title;
  $(".project-dialog > p").textContent = project.description;
  $(".dialog-meta div:first-child b").textContent = project.role;
  $(".dialog-meta div:last-child b").textContent = project.method;
  $(".ebike-case-study")?.toggleAttribute("hidden", project.caseStudy !== "ebike");
  $(".anker-car-case-study")?.toggleAttribute("hidden", project.caseStudy !== "anker-car");
  $(".anker-cable-case-study")?.toggleAttribute("hidden", project.caseStudy !== "anker-short-cable");
  $(".tcl-aime-case-study")?.toggleAttribute("hidden", project.caseStudy !== "tcl-aime");
  $(".aiper-case-study")?.toggleAttribute("hidden", project.caseStudy !== "aiper-pool");
  $(".vivo-case-study")?.toggleAttribute("hidden", project.caseStudy !== "vivo-os");
  $(".vivo-aios-case-study")?.toggleAttribute("hidden", project.caseStudy !== "vivo-aios");
  dialog.classList.toggle("is-detailed-case", Boolean(project.caseStudy));
  dialog.classList.toggle("is-ebike-case", project.caseStudy === "ebike");
  dialog.classList.toggle("is-anker-case", project.caseStudy === "anker-car");
  dialog.classList.toggle("is-cable-case", project.caseStudy === "anker-short-cable");
  dialog.classList.toggle("is-tcl-aime-case", project.caseStudy === "tcl-aime");
  dialog.classList.toggle("is-aiper-case", project.caseStudy === "aiper-pool");
  dialog.classList.toggle("is-vivo-case", project.caseStudy === "vivo-os");
  dialog.classList.toggle("is-vivo-aios-case", project.caseStudy === "vivo-aios");
  dialog.showModal();
  document.body.classList.add("project-dialog-open");
};
$(".orbit-open-project").addEventListener("click", openOrbitProject);
$(".dialog-close").addEventListener("click", closeOrbitProject);
dialog.addEventListener("click", (e) => { if (e.target === dialog) closeOrbitProject(); });
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeOrbitProject();
});

const caseMediaDialog = $(".case-media-dialog");
const caseMediaImage = $("[data-case-media-image]");
const caseMediaTitle = $("[data-case-media-title]");
let caseMediaHistoryArmed = false;

const closeCaseMedia = () => {
  if (!caseMediaDialog?.open) return;
  caseMediaDialog.close();
  document.body.classList.remove("case-media-open");
  caseMediaHistoryArmed = false;
};

const requestCaseMediaClose = () => {
  if (caseMediaHistoryArmed && history.state?.caseMediaViewer) history.back();
  else closeCaseMedia();
};

const openCaseMedia = (image) => {
  if (!caseMediaDialog || !caseMediaImage || !image) return;
  const figureCaption = image.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
  const title = figureCaption || image.alt || "项目图片";
  caseMediaImage.src = image.currentSrc || image.src;
  caseMediaImage.alt = image.alt || title;
  caseMediaTitle.textContent = title;
  caseMediaDialog.showModal();
  document.body.classList.add("case-media-open");
  $(".case-media-stage")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  history.pushState({ ...(history.state || {}), caseMediaViewer: true }, "", "#project-image");
  caseMediaHistoryArmed = true;
};

$$('.project-dialog img').forEach((image) => {
  image.classList.add('case-media-trigger');
  const imageLink = image.closest('a');
  if (imageLink) {
    imageLink.setAttribute('aria-label', `站内放大查看：${image.alt || '项目图片'}`);
  } else {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `放大查看：${image.alt || '项目图片'}`);
  }
  image.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCaseMedia(image);
  });
});

dialog.addEventListener('click', (event) => {
  const image = event.target.closest?.('img.case-media-trigger') || event.target.closest?.('a')?.querySelector('img.case-media-trigger');
  if (!image) return;
  event.preventDefault();
  openCaseMedia(image);
});

$('.case-media-back')?.addEventListener('click', requestCaseMediaClose);
$('.case-media-close')?.addEventListener('click', requestCaseMediaClose);
caseMediaDialog?.addEventListener('click', (event) => {
  if (event.target === caseMediaDialog) requestCaseMediaClose();
});
caseMediaDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  requestCaseMediaClose();
});
addEventListener('popstate', () => {
  if (caseMediaDialog?.open && !history.state?.caseMediaViewer) closeCaseMedia();
});

renderOrbit(0, true);
scheduleOrbit();

function filterProducts(category) {
  $$("[data-filter]").forEach(btn => btn.classList.toggle("is-active", btn.dataset.filter === category));
  $$(".product-tile").forEach(tile => tile.classList.toggle("is-hidden", category !== "all" && tile.dataset.category !== category));
  document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
$$("[data-filter]").forEach((button) => button.addEventListener("click", () => filterProducts(button.dataset.filter)));

const toast = $(".toast");
let toastTimer;
$$(".tile-arrow").forEach((button) => button.addEventListener("click", () => {
  toast.textContent = "项目详情正在整理中 · 可在此连接完整 Case Study";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}));

if (false) { // Archived retro chapter-player layer.
const chapterNames = [
  "00 / INTRODUCTION",
  "01 / SELECTED EXPERIENCE",
  "02 / SELECTED WORK",
  "03 / PRODUCT MATRIX",
  "04 / BEYOND WORK"
];
const nowPlaying = $('[data-now-playing]');
const mediaToggle = $('[data-media-toggle]');
let activeChapter = 0;

const chapterObserver = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  activeChapter = Math.max(0, sceneSections.indexOf(visible.target));
  if (nowPlaying) nowPlaying.textContent = chapterNames[activeChapter];
  document.body.dataset.chapter = String(activeChapter).padStart(2, '0');
  const activeId = visible.target.id;
  $$('.main-nav a').forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${activeId}`));
}, { threshold: [.24, .48, .72], rootMargin: '-12% 0px -20% 0px' });
sceneSections.forEach((section) => chapterObserver.observe(section));

$('[data-media-prev]')?.addEventListener('click', () => {
  activeChapter = (activeChapter - 1 + sceneSections.length) % sceneSections.length;
  sceneSections[activeChapter].scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('[data-media-next]')?.addEventListener('click', () => {
  activeChapter = (activeChapter + 1) % sceneSections.length;
  sceneSections[activeChapter].scrollIntoView({ behavior: 'smooth', block: 'start' });
});
mediaToggle?.addEventListener('click', () => {
  const paused = document.body.classList.toggle('player-paused');
  mediaToggle.setAttribute('aria-pressed', String(paused));
  mediaToggle.setAttribute('aria-label', paused ? '继续页面动效' : '暂停页面动效');
  if (paused) {
    stopOperatingCarousel();
    clearTimeout(orbitAutoTimer);
    stopSpaceScore();
  } else {
    startOperatingCarousel();
    scheduleOrbit();
  }
});

let pageProgressFrame = 0;
const updatePageProgress = () => {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  document.documentElement.style.setProperty('--page-progress', Math.min(1, Math.max(0, scrollY / maxScroll)).toFixed(4));
  pageProgressFrame = 0;
};
addEventListener('scroll', () => {
  if (pageProgressFrame) return;
  pageProgressFrame = requestAnimationFrame(updatePageProgress);
}, { passive: true });
updatePageProgress();
}
