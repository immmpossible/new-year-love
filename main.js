const CONFIG = {
  timing: {
    countdownStepMs: 900,
    countdownScatterMs: 300,
    phraseCharMinMs: 120,
    phraseCharMaxMs: 180,
    phraseAssembleMs: 640,
    phraseHoldMs: 1200,
    phraseExitMs: 900,
  },
  text: {
    lines: ["2026", "祝我的小驴", "新年快乐！", "愿你在新的一年里", "健康快乐", "事事顺心", "越来越美", "狠狠出片！"],
    fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
    colorA: "#ffd18c",
    colorB: "#f6bdd7",
    colorC: "#89a7ff",
  },
  loveNote: {
    text: "宝贝，很幸运在25年和你走到一起，\n接下来的26年27年..每一年，\n都让我陪你一起走吧！",
    delayMs: 1100,
    charMs: 95,
    jitterMs: 24,
  },
  particle: {
    maxCount: 5600,
    pointSize: 2.8,
    morphLerp: 0.13,
    spawnRadius: 48,
    explodeSpeed: 2.0,
    explodeDrag: 0.965,
    explodeGravity: 0.008,
  },
  heart: {
    occupyScreenHeight: 0.6,
    depth: 18,
    rotationSpeed: 0.24,
    zoomSpreadNear: 1.2,
    zoomSpreadFar: 0.82,
    spreadLerp: 3.4,
    pointCount: 4200,
    photoCount: 24,
    photoScaleMin: 0.75,
    photoScaleMax: 1.15,
    photoHeightRatio: 0.105,
    photoBorder: "#ffd8ea",
  },
  stars: {
    count: 1400,
    size: 1.15,
  },
  fireworks: {
    launchIntervalMs: 520,
    heartIntervalMs: 680,
    burstParticles: 44,
    burstMultiplierMin: 1.2,
    burstMultiplierMax: 2.9,
    simultaneousBurstsIntro: 2,
    simultaneousBurstsHeart: 3,
    gravity: 0.045,
    drag: 0.984,
    fadeAlpha: 0.24,
    colors: ["#ffd77a", "#ff8ad8", "#6fb4ff", "#9e7bff", "#7affd4", "#ff7e7e"],
  },
  renderer: {
    maxPixelRatio: 2,
  },
};

const QUALITY = detectQuality();
CONFIG.particle.maxCount = Math.floor(CONFIG.particle.maxCount * QUALITY.particleScale);
CONFIG.heart.pointCount = Math.floor(CONFIG.heart.pointCount * QUALITY.particleScale);
CONFIG.stars.count = Math.floor(CONFIG.stars.count * QUALITY.starScale);
CONFIG.fireworks.burstParticles = Math.floor(CONFIG.fireworks.burstParticles * QUALITY.fireworkScale);

const app = {
  stage: "intro",
  root: document.getElementById("scene-root"),
  loadingEl: document.getElementById("loading"),
  loveNoteEl: document.getElementById("love-note"),
  loveNoteTextEl: document.getElementById("love-note-text"),
  fireCanvas: document.getElementById("fireworks-canvas"),
  fireCtx: document.getElementById("fireworks-canvas").getContext("2d"),
  musicBtn: document.getElementById("music-btn"),
  bgm: document.getElementById("bgm"),
  textures: [],
  heartMetrics: { scale: 1, height: 90 },
  heartBaseTargets: [],
  heartSpread: 1,
  loveNoteStarted: false,
  fireworks: {
    particles: [],
    lastSpawnAt: 0,
    interval: CONFIG.fireworks.launchIntervalMs,
  },
  fps: {
    frames: 0,
    elapsed: 0,
    lastCheck: 0,
    downshifted: 0,
  },
};

let scene;
let camera;
let renderer;
let controls;
let starPoints;
let coreGroup;
let photoGroup;
let particleSystem;
let pointMaterial;
let pointGeometry;

let particleState;
let lastFrame = performance.now();
let audioEnabled = false;

const textCanvas = document.createElement("canvas");
const textCtx = textCanvas.getContext("2d", { willReadFrequently: true });

bootstrap();

async function bootstrap() {
  if (window.__threeReady && typeof window.__threeReady.then === "function") {
    await window.__threeReady;
  }

  if (!window.THREE || !window.THREE.OrbitControls) {
    app.loadingEl.classList.remove("hidden");
    app.loadingEl.textContent = "3D 资源加载失败，请刷新或切换网络";
    console.error("THREE load failed", window.__threeLoadError);
    return;
  }

  init();
  startExperience().catch((err) => {
    console.error(err);
  });
}

function init() {
  initScene();
  initStars();
  initParticles();
  initFireworksLayer();
  initLoveNote();
  bindMusicButton();

  app.photoPreloadPromise = preloadPhotoTextures(CONFIG.heart.photoCount);

  window.addEventListener("resize", handleResize, { passive: true });
  requestAnimationFrame(animate);
}

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050914, 0.0016);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 0, 220);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.renderer.maxPixelRatio * QUALITY.pixelRatioScale));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  app.root.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.enabled = false;
  controls.minDistance = 90;
  controls.maxDistance = 380;

  coreGroup = new THREE.Group();
  scene.add(coreGroup);

  photoGroup = new THREE.Group();
  coreGroup.add(photoGroup);
}

function initStars() {
  const geo = new THREE.BufferGeometry();
  const count = CONFIG.stars.count;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  const colorA = new THREE.Color("#f6f8ff");
  const colorB = new THREE.Color("#9db5ff");

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const r = 680 * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    pos[i3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i3 + 1] = r * Math.cos(phi) * 0.8;
    pos[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const mix = Math.random();
    col[i3] = THREE.MathUtils.lerp(colorA.r, colorB.r, mix);
    col[i3 + 1] = THREE.MathUtils.lerp(colorA.g, colorB.g, mix);
    col[i3 + 2] = THREE.MathUtils.lerp(colorA.b, colorB.b, mix);
  }

  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: CONFIG.stars.size,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  starPoints = new THREE.Points(geo, mat);
  scene.add(starPoints);
}

function initParticles() {
  const max = CONFIG.particle.maxCount;
  const positions = new Float32Array(max * 3);
  const targets = new Float32Array(max * 3);
  const velocities = new Float32Array(max * 3);
  const colors = new Float32Array(max * 3);

  for (let i = 0; i < max; i += 1) {
    const i3 = i * 3;
    const p = randomSpherePoint(CONFIG.particle.spawnRadius);
    positions[i3] = p.x;
    positions[i3 + 1] = p.y;
    positions[i3 + 2] = p.z;

    targets[i3] = p.x;
    targets[i3 + 1] = p.y;
    targets[i3 + 2] = p.z;

    colors[i3] = 1;
    colors[i3 + 1] = 0.84;
    colors[i3 + 2] = 0.65;
  }

  pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  pointGeometry.setDrawRange(0, 0);

  pointMaterial = new THREE.PointsMaterial({
    size: CONFIG.particle.pointSize,
    map: createPointTexture(),
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    sizeAttenuation: true,
  });

  particleSystem = new THREE.Points(pointGeometry, pointMaterial);
  coreGroup.add(particleSystem);

  particleState = {
    count: 0,
    positions,
    targets,
    velocities,
    colors,
    mode: "idle",
    explodeEndAt: 0,
    pulse: 0,
    explodeDuration: CONFIG.timing.phraseExitMs,
  };
}

function initFireworksLayer() {
  resizeFireCanvas();
}

function initLoveNote() {
  if (!app.loveNoteEl || !app.loveNoteTextEl) {
    return;
  }

  app.loveNoteEl.classList.add("hidden");
  app.loveNoteEl.classList.remove("show");
  app.loveNoteTextEl.textContent = "";
  app.loveNoteStarted = false;
}

async function startLoveNoteTyping() {
  if (app.loveNoteStarted || !app.loveNoteEl || !app.loveNoteTextEl) {
    return;
  }

  app.loveNoteStarted = true;
  app.loveNoteEl.classList.remove("hidden");
  await wait(140);
  app.loveNoteEl.classList.add("show");

  await wait(CONFIG.loveNote.delayMs);

  let out = "";
  const chars = [...CONFIG.loveNote.text];
  for (let i = 0; i < chars.length; i += 1) {
    out += chars[i];
    app.loveNoteTextEl.textContent = out;

    let gap = CONFIG.loveNote.charMs + randomBetween(-CONFIG.loveNote.jitterMs, CONFIG.loveNote.jitterMs);
    if ("，。！？,.!".includes(chars[i])) {
      gap += 80;
    }
    await wait(Math.max(45, gap));
  }
}

function bindMusicButton() {
  checkBgmFile();
  void tryPlayBgm("init");
  startAutoPlayAssistant();

  app.musicBtn.addEventListener("click", async () => {
    if (app.musicBtn.classList.contains("disabled")) {
      return;
    }

    if (!audioEnabled || app.bgm.paused) {
      await tryPlayBgm("button");
    } else {
      app.bgm.pause();
      app.musicBtn.textContent = "播放音乐";
    }
  });

  app.bgm.addEventListener("error", () => {
    app.musicBtn.textContent = "音乐文件缺失";
    app.musicBtn.classList.add("disabled");
  });

  app.bgm.addEventListener("pause", () => {
    if (audioEnabled) {
      app.musicBtn.textContent = "播放音乐";
    }
  });

  app.bgm.addEventListener("play", () => {
    app.musicBtn.textContent = "暂停音乐";
  });
}


function startAutoPlayAssistant() {
  if (app.musicBtn.classList.contains("disabled")) {
    return;
  }

  function cleanup() {
    window.removeEventListener("pointerdown", onFirstGesture, true);
    window.removeEventListener("touchstart", onFirstGesture, true);
    window.removeEventListener("keydown", onFirstGesture, true);
  }

  async function onFirstGesture() {
    const ok = await tryPlayBgm("gesture");
    if (ok) {
      cleanup();
    }
  }

  window.addEventListener("pointerdown", onFirstGesture, { passive: true, capture: true });
  window.addEventListener("touchstart", onFirstGesture, { passive: true, capture: true });
  window.addEventListener("keydown", onFirstGesture, { passive: true, capture: true });
}

async function tryPlayBgm(reason = "manual") {
  if (app.musicBtn.classList.contains("disabled")) {
    return false;
  }

  if (!app.bgm.paused) {
    audioEnabled = true;
    app.musicBtn.textContent = "暂停音乐";
    return true;
  }

  const shouldMuteBoot = reason === "init";
  if (shouldMuteBoot) {
    app.bgm.muted = true;
  }

  try {
    await app.bgm.play();
    audioEnabled = true;
    if (shouldMuteBoot) {
      app.bgm.muted = false;
    }
    app.musicBtn.textContent = "暂停音乐";
    return true;
  } catch (err) {
    if (shouldMuteBoot) {
      app.bgm.muted = false;
    }
    if (reason === "button") {
      console.warn("播放失败，需要用户再次点击", err);
    }
    return false;
  }
}
async function checkBgmFile() {
  const src = app.bgm.getAttribute("src");
  if (!src) {
    markMusicMissing();
    return;
  }

  try {
    const res = await fetch(src, { method: "HEAD", cache: "no-store" });
    if (!res.ok) {
      markMusicMissing();
    }
  } catch (_) {
    markMusicMissing();
  }
}

function markMusicMissing() {
  app.musicBtn.textContent = "请放入 assets/bgm.mp3";
  app.musicBtn.classList.add("disabled");
}

async function startExperience() {
  await wait(350);
  try {
    await runCountdown();
    await runBlessingLines();
    await morphToHeart();
  } catch (err) {
    console.error("startExperience failed:", err);
    showLoading("动画出现错误，请刷新重试");
  }
}

async function runCountdown() {
  const colors = [CONFIG.text.colorC, CONFIG.text.colorB, CONFIG.text.colorA];
  const numbers = ["3", "2", "1"];

  for (let i = 0; i < numbers.length; i += 1) {
    setTextAsParticles(numbers[i], colors[i % colors.length]);
    particleState.mode = "morph";
    particleState.pulse = 1;

    await wait(CONFIG.timing.countdownStepMs - CONFIG.timing.countdownScatterMs);

    triggerParticleExplosion(CONFIG.timing.countdownScatterMs);
    await wait(CONFIG.timing.countdownScatterMs);
  }
}

async function runBlessingLines() {
  let hasPrevious = false;

  for (let lineIndex = 0; lineIndex < CONFIG.text.lines.length; lineIndex += 1) {
    const line = CONFIG.text.lines[lineIndex];

    if (hasPrevious) {
      triggerParticleExplosion(CONFIG.timing.phraseExitMs);
      await wait(CONFIG.timing.phraseExitMs);
    }

    setTextAsParticles(line, pickLineColor(lineIndex), line);
    particleState.pulse = 0.35;
    await wait(CONFIG.timing.phraseAssembleMs);

    await wait(CONFIG.timing.phraseHoldMs);
    hasPrevious = true;
  }
}

async function morphToHeart() {
  showLoading("正在准备回忆照片...");

  app.textures = await app.photoPreloadPromise;

  const heartTargets = buildHeartTargets(CONFIG.heart.pointCount);
  app.heartBaseTargets = heartTargets.map((p) => p.clone());
  app.heartSpread = 1;
  applyTargetPositions(heartTargets, true);
  particleState.mode = "heart";
  pointMaterial.opacity = 0.96;
  pointMaterial.size = CONFIG.particle.pointSize * 1.08;

  createPhotoCards(app.textures);
  hideLoading();

  app.stage = "heart";
  app.fireworks.interval = CONFIG.fireworks.heartIntervalMs;

  const dist = Math.max(120, app.heartMetrics.height * 1.35);
  camera.position.set(0, 0, dist);
  controls.minDistance = dist * 0.55;
  controls.maxDistance = dist * 1.7;
  controls.enabled = true;
  controls.target.set(0, 0, 0);
  controls.update();

  void startLoveNoteTyping();
}

function setTextAsParticles(text, colorHex, layoutText = text) {
  const points = rasterizeText(text, layoutText);
  applyTargetPositions(points, true, colorHex);
  particleState.mode = "morph";
  pointMaterial.opacity = 0.95;
  pointMaterial.size = CONFIG.particle.pointSize;
}

function applyTargetPositions(points, keepNearCurrent = false, forcedColor = null) {
  const max = CONFIG.particle.maxCount;
  const count = Math.min(points.length, max);
  const oldCount = particleState.count;

  const pos = particleState.positions;
  const tar = particleState.targets;
  const col = particleState.colors;

  let colorA = new THREE.Color(forcedColor || CONFIG.text.colorA);
  let colorB = new THREE.Color(CONFIG.text.colorB);

  if (keepNearCurrent && !forcedColor) {
    colorA = new THREE.Color(CONFIG.text.colorA);
    colorB = new THREE.Color(CONFIG.text.colorC);
  }

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const p = points[i];
    tar[i3] = p.x;
    tar[i3 + 1] = p.y;
    tar[i3 + 2] = p.z;

    if (!keepNearCurrent || i >= oldCount) {
      const spawn = randomSpherePoint(CONFIG.particle.spawnRadius + Math.random() * 14);
      pos[i3] = spawn.x;
      pos[i3 + 1] = spawn.y;
      pos[i3 + 2] = spawn.z;
    }

    const t = i / Math.max(1, count - 1);
    const mixed = new THREE.Color().lerpColors(colorA, colorB, t * 0.9);
    col[i3] = mixed.r;
    col[i3 + 1] = mixed.g;
    col[i3 + 2] = mixed.b;
  }

  for (let i = count; i < max; i += 1) {
    const i3 = i * 3;
    tar[i3] = 9999;
    tar[i3 + 1] = 9999;
    tar[i3 + 2] = -9999;
  }

  particleState.count = count;
  pointGeometry.setDrawRange(0, count);
  pointGeometry.attributes.position.needsUpdate = true;
  pointGeometry.attributes.color.needsUpdate = true;
}

function rasterizeText(text, layoutText = text) {
  const width = 1024;
  const height = 512;
  textCanvas.width = width;
  textCanvas.height = height;

  textCtx.clearRect(0, 0, width, height);

  let fontSize = Math.floor(Math.min(window.innerWidth * 0.24, window.innerHeight * 0.24));
  if (layoutText.length >= 4) fontSize *= 0.78;
  if (layoutText.length >= 7) fontSize *= 0.62;
  if (layoutText.length >= 10) fontSize *= 0.48;
  fontSize = Math.max(44, fontSize);

  textCtx.font = `700 ${fontSize}px ${CONFIG.text.fontFamily}`;
  textCtx.textBaseline = "middle";
  textCtx.fillStyle = "#ffffff";
  if (text !== layoutText) {
    textCtx.textAlign = "left";
    const fullWidth = textCtx.measureText(layoutText).width;
    const startX = width / 2 - fullWidth / 2;
    textCtx.fillText(text, startX, height / 2);
  } else {
    textCtx.textAlign = "center";
    textCtx.fillText(text, width / 2, height / 2);
  }

  const imageData = textCtx.getImageData(0, 0, width, height).data;
  const step = QUALITY.sampleStep;

  const visibleHeight = getVisibleHeightAtDistance(camera.position.length());
  const scale = (visibleHeight / height) * 0.58;

  const pts = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4 + 3;
      if (imageData[idx] > 130) {
        const px = (x - width / 2) * scale;
        const py = (height / 2 - y) * scale;
        const pz = ((((x * 73856093) ^ (y * 19349663)) & 1023) / 1023 - 0.5) * 1.6;
        pts.push(new THREE.Vector3(px, py, pz));
      }
    }
  }

  if (pts.length > CONFIG.particle.maxCount) {
    const reduced = [];
    const stride = pts.length / CONFIG.particle.maxCount;
    for (let i = 0; i < CONFIG.particle.maxCount; i += 1) {
      reduced.push(pts[Math.floor(i * stride)]);
    }
    return reduced;
  }

  return pts;
}

function buildHeartTargets(count) {
  const metrics = computeHeartMetrics();
  app.heartMetrics = metrics;

  const points = [];
  for (let i = 0; i < count; i += 1) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());

    const x2d = 16 * Math.pow(Math.sin(t), 3);
    const y2d =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);

    const x = x2d * r * metrics.scale;
    const y = y2d * r * metrics.scale;

    const depthFactor = 1 - r;
    const z = (Math.random() * 2 - 1) * CONFIG.heart.depth * (0.35 + depthFactor);

    points.push(new THREE.Vector3(x, y, z));
  }

  return points;
}

function createPhotoCards(textures) {
  while (photoGroup.children.length) {
    const child = photoGroup.children[photoGroup.children.length - 1];
    photoGroup.remove(child);
    child.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        obj.material?.dispose();
      }
    });
  }

  const anchors = generatePhotoAnchors(CONFIG.heart.photoCount);

  for (let i = 0; i < CONFIG.heart.photoCount; i += 1) {
    const tex = textures[i] || createFallbackTexture(i + 1);
    const scaleJitter = randomBetween(CONFIG.heart.photoScaleMin, CONFIG.heart.photoScaleMax);

    const cardH = app.heartMetrics.height * CONFIG.heart.photoHeightRatio * scaleJitter;
    const cardW = cardH * 0.72;

    const frameGeo = new THREE.PlaneGeometry(cardW * 1.07, cardH * 1.07);
    const frameMat = new THREE.MeshBasicMaterial({
      color: CONFIG.heart.photoBorder,
      transparent: true,
      opacity: 0.27,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const photoGeo = new THREE.PlaneGeometry(cardW, cardH);
    const photoMat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
    });

    const card = new THREE.Group();
    const frame = new THREE.Mesh(frameGeo, frameMat);
    const image = new THREE.Mesh(photoGeo, photoMat);
    image.position.z = 0.4;

    card.add(frame);
    card.add(image);

    const anchor = anchors[i] || new THREE.Vector3(0, 0, 0);
    card.position.copy(anchor);
    card.lookAt(0, 0, 0);
    card.rotateZ((Math.random() - 0.5) * 0.35);
    card.rotateY((Math.random() - 0.5) * 0.25);

    card.userData = {
      origin: anchor.clone(),
      phase: Math.random() * Math.PI * 2,
      amplitude: randomBetween(0.25, 0.62),
      speed: randomBetween(0.4, 1.0),
      baseScale: randomBetween(0.9, 1.12),
    };

    photoGroup.add(card);
  }
}

function generatePhotoAnchors(targetCount) {
  const candidates = [];
  const metrics = app.heartMetrics;

  for (let i = 0; i < 1500; i += 1) {
    const t = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.72);

    const x2d = 16 * Math.pow(Math.sin(t), 3);
    const y2d =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);

    const x = x2d * r * metrics.scale;
    const y = y2d * r * metrics.scale;
    const z = (Math.random() * 2 - 1) * CONFIG.heart.depth * (0.22 + (1 - r) * 0.9);
    candidates.push(new THREE.Vector3(x, y, z));
  }

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  const selected = [];
  let minDist = metrics.height * 0.12;

  while (selected.length < targetCount && minDist > metrics.height * 0.045) {
    selected.length = 0;
    for (let i = 0; i < candidates.length && selected.length < targetCount; i += 1) {
      const c = candidates[i];
      let ok = true;
      for (let j = 0; j < selected.length; j += 1) {
        if (c.distanceTo(selected[j]) < minDist) {
          ok = false;
          break;
        }
      }
      if (ok) {
        selected.push(c);
      }
    }
    minDist *= 0.9;
  }

  while (selected.length < targetCount) {
    selected.push(candidates[selected.length % candidates.length]);
  }

  return selected.slice(0, targetCount);
}

function triggerParticleExplosion(durationMs) {
  particleState.mode = "explode";
  particleState.explodeDuration = durationMs;
  particleState.explodeEndAt = performance.now() + durationMs;

  const vel = particleState.velocities;
  const count = particleState.count;

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const dir = randomSpherePoint(1);
    const speed = CONFIG.particle.explodeSpeed * randomBetween(0.6, 1.3);
    vel[i3] = dir.x * speed;
    vel[i3 + 1] = dir.y * speed;
    vel[i3 + 2] = dir.z * speed;
  }
}

function animate(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  updatePerformance(dt, now);
  updateParticles(dt, now);
  updateStars(dt);
  updateHeartMotion(dt, now * 0.001);
  updateFireworks(dt, now);

  controls.update();
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

function updateParticles(dt, now) {
  const pos = particleState.positions;
  const tar = particleState.targets;
  const vel = particleState.velocities;

  const count = particleState.count;
  if (count <= 0) {
    return;
  }

  const attr = pointGeometry.attributes.position;

  if (particleState.mode === "explode") {
    const step = dt * 60;
    const left = Math.max(0, particleState.explodeEndAt - now);
    const ratio = particleState.explodeDuration > 0 ? left / particleState.explodeDuration : 0;
    pointMaterial.opacity = 0.15 + ratio * 0.8;

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      vel[i3 + 1] -= CONFIG.particle.explodeGravity * step;
      vel[i3] *= CONFIG.particle.explodeDrag;
      vel[i3 + 1] *= CONFIG.particle.explodeDrag;
      vel[i3 + 2] *= CONFIG.particle.explodeDrag;

      pos[i3] += vel[i3] * step;
      pos[i3 + 1] += vel[i3 + 1] * step;
      pos[i3 + 2] += vel[i3 + 2] * step;
    }

    if (now >= particleState.explodeEndAt) {
      particleState.mode = "idle";
    }
  } else {
    const lerp = 1 - Math.pow(1 - CONFIG.particle.morphLerp, dt * 60);

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      pos[i3] += (tar[i3] - pos[i3]) * lerp;
      pos[i3 + 1] += (tar[i3 + 1] - pos[i3 + 1]) * lerp;
      pos[i3 + 2] += (tar[i3 + 2] - pos[i3 + 2]) * lerp;
    }

    if (particleState.pulse > 0) {
      pointMaterial.size = CONFIG.particle.pointSize * (1 + particleState.pulse * 0.7);
      particleState.pulse = Math.max(0, particleState.pulse - dt * 2.6);
    } else {
      const base = app.stage === "heart" ? CONFIG.particle.pointSize * 1.08 : CONFIG.particle.pointSize;
      pointMaterial.size += (base - pointMaterial.size) * Math.min(1, dt * 8);
    }

    pointMaterial.opacity += ((app.stage === "heart" ? 0.96 : 0.94) - pointMaterial.opacity) * Math.min(1, dt * 4);
  }

  attr.needsUpdate = true;
}

function updateStars(dt) {
  starPoints.rotation.y += dt * 0.012;
  starPoints.rotation.x += dt * 0.004;
}

function updateHeartMotion(dt, timeSec) {
  if (app.stage !== "heart") {
    return;
  }

  const dist = camera.position.distanceTo(controls.target);
  const zoomT = THREE.MathUtils.clamp(
    (dist - controls.minDistance) / Math.max(0.001, controls.maxDistance - controls.minDistance),
    0,
    1
  );
  const targetSpread = THREE.MathUtils.lerp(CONFIG.heart.zoomSpreadNear, CONFIG.heart.zoomSpreadFar, zoomT);
  app.heartSpread += (targetSpread - app.heartSpread) * Math.min(1, dt * CONFIG.heart.spreadLerp);
  applyHeartSpreadTargets(app.heartSpread);

  coreGroup.rotation.y += CONFIG.heart.rotationSpeed * dt;

  photoGroup.children.forEach((card) => {
    const d = card.userData;
    const wobble = Math.sin(timeSec * d.speed + d.phase) * d.amplitude;
    card.position.x = d.origin.x * app.heartSpread;
    card.position.y = d.origin.y * app.heartSpread + wobble;
    card.position.z = d.origin.z * app.heartSpread;
    const zoomScale = THREE.MathUtils.clamp(0.86 + (app.heartSpread - 1) * 0.5, 0.74, 1.2);
    card.scale.setScalar(d.baseScale * zoomScale);
  });
}

function applyHeartSpreadTargets(spread) {
  const base = app.heartBaseTargets;
  if (!base || base.length === 0) {
    return;
  }

  const tar = particleState.targets;
  const count = Math.min(base.length, particleState.count);
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    tar[i3] = base[i].x * spread;
    tar[i3 + 1] = base[i].y * spread;
    tar[i3 + 2] = base[i].z * spread;
  }
}

function updateFireworks(dt, now) {
  const ctx = app.fireCtx;

  // Fade old sparks without painting an opaque layer.
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0, 0, 0, ${CONFIG.fireworks.fadeAlpha})`;
  ctx.fillRect(0, 0, app.fireworks.viewWidth, app.fireworks.viewHeight);
  ctx.globalCompositeOperation = "lighter";

  if (now - app.fireworks.lastSpawnAt > app.fireworks.interval) {
    spawnFireworkBurst();
    app.fireworks.lastSpawnAt = now;
  }

  const particles = app.fireworks.particles;
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    const step = dt * 60;

    p.life -= step;
    const gravity = p.gravity ?? CONFIG.fireworks.gravity;
    const drag = p.drag ?? CONFIG.fireworks.drag;
    p.vy += gravity * step;
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * step;
    p.y += p.vy * step;

    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 6) p.trail.shift();

    const alpha = Math.max(0, p.life / p.maxLife);

    if (p.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let t = 1; t < p.trail.length; t += 1) {
        ctx.lineTo(p.trail[t].x, p.trail[t].y);
      }
      ctx.strokeStyle = withAlpha(p.color, alpha * 0.55);
      ctx.lineWidth = p.size * 1.05;
      ctx.stroke();
    }

    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5.2);
    g.addColorStop(0, withAlpha("#ffffff", alpha * 0.3));
    g.addColorStop(0.24, withAlpha(p.color, alpha * 1));
    g.addColorStop(1, withAlpha(p.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function spawnFireworkBurst() {
  const w = app.fireworks.viewWidth;
  const h = app.fireworks.viewHeight;
  const burstTotal =
    app.stage === "heart"
      ? randomInt(CONFIG.fireworks.simultaneousBurstsHeart, CONFIG.fireworks.simultaneousBurstsHeart + 1)
      : randomInt(CONFIG.fireworks.simultaneousBurstsIntro, CONFIG.fireworks.simultaneousBurstsIntro + 1);

  for (let b = 0; b < burstTotal; b += 1) {
    const cx = randomBetween(w * 0.08, w * 0.92);
    const cy = randomBetween(h * 0.08, h * 0.58);
    const type = pickFireworkType();
    emitFireworkByType(type, cx, cy);
  }
}

function pickFireworkType() {
  const r = Math.random();
  if (r < 0.24) return "peony";
  if (r < 0.43) return "ring";
  if (r < 0.6) return "chrysanthemum";
  if (r < 0.75) return "willow";
  if (r < 0.88) return "heart";
  return "spiral";
}

function emitFireworkByType(type, cx, cy) {
  const baseCount = CONFIG.fireworks.burstParticles;
  const count = Math.max(
    20,
    Math.floor(baseCount * randomBetween(CONFIG.fireworks.burstMultiplierMin, CONFIG.fireworks.burstMultiplierMax))
  );

  const c1 = pickFireColor();
  const c2 = pickFireColor(c1);

  if (type === "ring") {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + randomBetween(-0.03, 0.03);
      const speed = randomBetween(3.2, 5.8);
      pushFireParticle(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 2 === 0 ? c1 : c2,
        life: randomBetween(42, 68),
        size: randomBetween(1.0, 1.9),
      });
    }
    return;
  }

  if (type === "heart") {
    const scale = randomBetween(0.19, 0.26);
    for (let i = 0; i < count; i += 1) {
      const t = (i / count) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const vx = hx * scale + randomBetween(-0.22, 0.22);
      const vy = hy * scale + randomBetween(-0.22, 0.22);
      pushFireParticle(cx, cy, vx, vy, {
        color: i % 3 === 0 ? c2 : c1,
        life: randomBetween(44, 74),
        size: randomBetween(0.95, 1.75),
      });
    }
    return;
  }

  if (type === "spiral") {
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const a = t * Math.PI * 12 + randomBetween(-0.06, 0.06);
      const speed = randomBetween(1.2, 5.4) * (0.4 + t * 0.8);
      pushFireParticle(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: t > 0.5 ? c2 : c1,
        life: randomBetween(36, 62),
        size: randomBetween(0.8, 1.6),
      });
    }
    return;
  }

  if (type === "willow") {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = randomBetween(2.4, 5.0);
      pushFireParticle(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed - randomBetween(0.8, 2.0), {
        color: i % 2 === 0 ? c1 : c2,
        life: randomBetween(58, 92),
        size: randomBetween(0.95, 1.7),
        gravity: CONFIG.fireworks.gravity * 0.72,
        drag: 0.987,
      });
    }
    return;
  }

  if (type === "chrysanthemum") {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + randomBetween(-0.09, 0.09);
      const band = 0.75 + Math.sin(i * 0.33) * 0.25 + Math.random() * 0.12;
      const speed = randomBetween(2.5, 5.6) * band;
      pushFireParticle(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, {
        color: i % 4 === 0 ? c2 : c1,
        life: randomBetween(40, 70),
        size: randomBetween(0.9, 1.8),
      });
    }
    return;
  }

  // peony default
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const speed = Math.pow(Math.random(), 0.42) * randomBetween(2.2, 6.2);
    pushFireParticle(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, {
      color: i % 3 === 0 ? c2 : c1,
      life: randomBetween(38, 66),
      size: randomBetween(0.9, 1.8),
    });
  }
}

function pushFireParticle(x, y, vx, vy, opt) {
  app.fireworks.particles.push({
    x,
    y,
    vx,
    vy,
    life: opt.life,
    maxLife: opt.life,
    color: opt.color,
    size: opt.size,
    gravity: opt.gravity,
    drag: opt.drag,
    trail: [{ x, y }],
  });
}

function pickFireColor(exclude = null) {
  let color = CONFIG.fireworks.colors[Math.floor(Math.random() * CONFIG.fireworks.colors.length)];
  if (exclude && color === exclude) {
    color = CONFIG.fireworks.colors[(CONFIG.fireworks.colors.indexOf(color) + 1) % CONFIG.fireworks.colors.length];
  }
  return color;
}

function randomInt(min, maxInclusive) {
  return Math.floor(randomBetween(min, maxInclusive + 1));
}

async function preloadPhotoTextures(count) {
  const loader = new THREE.TextureLoader();
  const tasks = [];

  for (let i = 1; i <= count; i += 1) {
    tasks.push(
      new Promise((resolve) => {
        const path = `./assets/photos/${i}.jpg`;
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve(createFallbackTexture(i));
        }, 3200);

        loader.load(
          path,
          (tex) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            resolve(tex);
          },
          undefined,
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(createFallbackTexture(i));
          }
        );
      })
    );
  }

  return Promise.all(tasks);
}

function createFallbackTexture(i) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 356;
  const ctx = c.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "#20335f");
  g.addColorStop(1, "#0d1630");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);

  ctx.fillStyle = "#e8f1ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 40px sans-serif";
  ctx.fillText(String(i), c.width / 2, c.height / 2);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPointTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");

  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,244,225,0.85)");
  g.addColorStop(1, "rgba(255,230,180,0)");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function updatePerformance(dt, now) {
  app.fps.frames += 1;
  app.fps.elapsed += dt;

  if (now - app.fps.lastCheck < 1600) {
    return;
  }

  const fps = app.fps.frames / Math.max(0.001, app.fps.elapsed);
  app.fps.frames = 0;
  app.fps.elapsed = 0;
  app.fps.lastCheck = now;

  if (fps < 32 && app.fps.downshifted < 2) {
    app.fps.downshifted += 1;
    CONFIG.fireworks.burstParticles = Math.max(24, Math.floor(CONFIG.fireworks.burstParticles * 0.78));
    app.fireworks.interval = Math.min(1900, Math.floor(app.fireworks.interval * 1.18));

    const nextPixelRatio = Math.max(1, renderer.getPixelRatio() * 0.88);
    renderer.setPixelRatio(nextPixelRatio);
  }
}

function computeHeartMetrics() {
  const dist = camera.position.length();
  const visibleHeight = getVisibleHeightAtDistance(dist);
  const targetHeartHeight = visibleHeight * CONFIG.heart.occupyScreenHeight;

  return {
    height: targetHeartHeight,
    scale: targetHeartHeight / 30,
  };
}

function getVisibleHeightAtDistance(distance) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  return 2 * Math.tan(vFov / 2) * distance;
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.renderer.maxPixelRatio * QUALITY.pixelRatioScale));

  resizeFireCanvas();

  if (app.stage === "heart") {
    const targets = buildHeartTargets(CONFIG.heart.pointCount);
    app.heartBaseTargets = targets.map((p) => p.clone());
    app.heartSpread = 1;
    applyTargetPositions(targets, true);
    createPhotoCards(app.textures);
  }
}

function resizeFireCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  app.fireCanvas.width = Math.floor(window.innerWidth * dpr);
  app.fireCanvas.height = Math.floor(window.innerHeight * dpr);
  app.fireCanvas.style.width = `${window.innerWidth}px`;
  app.fireCanvas.style.height = `${window.innerHeight}px`;

  app.fireworks.viewWidth = window.innerWidth;
  app.fireworks.viewHeight = window.innerHeight;

  app.fireCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.fireCtx.globalCompositeOperation = "source-over";
}

function showLoading(text) {
  app.loadingEl.textContent = text;
  app.loadingEl.classList.remove("hidden");
}

function hideLoading() {
  app.loadingEl.classList.add("hidden");
}

function pickLineColor(i) {
  const palette = [CONFIG.text.colorA, CONFIG.text.colorB, CONFIG.text.colorC];
  return palette[i % palette.length];
}

function randomSpherePoint(radius) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = radius * Math.cbrt(Math.random());

  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function withAlpha(hexColor, alpha) {
  const c = new THREE.Color(hexColor);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${Math.max(0, Math.min(1, alpha))})`;
}

function detectQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const dpr = window.devicePixelRatio || 1;

  const score = (cores * (mobile ? 0.88 : 1.18)) / (dpr > 2 ? 1.25 : 1);

  if (score < 3.8) {
    return {
      particleScale: 0.56,
      starScale: 0.66,
      fireworkScale: 0.58,
      pixelRatioScale: 0.86,
      sampleStep: 5,
    };
  }

  if (score < 6.8) {
    return {
      particleScale: 0.78,
      starScale: 0.82,
      fireworkScale: 0.8,
      pixelRatioScale: 0.95,
      sampleStep: 4,
    };
  }

  return {
    particleScale: 1,
    starScale: 1,
    fireworkScale: 1,
    pixelRatioScale: 1,
    sampleStep: 3,
  };
}

