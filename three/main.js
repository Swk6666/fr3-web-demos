import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

function srgb(r, g, b) {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

const CAMERA_PRESETS = {
  // Balanced hero framing: KUKA orange elbow + 3030 aluminum cart/cabinet + FR3 + translucent brandy glass
  hero: { pos: [2.45, -1.45, 3.05], target: [-0.72, 0.96, 2.08], fov: 30 },
  workcell: { pos: [5.7134, -3.865, 4.7803], target: [-0.808, 0.21, 1.5161], fov: 27 },
  detail: { pos: [2.0496, -0.8208, 2.7281], target: [-0.8747, 0.3607, 2.0577], fov: 22 },
  base: { pos: [-0.0551, 0.1606, 2.2004], target: [-0.8035, 1.2964, 1.7857], fov: 33 },
  ee: { pos: [0.12, 0.72, 2.68], target: [-0.46, 1.30, 2.58], fov: 30 },
  side: { pos: [-0.45, -1.65, 2.41], target: [-0.61, 1.15, 2.14], fov: 32 },
  top: { pos: [-0.66, 0.85, 5.20], target: [-0.66, 0.85, 1.80], fov: 34 },
};

const BEAM_CAMERA_PRESETS = {
  // Oblique 3/4 hero: FR3 + crystal brandy glass large on right, 3.5 m stress beam sweeping back-left to root clamp
  hero: { pos: [2.20, -2.35, 2.68], target: [-0.68, 0.0, 1.84], fov: 31 },
  workcell: { pos: [-1.45, -4.85, 2.38], target: [-1.55, 0.0, 1.76], fov: 33 },
  detail: { pos: [-1.75, -1.85, 2.15], target: [-3.15, 0.0, 1.55], fov: 30 },
  base: { pos: [0.95, -1.45, 2.02], target: [-0.08, 0.0, 1.66], fov: 30 },
  ee: { pos: [1.05, -0.82, 2.42], target: [0.34, 0.0, 2.14], fov: 28 },
  side: { pos: [-1.55, -5.15, 1.88], target: [-1.55, 0.0, 1.72], fov: 31 },
  top: { pos: [-1.45, 0.0, 6.20], target: [-1.45, 0.0, 1.55], fov: 34 },
};

function getCameraPresetsForDemo(demoId) {
  return demoId === 5 ? BEAM_CAMERA_PRESETS : CAMERA_PRESETS;
}

const DEMO_META = {
  0: {
    title: 'Still Wine',
    desc: 'Stabilizing a free-standing glass of red wine in the world frame under unknown moving\u2011base disturbances — zero spills, minimal ripples.',
    phaseNames: { 0: 'Holding' },
    paramsOverride: { kTrans: 200, kRot: 200 },
    cam: { ...CAMERA_PRESETS.hero, preset: 'hero' },
  },
  1: {
    title: 'Tracking',
    desc: 'The end effector traces a taiji (yin-yang) symbol and a circle in world space, with the glass on board, while the base keeps moving.',
    phaseNames: { 0: 'Tracking' },
    paramsOverride: { kTrans: 200, kRot: 200, trackingMode: 0 },
    cam: { pos: [0.68, 0.52, 2.70], target: [-0.46, 1.28, 2.48], fov: 30 },
  },
  2: {
    title: 'Cart-Pole',
    desc: 'A passive pendulum on the end effector is swung up and balanced while the base moves.',
    // 3: the aligned low level's warm-up, the pendulum held by the hand (cartpole_kuka warmup_s).
    phaseNames: { 0: 'Kick', 1: 'Swing-up', 2: 'Balancing', 3: 'Held' },
    paramsOverride: { kTrans: 160, kRot: 80, supportScale: 0.3 },
    cam: { pos: [-1.14, -0.41, 2.85], target: [-0.46, 1.18, 2.62], fov: 30 },
  },
  4: {
    title: 'Docking',
    desc: 'A plug at the wrist is compliantly aligned and seated into a docking station on a moving base.',
    phaseNames: { 0: 'Settling', 1: 'Approaching', 2: 'Aligning', 3: 'Seated' },
    paramsOverride: { kTrans: 300, kRot: 300 },
    cam: { pos: [0.12, 0.68, 2.68], target: [-0.46, 1.30, 2.57], fov: 30 },
  },
  5: {
    title: 'Flexible Beam',
    desc: 'The arm stands on a 3.5 m flexible beam. Its own reactions bend the beam, which shakes the base in return.',
    phaseNames: { 0: 'Self-excited', 1: 'Hold', 2: 'Disturber on' },
    paramsOverride: { kTrans: 180, kRot: 160, beamYoungGpa: 8.0, beamTaskMode: 0, beamDisturber: false },
    cam: { ...BEAM_CAMERA_PRESETS.hero, preset: 'hero' },
  },
};

// MuJoCo mjtGeom enum constants
const MJGEOM_PLANE = 0;
const MJGEOM_SPHERE = 2;
const MJGEOM_CAPSULE = 3;
const MJGEOM_CYLINDER = 5;
const MJGEOM_BOX = 6;

// --- Three.js Studio PBR Setup (native Z-up to match MuJoCo 1:1) ---
const canvas = document.getElementById('viewport');
// Without WebGL nothing can be drawn: say so instead of leaving the loading spinner running.
(() => {
  let ok = false;
  try {
    const c = document.createElement('canvas');
    ok = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    ok = false;
  }
  if (!ok) {
    showRecordingsInstead();
    throw new Error('WebGL unavailable');
  }
})();

// No WebGL: play the project page's recording of each demo (the tabs switch clips) instead of the simulator.
function showRecordingsInstead() {
  const clips = {
    0: ['Still Wine', '../media/demo-0.mp4', '../media/demo-0.jpg'],
    1: ['Tracking', '../media/demo-1.mp4', '../media/demo-1.jpg'],
    2: ['Cart-Pole', '../media/demo-2.mp4', '../media/demo-2.jpg'],
    4: ['Docking', '../media/demo-4.mp4', '../media/demo-4.jpg'],
    5: ['Flexible Beam', '../media/demo-5.mp4', '../media/demo-5.jpg'],
  };
  const asked = Number(new URLSearchParams(window.location.search).get('demo'));
  document.body.classList.add('nogl');
  document.getElementById('appShell').classList.add('sidebar-collapsed');
  const banner = document.getElementById('loadingBanner');
  banner.innerHTML = `
    <video class="nogl-video" autoplay muted loop playsinline></video>
    <div class="nogl-card">
      <div class="nogl-kicker">Recording</div>
      <div class="nogl-title">WebGL is off in this browser.</div>
      <p>This is a recording of <b class="nogl-name"></b> from the simulator. To run it live, open this page in a recent
        Chrome, Edge, Safari or Firefox with hardware acceleration on.</p>
      <a class="nogl-back" href="../">‹ Back to the project page</a>
    </div>`;
  const video = banner.querySelector('.nogl-video');
  const show = (id) => {
    const [title, src, poster] = clips[id] || clips[0];
    video.poster = poster;
    video.src = src;
    video.play().catch(() => {});
    banner.querySelector('.nogl-name').textContent = title;
    document.querySelectorAll('.demo-tab').forEach((b) => b.classList.toggle('active', Number(b.dataset.demo) === (clips[id] ? id : 0)));
  };
  document.querySelectorAll('.demo-tab').forEach((b) => {
    b.onclick = () => show(Number(b.dataset.demo));
  });
  show(asked);
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const IS_SMALL_TOUCH = window.matchMedia('(max-width: 960px), (pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_SMALL_TOUCH ? 1.5 : 2));
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
// Fog is mixed after tone mapping, so the sky dome below skips tone mapping and uses the
// same horizon color: the distant floor then fades seamlessly into the backdrop.
const FOG_COLOR = srgb(0.945, 0.945, 0.955);
scene.background = FOG_COLOR;
scene.fog = new THREE.Fog(FOG_COLOR, 9, 34);

// Z-up studio gradient sky dome
const skyGeo = new THREE.SphereGeometry(52, 32, 20);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTopColor: { value: srgb(0.985, 0.985, 0.99) },
    uHorizonColor: { value: FOG_COLOR },
    uBottomColor: { value: FOG_COLOR },
  },
  vertexShader: `
    varying vec3 vWorldDir;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldDir = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform vec3 uTopColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uBottomColor;
    varying vec3 vWorldDir;
    void main() {
      float z = normalize(vWorldDir).z;
      vec3 col = z >= 0.0
        ? mix(uHorizonColor, uTopColor, smoothstep(0.0, 0.42, z))
        : mix(uHorizonColor, uBottomColor, smoothstep(0.0, 0.30, -z));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }
  `,
});
const skyDome = new THREE.Mesh(skyGeo, skyMat);
skyDome.renderOrder = -1;
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(CAMERA_PRESETS.hero.fov, 1, 0.05, 100);
camera.up.set(0, 0, 1);
camera.position.set(...CAMERA_PRESETS.hero.pos);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.25;
controls.maxDistance = 16;
controls.target.set(...CAMERA_PRESETS.hero.target);
controls.update();

// Smooth camera interpolation state (canceled immediately when user drags/scrolls)
const camAnim = {
  active: false,
  startMs: 0,
  durMs: 450,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  fromFov: 30,
  toFov: 30,
};
controls.addEventListener('start', () => {
  camAnim.active = false;
});
let hasRenderedFirstScene = false;

// Neutral daylight studio PBR rig
const hemi = new THREE.HemisphereLight(
  new THREE.Color(0.88, 0.92, 0.98),
  new THREE.Color(0.62, 0.63, 0.66),
  0.50
);
hemi.position.set(0, 0, 10);
scene.add(hemi);

const keyLight = new THREE.SpotLight(0xffffff, 1.42, 24, THREE.MathUtils.degToRad(49), 0.65, 0);
keyLight.position.set(1.6, -3.5, 5.8);
keyLight.target.position.set(-1.0, 0.2, 1.0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 2.0;
keyLight.shadow.camera.far = 14.0;
keyLight.shadow.camera.fov = 52;
keyLight.shadow.bias = -0.0003;
keyLight.shadow.normalBias = 0.006;
keyLight.shadow.radius = 3.2;
keyLight.shadow.blurSamples = 12;
scene.add(keyLight);
scene.add(keyLight.target);

const fillLight = new THREE.DirectionalLight(new THREE.Color(0.84, 0.90, 1.0), 0.76);
fillLight.position.set(-2.4, 6.5, 4.5);
fillLight.target.position.set(-0.8, 0.2, 1.2);
scene.add(fillLight);
scene.add(fillLight.target);

const headlight = new THREE.DirectionalLight(0xffffff, 0.28);
headlight.position.copy(camera.position);
headlight.target.position.copy(controls.target);
scene.add(headlight);
scene.add(headlight.target);

// Seamless light-gray studio floor
const floorGeo = new THREE.PlaneGeometry(96, 96);
const floorMat = new THREE.MeshStandardMaterial({
  color: srgb(0.86, 0.86, 0.88),
  roughness: 0.95,
  metalness: 0.02,
  envMapIntensity: 0.55,
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// Dynamic groups
const robotGroup = new THREE.Group();
scene.add(robotGroup);
const overlayGroup = new THREE.Group();
scene.add(overlayGroup);
// Translucent copy of the arm + glass driven by the fixed-base baseline (worker ghost session)
const ghostGroup = new THREE.Group();
ghostGroup.visible = false;
scene.add(ghostGroup);

// --- Streaming Download Progress Tracker ---
const loadBarFill = document.getElementById('loadBarFill');
const loadProgressMeta = document.getElementById('loadProgressMeta');
const dlProgress = {
  glb: { loaded: 0, total: 6630320 },
  hdr: { loaded: 0, total: 396000 },
  wasm: { loaded: 0, total: 4200000 },
  physics: { loaded: 0, total: 1120000 },
};
let peakProgressPct = 0;

function updateDownloadProgress(key, loaded, total) {
  if (dlProgress[key]) {
    if (total > 0) dlProgress[key].total = total;
    dlProgress[key].loaded = Math.min(dlProgress[key].total, Math.max(dlProgress[key].loaded, loaded));
  }
  let sumLoaded = 0;
  let sumTotal = 0;
  for (const item of Object.values(dlProgress)) {
    sumLoaded += item.loaded;
    sumTotal += item.total;
  }
  const pct = sumTotal > 0 ? Math.min(100, Math.round((sumLoaded / sumTotal) * 100)) : 0;
  peakProgressPct = Math.max(peakProgressPct, pct);
  if (loadBarFill) loadBarFill.style.width = `${Math.max(3, peakProgressPct)}%`;
  if (loadProgressMeta) {
    loadProgressMeta.textContent = `${peakProgressPct}%`;
  }
}

// Loaded visual GLB geometry library + body manifest + Studio IBL
const glbGeometries = new Map();
let visualManifest = {};
// Bodies the aligned scenes rename keep the web visuals (web_cartpole.py: pendulum -> pendulum_rotor).
const VISUAL_ALIAS = { pendulum_rotor: 'pendulum' };
let assetsReady = false;
let assetsPromise = null;

function ensureVisualAssets() {
  if (!assetsPromise) {
    assetsPromise = loadVisualAssets().catch((err) => {
      assetsPromise = null;
      throw err;
    });
  }
  return assetsPromise;
}

async function loadVisualAssets() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./vendor/draco/');
  dracoLoader.setDecoderConfig({ type: 'wasm' });
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const rgbeLoader = new RGBELoader();
  rgbeLoader.setDataType(THREE.HalfFloatType);

  const loadGltf = new Promise((resolve, reject) => {
    gltfLoader.load(
      './assets/fr3_kuka_visual.glb',
      (gltf) => {
        updateDownloadProgress('glb', dlProgress.glb.total, dlProgress.glb.total);
        resolve(gltf);
      },
      (xhr) => updateDownloadProgress('glb', xhr.loaded, xhr.total || dlProgress.glb.total),
      reject
    );
  });

  const loadHdr = new Promise((resolve) => {
    rgbeLoader.load(
      './assets/studio_ibl.hdr',
      (tex) => {
        updateDownloadProgress('hdr', dlProgress.hdr.total, dlProgress.hdr.total);
        resolve(tex);
      },
      (xhr) => updateDownloadProgress('hdr', xhr.loaded, xhr.total || dlProgress.hdr.total),
      (err) => {
        console.warn('[Studio IBL] Optional HDR failed to load:', err);
        updateDownloadProgress('hdr', dlProgress.hdr.total, dlProgress.hdr.total);
        resolve(null);
      }
    );
  });

  const [manifestResp, gltf, hdrTex] = await Promise.all([
    fetch('./assets/visual_manifest.json').then((r) => r.json()),
    loadGltf,
    loadHdr,
  ]);

  if (hdrTex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(hdrTex);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.92;
    scene.environmentRotation = new THREE.Euler(-Math.PI / 2, 0, 0.45, 'XYZ');
    hdrTex.dispose();
    pmrem.dispose();
  }

  visualManifest = manifestResp;
  gltf.scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      glbGeometries.set(obj.name, obj.geometry);
    }
  });
  dracoLoader.dispose();
  assetsReady = true;
}

// --- 3D Physical Visual Overlay Builders ---
function createTriadGroup(length, radius, opacity = 1.0) {
  const group = new THREE.Group();
  const shaftLen = length * 0.78;
  const tipLen = length * 0.22;
  const tipRad = radius * 2.4;

  const specs = [
    { color: 0xef4444, rot: [0, 0, -Math.PI / 2] }, // +X Red
    { color: 0x22c55e, rot: [0, 0, 0] },            // +Y Green
    { color: 0x3b82f6, rot: [Math.PI / 2, 0, 0] },  // +Z Blue
  ];
  for (const s of specs) {
    const mat = new THREE.MeshBasicMaterial({
      color: s.color,
      transparent: opacity < 0.99,
      opacity,
      depthTest: true,
    });
    const axis = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 10), mat);
    shaft.position.y = shaftLen * 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(tipRad, tipLen, 12), mat);
    tip.position.y = shaftLen + tipLen * 0.5;
    axis.add(shaft, tip);
    axis.rotation.set(...s.rot);
    group.add(axis);
  }
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.9, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: opacity < 0.99, opacity })
  );
  group.add(origin);
  return group;
}

// Scene object caches synced from worker frames
let bodyGroups = [];
let primitiveGeoms = [];
let refLine = null;
let targetSphere = null;
let trailLine = null;
let eeFrameGroup = null;
let refFrameGroup = null;
let contactForceArrow = null;
let baseForceArrow = null;
let beamVisuals = null;
let disturberGroups = [];
const TRAIL_MAX = 240;
let trailPts = new Float32Array(TRAIL_MAX * 3);
let trailCount = 0;

// --- 3.5 m Flexible Beam Smooth Skinned Mesh, Stress Heatmap & Pedestal ---
const BEAM_STATIONS = 64;
const BEAM_W = 0.039;
const BEAM_H = 0.031;
const BEAM_C = 0.007;
const BEAM_PROFILE = [
  [BEAM_W, BEAM_H - BEAM_C],
  [BEAM_W - BEAM_C, BEAM_H],
  [-BEAM_W + BEAM_C, BEAM_H],
  [-BEAM_W, BEAM_H - BEAM_C],
  [-BEAM_W, -BEAM_H + BEAM_C],
  [-BEAM_W + BEAM_C, -BEAM_H],
  [BEAM_W - BEAM_C, -BEAM_H],
  [BEAM_W, -BEAM_H + BEAM_C],
];
const STRESS_STOPS = [
  { t: 0.0, c: srgb(0.42, 0.48, 0.56) },
  { t: 0.30, c: srgb(0.14, 0.80, 0.92) },
  { t: 0.65, c: srgb(0.96, 0.62, 0.06) },
  { t: 1.0, c: srgb(0.94, 0.27, 0.24) },
];
const BEAM_BASE_COLOR = srgb(0.54, 0.60, 0.67);
const tmpColA = new THREE.Color();
const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpSideY = new THREE.Vector3();
const tmpNormZ = new THREE.Vector3();
const tmpWorldUp = new THREE.Vector3(0, 0, 1);
const tmpBasisMat = new THREE.Matrix4();

function sampleStressColor(val, outColor) {
  const v = Math.max(0, Math.min(1, val));
  for (let i = 0; i < STRESS_STOPS.length - 1; i++) {
    const a = STRESS_STOPS[i];
    const b = STRESS_STOPS[i + 1];
    if (v <= b.t || i === STRESS_STOPS.length - 2) {
      const u = Math.max(0, Math.min(1, (v - a.t) / Math.max(1e-6, b.t - a.t)));
      return outColor.copy(a.c).lerp(b.c, u);
    }
  }
  return outColor.copy(STRESS_STOPS[0].c);
}

function buildFlexibleBeamVisuals(bodyNames) {
  const rootGroup = new THREE.Group();
  const darkIron = new THREE.MeshStandardMaterial({
    color: srgb(0.19, 0.22, 0.26),
    roughness: 0.48,
    metalness: 0.62,
    envMapIntensity: 1.05,
  });
  const machinedSteel = new THREE.MeshStandardMaterial({
    color: srgb(0.58, 0.63, 0.69),
    roughness: 0.26,
    metalness: 0.84,
    envMapIntensity: 1.25,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: srgb(0.24, 0.29, 0.35),
    roughness: 0.34,
    metalness: 0.72,
    envMapIntensity: 1.15,
  });

  // 1. Heavy Cast-Iron Cantilever Root Clamp Pedestal at x = -3.5 m (z = 0..1.72 m)
  const ped = new THREE.Group();
  ped.position.set(-3.58, 0, 0);
  const basePlate = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.72, 0.06), darkIron);
  basePlate.position.set(0, 0, 0.03);
  basePlate.castShadow = true;
  basePlate.receiveShadow = true;
  ped.add(basePlate);

  for (const bx of [-0.28, 0.28]) {
    for (const by of [-0.26, 0.26]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.032, 6), machinedSteel);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, by, 0.072);
      ped.add(bolt);
    }
  }

  const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 1.48), darkIron);
  col.position.set(0, 0, 0.80);
  col.castShadow = true;
  col.receiveShadow = true;
  ped.add(col);

  for (const sy of [-0.145, 0.145]) {
    const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.42), darkIron);
    gusset.position.set(0, sy, 0.27);
    gusset.castShadow = true;
    ped.add(gusset);
  }

  const clampBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.22), darkIron);
  clampBox.position.set(0.06, 0, 1.55);
  clampBox.castShadow = true;
  clampBox.receiveShadow = true;
  ped.add(clampBox);

  const clampFace = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.18, 0.16), machinedSteel);
  clampFace.position.set(0.185, 0, 1.55);
  ped.add(clampFace);
  rootGroup.add(ped);

  // 2. Smooth 64-Station Vertex-Skinned Chamfered Flexible Beam with Bending Stress Vertex Colors
  const ringN = BEAM_PROFILE.length;
  const vertCount = BEAM_STATIONS * ringN;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];
  for (let k = 0; k < BEAM_STATIONS - 1; k++) {
    for (let j = 0; j < ringN; j++) {
      const jn = (j + 1) % ringN;
      const a = k * ringN + j;
      const b = k * ringN + jn;
      const c = (k + 1) * ringN + jn;
      const d = (k + 1) * ringN + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  beamGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  beamGeo.setIndex(indices);
  const beamMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.46,
    envMapIntensity: 1.18,
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.castShadow = true;
  beamMesh.receiveShadow = true;
  beamMesh.frustumCulled = false;
  rootGroup.add(beamMesh);

  // 3. Machined Structural Rib Collars spaced along the 3.5 m span
  const collars = [];
  const collarGeo = new THREE.BoxGeometry(0.022, BEAM_W * 2.26, BEAM_H * 2.26);
  for (let i = 1; i <= 7; i++) {
    const cm = new THREE.Mesh(collarGeo, collarMat);
    cm.castShadow = true;
    rootGroup.add(cm);
    collars.push({ s: i / 8.0, mesh: cm });
  }

  // 4. Machined Titanium Tip Mounting Flange attached directly to beam_tip bodyGroup
  const tipIdx = bodyNames.indexOf('beam_tip');
  if (tipIdx >= 0 && bodyGroups[tipIdx]) {
    const tipPlate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.036), machinedSteel);
    tipPlate.position.set(0.02, 0, 0.016);
    tipPlate.castShadow = true;
    tipPlate.receiveShadow = true;
    const tipCollar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.09), darkIron);
    tipCollar.position.set(-0.04, 0, 0.0);
    tipCollar.castShadow = true;
    bodyGroups[tipIdx].add(tipPlate, tipCollar);
  }

  // 5. Stealth Dark-Titanium 3-DOF Unknown Disturber Arm (hidden by default unless toggled ON)
  disturberGroups = [];
  const distMat = new THREE.MeshStandardMaterial({
    color: srgb(0.21, 0.25, 0.30),
    roughness: 0.36,
    metalness: 0.68,
    envMapIntensity: 1.05,
  });
  const distRingMat = new THREE.MeshStandardMaterial({
    color: srgb(0.92, 0.56, 0.14),
    roughness: 0.30,
    metalness: 0.55,
  });
  const addCylZ = (parent, r, len, zCenter, mat) => {
    const g = new THREE.CylinderGeometry(r, r, len, 22);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, 0, zCenter);
    m.castShadow = true;
    parent.add(m);
  };
  const dmIdx = bodyNames.indexOf('disturber_mount');
  if (dmIdx >= 0 && bodyGroups[dmIdx]) {
    const g = bodyGroups[dmIdx];
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.028), distMat);
    plate.position.set(0, 0, 0.014);
    plate.castShadow = true;
    g.add(plate);
    addCylZ(g, 0.052, 0.055, 0.048, distMat);
    disturberGroups.push(g);
  }
  const d1Idx = bodyNames.indexOf('disturber_link1');
  if (d1Idx >= 0 && bodyGroups[d1Idx]) {
    const g = bodyGroups[d1Idx];
    addCylZ(g, 0.048, 0.018, 0.004, distRingMat);
    addCylZ(g, 0.042, 0.27, 0.14, distMat);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.050, 0.105, 22), distMat);
    sh.position.set(0, 0, 0.28);
    sh.castShadow = true;
    g.add(sh);
    disturberGroups.push(g);
  }
  const d2Idx = bodyNames.indexOf('disturber_link2');
  if (d2Idx >= 0 && bodyGroups[d2Idx]) {
    const g = bodyGroups[d2Idx];
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 22), distRingMat);
    g.add(ring);
    addCylZ(g, 0.036, 0.37, 0.19, distMat);
    const elb = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.09, 20), distMat);
    elb.position.set(0, 0, 0.38);
    elb.castShadow = true;
    g.add(elb);
    disturberGroups.push(g);
  }
  const d3Idx = bodyNames.indexOf('disturber_link3');
  if (d3Idx >= 0 && bodyGroups[d3Idx]) {
    const g = bodyGroups[d3Idx];
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.016, 20), distRingMat);
    g.add(ring);
    addCylZ(g, 0.030, 0.28, 0.14, distMat);
    addCylZ(g, 0.062, 0.085, 0.30, machinedSteel);
    disturberGroups.push(g);
  }

  // 6. Undeformed Dashed Reference Axis + Visual 5x Amplified Deflection Ribbon
  const refGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.5, 0, 1.55),
    new THREE.Vector3(0.0, 0, 1.55),
  ]);
  const beamRefLine = new THREE.Line(
    refGeo,
    new THREE.LineDashedMaterial({ color: 0x86868b, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.55 })
  );
  beamRefLine.computeLineDistances();
  overlayGroup.add(beamRefLine);

  const deflectPts = new Float32Array(BEAM_STATIONS * 3);
  const deflectGeo = new THREE.BufferGeometry();
  deflectGeo.setAttribute('position', new THREE.BufferAttribute(deflectPts, 3));
  const beamDeflect5xLine = new THREE.Line(
    deflectGeo,
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.92 })
  );
  beamDeflect5xLine.frustumCulled = false;
  overlayGroup.add(beamDeflect5xLine);

  robotGroup.add(rootGroup);
  return {
    rootGroup,
    beamGeo,
    positions,
    colors,
    collars,
    beamRefLine,
    beamDeflect5xLine,
    deflectPts,
    nodePts: Array.from({ length: 10 }, () => new THREE.Vector3()),
  };
}

function updateFlexibleBeamVisuals(telemetry) {
  if (!beamVisuals || !telemetry.beamNodes || telemetry.beamNodes.length < 30) return;
  const bn = telemetry.beamNodes;
  const stress = telemetry.beamStress || [0, 0, 0, 0, 0, 0, 0, 0];
  const showStress = chkOverlayStress.checked;
  const showDeflect = chkOverlayDeflect5x.checked;

  for (let i = 0; i < 10; i++) {
    beamVisuals.nodePts[i].set(bn[3 * i], bn[3 * i + 1], bn[3 * i + 2]);
  }
  const curve = new THREE.CatmullRomCurve3(beamVisuals.nodePts, false, 'centripetal');
  const ringN = BEAM_PROFILE.length;
  const posAttr = beamVisuals.positions;
  const colAttr = beamVisuals.colors;
  const defPts = beamVisuals.deflectPts;

  const sampleStressAt = (s) => {
    const idxF = s * 8.0 - 0.5;
    if (idxF <= 0) return Math.min(1, stress[0] * (1.0 + 0.14 * (-idxF)));
    if (idxF >= 7) return Math.max(0, stress[7] * Math.max(0, 1.0 - (idxF - 7.0) * 1.6));
    const i0 = Math.floor(idxF);
    const f = idxF - i0;
    return stress[i0] * (1 - f) + stress[i0 + 1] * f;
  };

  for (let k = 0; k < BEAM_STATIONS; k++) {
    const s = k / (BEAM_STATIONS - 1);
    curve.getPoint(s, tmpVecA);
    curve.getTangent(s, tmpVecB).normalize();
    tmpSideY.crossVectors(tmpWorldUp, tmpVecB);
    if (tmpSideY.lengthSq() < 1e-6) tmpSideY.set(0, 1, 0);
    else tmpSideY.normalize();
    tmpNormZ.crossVectors(tmpVecB, tmpSideY).normalize();

    if (showStress) {
      sampleStressColor(sampleStressAt(s), tmpColA);
    } else {
      tmpColA.copy(BEAM_BASE_COLOR);
    }

    for (let j = 0; j < ringN; j++) {
      const [py, pz] = BEAM_PROFILE[j];
      const vIdx = (k * ringN + j) * 3;
      posAttr[vIdx + 0] = tmpVecA.x + tmpSideY.x * py + tmpNormZ.x * pz;
      posAttr[vIdx + 1] = tmpVecA.y + tmpSideY.y * py + tmpNormZ.y * pz;
      posAttr[vIdx + 2] = tmpVecA.z + tmpSideY.z * py + tmpNormZ.z * pz;
      colAttr[vIdx + 0] = tmpColA.r;
      colAttr[vIdx + 1] = tmpColA.g;
      colAttr[vIdx + 2] = tmpColA.b;
    }

    const refX = -3.5 + 3.5 * s;
    const refZ = 1.55;
    defPts[3 * k + 0] = refX + 5.0 * (tmpVecA.x - refX);
    defPts[3 * k + 1] = 5.0 * tmpVecA.y;
    defPts[3 * k + 2] = refZ + 5.0 * (tmpVecA.z - refZ);
  }

  beamVisuals.beamGeo.attributes.position.needsUpdate = true;
  beamVisuals.beamGeo.attributes.color.needsUpdate = true;
  beamVisuals.beamGeo.computeVertexNormals();

  for (const col of beamVisuals.collars) {
    curve.getPoint(col.s, col.mesh.position);
    curve.getTangent(col.s, tmpVecB).normalize();
    tmpSideY.crossVectors(tmpWorldUp, tmpVecB).normalize();
    tmpNormZ.crossVectors(tmpVecB, tmpSideY).normalize();
    tmpBasisMat.makeBasis(tmpVecB, tmpSideY, tmpNormZ);
    col.mesh.quaternion.setFromRotationMatrix(tmpBasisMat);
  }

  beamVisuals.beamDeflect5xLine.visible = showDeflect;
  beamVisuals.beamRefLine.visible = showDeflect || chkOverlayPath.checked;
  if (showDeflect) {
    beamVisuals.beamDeflect5xLine.geometry.attributes.position.needsUpdate = true;
  }

  const showDist = Boolean(currentParams.beamDisturber);
  for (const dg of disturberGroups) dg.visible = showDist;
}

function makeMaterial(rgba, opts = {}) {
  const meshName = opts.meshName || '';
  const matName = opts.material || '';
  const c = srgb(rgba[0], rgba[1], rgba[2]);

  const hasExplicitMetal = typeof opts.metallic === 'number';
  const hasExplicitRough = typeof opts.roughness === 'number';

  const isOrange = matName === 'foundry_orange' || (rgba[0] > 0.85 && rgba[1] > 0.25 && rgba[1] < 0.6 && rgba[2] < 0.2);
  const isWhite = matName === 'white' || (rgba[0] > 0.88 && rgba[1] > 0.88 && rgba[2] > 0.88);
  const isDark = rgba[0] < 0.3 && rgba[1] < 0.3 && rgba[2] < 0.3;
  const isLotus = meshName === 'lotus_vis';
  const isPendRod = meshName === 'pendulum_rod' || meshName === 'pendulum_tip';
  const isMobileBareMetal = matName.startsWith('mobile_') && hasExplicitMetal && opts.metallic >= 0.4;
  const isMobileCabinet =
    matName === 'mobile_cabinet_case' ||
    matName === 'mobile_cabinet_front' ||
    matName === 'mobile_cabinet_fans' ||
    matName === 'mobile_cabinet_lid' ||
    matName === 'mobile_cabinet_ports' ||
    matName === 'mobile_cabinet_switch';
  const isMetalAlloy =
    isMobileBareMetal ||
    matName === 'foundry_silver' ||
    matName === 'workcell_alloy' ||
    matName === 'foundry_iron' ||
    matName === 'tray_steel' ||
    matName === 'revg_metal' ||
    matName === 'revj_alloy' ||
    matName === 'revj_steel' ||
    matName === 'revj_brass' ||
    matName === 'revj_petal' ||
    matName === 'tool_alloy' ||
    matName === 'tool_sensor' ||
    matName === 'tool_cover' ||
    matName === 'tool_fastener';

  if (matName === 'revj_glass') {
    return new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.06,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.35,
      transparent: true,
      opacity: rgba[3] ?? 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const metalness = hasExplicitMetal
    ? opts.metallic
    : isPendRod ? 0.16 : isLotus ? 0.46 : isOrange ? 0.12 : isWhite ? 0.09 : isDark ? 0.38 : 0.32;

  const roughness = hasExplicitRough
    ? opts.roughness
    : isPendRod ? 0.34 : isLotus ? 0.30 : isOrange ? 0.31 : isWhite ? 0.30 : isDark ? 0.42 : 0.40;

  const baseParams = {
    color: c,
    roughness,
    metalness,
    envMapIntensity: isMetalAlloy ? 1.18 : isMobileCabinet ? 0.90 : 1.0,
    transparent: rgba[3] < 0.99,
    opacity: rgba[3],
  };

  if (matName === 'foundry_orange' || matName === 'white') {
    return new THREE.MeshPhysicalMaterial({
      ...baseParams,
      clearcoat: matName === 'white' ? 0.30 : 0.20,
      clearcoatRoughness: matName === 'white' ? 0.24 : 0.30,
    });
  }
  return new THREE.MeshStandardMaterial(baseParams);
}

function syncOverlayVisibility() {
  const showPath = chkOverlayPath.checked;
  const showFrames = chkOverlayFrames.checked;
  const showForce = chkOverlayForce.checked;
  const isBeam = currentDemoId === 5;
  const beamTrack = isBeam && Number(currentParams.beamTaskMode || 0) === 0;
  if (refLine) refLine.visible = showPath;
  if (targetSphere) targetSphere.visible = showPath && (currentDemoId === 1 || beamTrack);
  if (trailLine) trailLine.visible = showPath && (currentDemoId === 1 || beamTrack);
  if (eeFrameGroup) eeFrameGroup.visible = showFrames;
  if (refFrameGroup) refFrameGroup.visible = showFrames;
  if (contactForceArrow && (!showForce || currentDemoId !== 4)) {
    contactForceArrow.visible = false;
  }
  if (baseForceArrow && (!showForce || !isBeam)) {
    baseForceArrow.visible = false;
  }
  if (beamVisuals) {
    beamVisuals.beamDeflect5xLine.visible = chkOverlayDeflect5x.checked;
    beamVisuals.beamRefLine.visible = chkOverlayDeflect5x.checked || showPath;
  }
  rowOverlayStress.classList.toggle('hidden', !isBeam);
  stressLegend.classList.toggle('hidden', !isBeam || !chkOverlayStress.checked);
  rowOverlayDeflect5x.classList.toggle('hidden', !isBeam);
}

function buildSceneMeshes(bodyNames, geoms, refPath, bodyRootIds = []) {
  while (robotGroup.children.length) robotGroup.remove(robotGroup.children[0]);
  while (overlayGroup.children.length) overlayGroup.remove(overlayGroup.children[0]);
  bodyGroups = [];
  primitiveGeoms = [];
  disturberGroups = [];
  beamVisuals = null;
  trailCount = 0;

  for (let b = 0; b < bodyNames.length; b++) {
    const bname = bodyNames[b];
    const g = new THREE.Group();
    g.name = bname;
    const visList = visualManifest[bname] ?? visualManifest[VISUAL_ALIAS[bname]];
    if (visList) {
      for (const item of visList) {
        if (item.demos && !item.demos.includes(currentDemoId)) continue;
        let geo = null;
        if (item.type === 'box' && item.size) {
          geo = new THREE.BoxGeometry(2 * item.size[0], 2 * item.size[1], 2 * item.size[2]);
        } else if (item.type === 'cylinder' && item.size) {
          geo = new THREE.CylinderGeometry(item.size[0], item.size[0], 2 * item.size[1], 24);
          geo.rotateX(Math.PI / 2);
        } else if (item.type === 'sphere' && item.size) {
          geo = new THREE.SphereGeometry(item.size[0], 20, 14);
        } else if (item.mesh) {
          geo = glbGeometries.get(item.mesh);
        }
        if (!geo) continue;
        const mat = makeMaterial(item.rgba, {
          meshName: item.mesh || item.name,
          material: item.material,
          metallic: item.metallic,
          roughness: item.roughness,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
        mesh.quaternion.set(item.quat[1], item.quat[2], item.quat[3], item.quat[0]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.bodyId = b;
        g.add(mesh);
      }
    }
    robotGroup.add(g);
    bodyGroups.push(g);
  }

  for (const gm of geoms) {
    if (gm.type === MJGEOM_PLANE || gm.group === 3) continue;
    const rgba = gm.rgba;
    const size = gm.size;
    if (rgba[3] <= 0.001) continue;
    if (gm.type === MJGEOM_BOX && rgba[0] > 0.9 && rgba[3] < 0.6) continue;

    let geo = null;
    if (gm.type === MJGEOM_SPHERE) {
      geo = new THREE.SphereGeometry(size[0], 28, 20);
    } else if (gm.type === MJGEOM_CYLINDER) {
      geo = new THREE.CylinderGeometry(size[0], size[0], 2 * size[1], 36);
      geo.rotateX(Math.PI / 2);
    } else if (gm.type === MJGEOM_CAPSULE) {
      geo = new THREE.CapsuleGeometry(size[0], 2 * size[1], 12, 24);
      geo.rotateX(Math.PI / 2);
    } else if (gm.type === MJGEOM_BOX) {
      geo = new THREE.BoxGeometry(2 * size[0], 2 * size[1], 2 * size[2]);
    }
    if (!geo) continue;

    const mesh = new THREE.Mesh(geo, makeMaterial(rgba, { meshName: gm.name }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.bodyId = gm.bodyId;
    robotGroup.add(mesh);
    primitiveGeoms.push({ geomId: gm.id, mesh });
  }

  updateReferencePathOverlay(refPath);

  targetSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.009, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.88 })
  );
  overlayGroup.add(targetSphere);

  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPts, 3));
  trailGeo.setDrawRange(0, 0);
  trailLine = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xff6b1a, linewidth: 2 })
  );
  overlayGroup.add(trailLine);

  // SE(3) Coordinate Frame Triads: actual T_B (crisp 7.5 cm) & desired T_d (translucent 9.5 cm)
  eeFrameGroup = createTriadGroup(0.075, 0.0013, 0.98);
  refFrameGroup = createTriadGroup(0.095, 0.00095, 0.48);
  overlayGroup.add(eeFrameGroup, refFrameGroup);

  // Live 3D World Contact Force Vector Arrow (Demo 4 Lotus Docking)
  contactForceArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0),
    0.12,
    0xf59e0b,
    0.028,
    0.014
  );
  contactForceArrow.visible = false;
  overlayGroup.add(contactForceArrow);

  // Live 3D Dynamic Base Reaction Force Vector Arrow Δf_s (Demo 5 Flexible Beam)
  baseForceArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 0),
    0.16,
    0xf97316,
    0.036,
    0.018
  );
  baseForceArrow.visible = false;
  overlayGroup.add(baseForceArrow);

  if (currentDemoId === 5) {
    beamVisuals = buildFlexibleBeamVisuals(bodyNames);
  }

  buildInteractionOverlays();
  buildWorldOverlays();
  glassBodyId = bodyNames.indexOf('wine_glass');
  link0BodyId = bodyNames.indexOf('link0');
  mainWine = glassBodyId >= 0 && bodyGroups[glassBodyId].children.length
    ? createWine(bodyGroups[glassBodyId], false)
    : null;
  buildGhost(bodyNames, bodyRootIds);
  syncOverlayVisibility();
}

// --- Glass contact forces (friction-only support) & mouse-push overlays ---
const GLASS_MAX_CONTACTS = 8;
let glassContactViz = null;
let perturbViz = null;

function frictionColor(use) {
  return use < 0.3 ? 0x34c759 : use < 0.7 ? 0xff9500 : 0xff3b30;
}

function buildInteractionOverlays() {
  const dotGeo = new THREE.SphereGeometry(0.0028, 12, 8);
  const group = new THREE.Group();
  const dots = [];
  const arrows = [];
  for (let i = 0; i < GLASS_MAX_CONTACTS; i++) {
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x1d1d1f }));
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.03, 0x34c759, 0.009, 0.006);
    dot.visible = false;
    arrow.visible = false;
    group.add(dot, arrow);
    dots.push(dot);
    arrows.push(arrow);
  }
  overlayGroup.add(group);
  glassContactViz = { group, dots, arrows };

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    lineGeo,
    new THREE.LineDashedMaterial({ color: 0x0071e3, dashSize: 0.012, gapSize: 0.008, depthTest: false, transparent: true })
  );
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x0071e3, depthTest: false, transparent: true })
  );
  const grab = new THREE.Mesh(
    new THREE.SphereGeometry(0.0045, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true })
  );
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, 0x0071e3, 0.02, 0.012);
  arrow.line.material.depthTest = false;
  arrow.cone.material.depthTest = false;
  arrow.line.material.transparent = true;
  arrow.cone.material.transparent = true;
  for (const o of [line, handle, grab, arrow, arrow.line, arrow.cone]) o.renderOrder = 20;
  const pgroup = new THREE.Group();
  pgroup.add(line, arrow, handle, grab);
  pgroup.visible = false;
  overlayGroup.add(pgroup);
  perturbViz = { group: pgroup, line, handle, grab, arrow };
}

function updateGlassContactOverlay(tel) {
  if (!glassContactViz) return;
  const show = chkOverlayForce.checked && (currentDemoId === 0 || currentDemoId === 1);
  const gc = tel.glassContacts || [];
  const n = show ? Math.min(GLASS_MAX_CONTACTS, Math.floor(gc.length / 6)) : 0;
  const color = frictionColor(tel.glassFrictionUse || 0);
  for (let i = 0; i < GLASS_MAX_CONTACTS; i++) {
    const dot = glassContactViz.dots[i];
    const arrow = glassContactViz.arrows[i];
    if (i >= n) {
      dot.visible = false;
      arrow.visible = false;
      continue;
    }
    const o = 6 * i;
    dot.position.set(gc[o], gc[o + 1], gc[o + 2]);
    dot.visible = true;
    tmpForceVec.set(gc[o + 3], gc[o + 4], gc[o + 5]);
    const mag = tmpForceVec.length();
    if (mag < 1e-3) {
      arrow.visible = false;
      continue;
    }
    arrow.position.copy(dot.position);
    arrow.setDirection(tmpForceVec.divideScalar(mag));
    const len = Math.min(0.09, 0.012 + 0.05 * mag);
    arrow.setLength(len, Math.min(0.012, len * 0.35), Math.min(0.007, len * 0.2));
    arrow.setColor(color);
    arrow.visible = true;
  }
}

// --- Wine: first sloshing mode from the WASM model, drawn as the bowl volume under a clip plane ---
// Inner bowl profile of the Rev J brandy glass in the glass body frame (z, r in m; 0.6 mm inset).
const WINE_FILL_Z = 0.090;  // keep equal to WineModel::kFillZ
const WINE_PROFILE = [
  [53, 0], [54, 9], [56, 16], [60, 27.5], [64, 33.6], [68, 38.2], [72, 42.2], [76, 44.6], [80, 46.3],
  [84, 46.9], [88, 46.6], [92, 45.9], [96, 45.0], [100, 43.3], [104, 41.0], [112, 37.4], [120, 34.3], [128, 31.0],
].map(([z, r]) => [z / 1000, Math.max(0, r - 0.6) / 1000]);
const WINE_SEG = 56;

function wineRadiusAt(z) {
  const P = WINE_PROFILE;
  if (z <= P[0][0]) return 0;
  if (z >= P[P.length - 1][0]) return P[P.length - 1][1];
  for (let i = 1; i < P.length; i++) {
    if (z <= P[i][0]) {
      const u = (z - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
      return P[i - 1][1] + u * (P[i][1] - P[i - 1][1]);
    }
  }
  return 0;
}

// Red wine look: a liquid volume is darker where light crosses more of it. The body shell is
// shaded by view-path thickness (|n.v|: deep garnet in the core, lighter translucent ruby at the
// silhouette and near the surface) and by depth below the surface; the surface disc gets a light
// rim (the thin layer against the glass) around a darker centre, with a glossy clear coat.
const WINE_CORE = new THREE.Color(0x4a0014);
const WINE_MID = new THREE.Color(0x980a2c);
const WINE_EDGE = new THREE.Color(0xd92a4c);
const WINE_SURF = new THREE.Color(0x86082c);

function wineBodyMaterial(plane) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
    envMapIntensity: 0.9,
    transparent: true,
    opacity: 1.0,
    side: THREE.FrontSide,
    clippingPlanes: [plane],
    depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWineCore = { value: WINE_CORE };
    shader.uniforms.uWineMid = { value: WINE_MID };
    shader.uniforms.uWineEdge = { value: WINE_EDGE };
    shader.uniforms.uWineFill = { value: WINE_FILL_Z };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWineZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWineZ = position.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uWineCore; uniform vec3 uWineMid; uniform vec3 uWineEdge; uniform float uWineFill;
varying float vWineZ;
float wineThick;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  float depth = clamp((uWineFill - vWineZ) / 0.03, 0.0, 1.0);
  wineThick = clamp(0.75 * smoothstep(0.05, 0.95, ndv) + 0.35 * depth, 0.0, 1.0);
  vec3 c = mix(uWineEdge, uWineMid, smoothstep(0.0, 0.55, wineThick));
  c = mix(c, uWineCore, smoothstep(0.45, 1.0, wineThick));
  diffuseColor.rgb = c;
  diffuseColor.a = mix(0.5, 0.95, wineThick);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uWineEdge * 0.10 * (1.0 - wineThick);`);
  };
  return mat;
}

function createWine(parent, ghostStyle = false) {
  const pts = WINE_PROFILE.map(([z, r]) => new THREE.Vector2(r, z));
  const lathe = new THREE.LatheGeometry(pts, 64);
  lathe.rotateX(Math.PI / 2);
  const plane = new THREE.Plane();
  const bodyMat = ghostStyle
    ? new THREE.MeshPhysicalMaterial({
      color: 0x9a5a66, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, clippingPlanes: [plane], depthWrite: false,
    })
    : wineBodyMaterial(plane);
  const body = new THREE.Mesh(lathe, bodyMat);
  body.renderOrder = 1;
  const surfGeo = new THREE.BufferGeometry();
  const pos = new Float32Array((WINE_SEG + 2) * 3);
  const nrm = new Float32Array((WINE_SEG + 2) * 3);
  const col = new Float32Array((WINE_SEG + 2) * 4);
  const idx = [];
  for (let i = 1; i <= WINE_SEG; i++) idx.push(0, i, i + 1);
  // Surface: dark, nearly opaque centre fading to a lighter, more transparent rim.
  for (let i = 0; i < WINE_SEG + 2; i++) {
    const c = i === 0 ? WINE_SURF : WINE_EDGE;
    col.set([c.r, c.g, c.b, i === 0 ? 0.88 : 0.6], 4 * i);
  }
  surfGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  surfGeo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  surfGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  surfGeo.setIndex(idx);
  const surfMat = new THREE.MeshPhysicalMaterial({
    color: ghostStyle ? 0xb07580 : 0xffffff,
    vertexColors: !ghostStyle,
    roughness: 0.04,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.2,
    transparent: true,
    opacity: ghostStyle ? 0.35 : 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  surf.renderOrder = 2;
  body.castShadow = false;
  surf.castShadow = false;
  parent.add(body, surf);
  return { parent, body, surf, plane, pos, nrm, surfGeo };
}

// slope = (dz/dx, dz/dy) of the free surface in the glass frame; spilled hides the wine.
function updateWine(w, slopeX, slopeY, spilled) {
  if (!w) return;
  const show = !spilled;
  w.body.visible = show;
  w.surf.visible = show;
  if (!show) return;
  const inv = 1 / Math.hypot(slopeX, slopeY, 1);
  // Keep the liquid below z = zf + sx x + sy y (Three.js clips the negative side of the plane)
  w.plane.normal.set(slopeX * inv, slopeY * inv, -inv);
  w.plane.constant = WINE_FILL_Z * inv;
  w.parent.updateMatrixWorld(true);
  w.plane.applyMatrix4(w.parent.matrixWorld);

  const { pos, nrm } = w;
  pos[0] = 0; pos[1] = 0; pos[2] = WINE_FILL_Z;
  for (let i = 0; i <= WINE_SEG; i++) {
    const phi = (2 * Math.PI * i) / WINE_SEG;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const k = slopeX * c + slopeY * sn;
    // Radius where the surface meets the bowl wall: rho = r(zf + k rho), by bisection
    let lo = 0;
    let hi = 0.06;
    if (hi - wineRadiusAt(WINE_FILL_Z + k * hi) < 0) lo = hi;
    for (let it = 0; it < 22 && lo < hi; it++) {
      const mid = 0.5 * (lo + hi);
      if (mid - wineRadiusAt(WINE_FILL_Z + k * mid) < 0) lo = mid; else hi = mid;
    }
    const rho = 0.5 * (lo + hi);
    const o = 3 * (i + 1);
    pos[o] = rho * c;
    pos[o + 1] = rho * sn;
    pos[o + 2] = WINE_FILL_Z + k * rho;
  }
  for (let i = 0; i < WINE_SEG + 2; i++) {
    nrm[3 * i] = -slopeX * inv;
    nrm[3 * i + 1] = -slopeY * inv;
    nrm[3 * i + 2] = inv;
  }
  w.surfGeo.attributes.position.needsUpdate = true;
  w.surfGeo.attributes.normal.needsUpdate = true;
  w.surfGeo.computeBoundingSphere();
}

let mainWine = null;
let ghostWine = null;
let ghostBodies = [];
let glassBodyId = -1;
let link0BodyId = -1;
const GHOST_SKIP = new Set(['link0', 'transition_plate']);
// Site-wide colour rule: the fixed-base baseline is red, here a translucent red ghost.
const ghostMat = new THREE.MeshStandardMaterial({
  color: 0xe4505a,
  emissive: 0x5a0008,
  roughness: 0.6,
  metalness: 0.0,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

// Copy the meshes of the free-floating FR3 tree and the free glass for the baseline ghost.
function buildGhost(bodyNames, bodyRootIds) {
  while (ghostGroup.children.length) ghostGroup.remove(ghostGroup.children[0]);
  ghostBodies = [];
  ghostWine = null;
  const l7 = bodyNames.indexOf('link7');
  if (l7 < 0 || !bodyRootIds || !bodyRootIds.length) return;
  const roots = new Set([bodyRootIds[l7]]);
  if (glassBodyId >= 0) roots.add(bodyRootIds[glassBodyId]);
  for (let b = 0; b < bodyNames.length; b++) {
    if (!roots.has(bodyRootIds[b]) || GHOST_SKIP.has(bodyNames[b])) continue;
    const src = bodyGroups[b];
    if (!src || !src.children.length) continue;
    const g = new THREE.Group();
    for (const m of src.children) {
      if (!m.isMesh) continue;
      const c = new THREE.Mesh(m.geometry, ghostMat);
      c.position.copy(m.position);
      c.quaternion.copy(m.quaternion);
      c.renderOrder = 3;
      g.add(c);
    }
    ghostGroup.add(g);
    ghostBodies.push({ b, g });
    if (b === glassBodyId) ghostWine = createWine(g, true);
  }
}

function applyGhostFrame(gf) {
  const show = !!gf && ghostEnabled && !!currentParams.controllerEnabled && ghostBodies.length > 0;
  ghostGroup.visible = show;
  if (!show) return;
  for (const { b, g } of ghostBodies) {
    g.position.set(gf.bodyXpos[3 * b], gf.bodyXpos[3 * b + 1], gf.bodyXpos[3 * b + 2]);
    g.quaternion.set(gf.bodyXquat[4 * b + 1], gf.bodyXquat[4 * b + 2], gf.bodyXquat[4 * b + 3], gf.bodyXquat[4 * b]);
  }
  const t = gf.telemetry || {};
  updateWine(ghostWine, t.wineSlopeX || 0, t.wineSlopeY || 0, !!t.wineSpilled);
}

// World-fixed target ring around the glass foot (Still Wine) and a fading trail of the arm base.
let targetRing = null;
let baseTrail = null;
const BASE_TRAIL_MAX = 300;
const baseTrailPts = new Float32Array(BASE_TRAIL_MAX * 3);
const baseTrailCols = new Float32Array(BASE_TRAIL_MAX * 3);
let baseTrailCount = 0;
const BASE_TRAIL_RGB = [0.69, 0.32, 0.87];

function buildWorldOverlays() {
  targetRing = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.047, 0.0012, 10, 96),
    new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.95 })
  );
  targetRing.add(ring);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.0016, 0.0016),
      new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.95 })
    );
    const a = (i * Math.PI) / 2;
    tick.position.set(0.058 * Math.cos(a), 0.058 * Math.sin(a), 0);
    tick.rotation.z = a;
    targetRing.add(tick);
  }
  targetRing.visible = false;
  overlayGroup.add(targetRing);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(baseTrailPts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(baseTrailCols, 3));
  geo.setDrawRange(0, 0);
  baseTrail = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false })
  );
  baseTrail.renderOrder = 10;
  baseTrail.frustumCulled = false;
  overlayGroup.add(baseTrail);
  baseTrailCount = 0;
}

function updateWorldOverlays(msg) {
  const tel = msg.telemetry;
  const kuka = currentDemoId !== 5;
  if (targetRing) {
    targetRing.visible = chkOverlayPath.checked && currentDemoId === 0 && !!tel.refPos;
    if (targetRing.visible) {
      targetRing.position.set(tel.refPos[0], tel.refPos[1], tel.refPos[2] + 0.0008);
      targetRing.quaternion.set(tel.refQuat[1], tel.refQuat[2], tel.refQuat[3], tel.refQuat[0]);
    }
  }
  if (!baseTrail) return;
  baseTrail.visible = chkBaseTrail.checked && kuka && link0BodyId >= 0;
  if (!baseTrail.visible) return;
  if (tel.time < lastTelemetryTime - 0.05) baseTrailCount = 0;
  const b = link0BodyId;
  const p = [msg.bodyXpos[3 * b], msg.bodyXpos[3 * b + 1], msg.bodyXpos[3 * b + 2]];
  if (baseTrailCount < BASE_TRAIL_MAX) {
    baseTrailPts.set(p, 3 * baseTrailCount);
    baseTrailCount++;
  } else {
    baseTrailPts.copyWithin(0, 3);
    baseTrailPts.set(p, 3 * (BASE_TRAIL_MAX - 1));
  }
  // Fade from the background color (oldest) to purple (newest)
  for (let i = 0; i < baseTrailCount; i++) {
    const u = baseTrailCount > 1 ? i / (baseTrailCount - 1) : 1;
    const a = u * u;
    baseTrailCols[3 * i] = 0.945 + a * (BASE_TRAIL_RGB[0] - 0.945);
    baseTrailCols[3 * i + 1] = 0.945 + a * (BASE_TRAIL_RGB[1] - 0.945);
    baseTrailCols[3 * i + 2] = 0.955 + a * (BASE_TRAIL_RGB[2] - 0.955);
  }
  baseTrail.geometry.attributes.position.needsUpdate = true;
  baseTrail.geometry.attributes.color.needsUpdate = true;
  baseTrail.geometry.setDrawRange(0, baseTrailCount);
}

// Perturbation state from the worker: [active, point xyz, force xyz (N)]
function updatePerturbOverlay(ps) {
  if (!perturbViz) return;
  const active = !!(pushDrag && ps && ps[0] > 0.5);
  perturbViz.group.visible = active;
  if (!active) {
    forceLabel.classList.add('hidden');
    return;
  }
  const t = pushDrag.target;
  const pos = perturbViz.line.geometry.attributes.position;
  pos.setXYZ(0, ps[1], ps[2], ps[3]);
  pos.setXYZ(1, t.x, t.y, t.z);
  pos.needsUpdate = true;
  perturbViz.line.geometry.computeBoundingSphere();
  perturbViz.line.computeLineDistances();
  perturbViz.handle.position.copy(t);
  perturbViz.grab.position.set(ps[1], ps[2], ps[3]);
  tmpForceVec.set(ps[4], ps[5], ps[6]);
  const mag = tmpForceVec.length();
  if (mag > 0.02) {
    perturbViz.arrow.visible = true;
    perturbViz.arrow.position.set(ps[1], ps[2], ps[3]);
    perturbViz.arrow.setDirection(tmpForceVec.divideScalar(mag));
    const len = Math.min(0.3, 0.03 + 0.02 * mag);
    perturbViz.arrow.setLength(len, Math.min(0.03, len * 0.3), Math.min(0.016, len * 0.16));
  } else {
    perturbViz.arrow.visible = false;
  }
  forceLabel.textContent = `${mag.toFixed(1)} N`;
  forceLabel.classList.remove('hidden');
}

function updateReferencePathOverlay(refPath) {
  if (refLine) {
    overlayGroup.remove(refLine);
    refLine.geometry.dispose();
    refLine = null;
  }
  pathCam = computePathCamera(refPath);
  syncPathCamButton();
  if (!refPath || refPath.length < 6) return;
  const pts = [];
  for (let i = 0; i + 2 < refPath.length; i += 3) {
    const v = new THREE.Vector3(refPath[i], refPath[i + 1], refPath[i + 2]);
    if (!pts.length || v.distanceToSquared(pts[pts.length - 1]) > 1e-10) pts.push(v);
  }
  if (pts.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, Math.min(1500, pts.length * 4), 0.0015, 6, false);
  refLine = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.8 })
  );
  refLine.visible = chkOverlayPath.checked;
  overlayGroup.add(refLine);
}

// Camera looking straight at the plane of a (planar) reference path, sized to fit it.
let pathCam = null;
function computePathCamera(refPath) {
  if (!refPath || refPath.length < 30) return null;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < refPath.length; i += 3) box.expandByPoint(v.set(refPath[i], refPath[i + 1], refPath[i + 2]));
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const ext = [size.x, size.y, size.z];
  const k = ext.indexOf(Math.min(...ext));
  const span = Math.max(...ext);
  if (span < 0.02) return null;
  const fov = 24;
  // Fit the larger of the vertical / horizontal extents (portrait phones are width-limited)
  const aspect = Math.min(1, Math.max(0.3, camera.aspect || 1));
  const dist = (span * 1.9 + 0.08) / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / aspect;
  const pos = c.clone();
  if (k === 2) {
    pos.z += dist; // horizontal path: look down, tilted slightly so orbit controls stay well-posed
    pos.y -= 0.12 * dist;
  } else {
    const n = new THREE.Vector3();
    n.setComponent(k, 1);
    pos.addScaledVector(n, dist);
    pos.z += 0.05 * dist;
  }
  return { pos: pos.toArray(), target: c.toArray(), fov };
}

function syncPathCamButton() {
  const isTrack = currentDemoId === 1 || (currentDemoId === 5 && Number(currentParams.beamTaskMode || 0) === 0);
  const btn = document.getElementById('camPathBtn');
  if (btn) btn.classList.toggle('hidden', !(pathCam && isTrack));
}

const tmpMat4 = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpForceVec = new THREE.Vector3();

function applyFrame(msg) {
  const { bodyXpos, bodyXquat, geomXpos, geomXmat, telemetry, rtf } = msg;
  for (let b = 0; b < bodyGroups.length; b++) {
    const g = bodyGroups[b];
    g.position.set(bodyXpos[3 * b], bodyXpos[3 * b + 1], bodyXpos[3 * b + 2]);
    g.quaternion.set(
      bodyXquat[4 * b + 1],
      bodyXquat[4 * b + 2],
      bodyXquat[4 * b + 3],
      bodyXquat[4 * b + 0]
    );
  }
  for (const item of primitiveGeoms) {
    const i = item.geomId;
    item.mesh.position.set(geomXpos[3 * i], geomXpos[3 * i + 1], geomXpos[3 * i + 2]);
    const o = 9 * i;
    tmpMat4.set(
      geomXmat[o + 0], geomXmat[o + 1], geomXmat[o + 2], 0,
      geomXmat[o + 3], geomXmat[o + 4], geomXmat[o + 5], 0,
      geomXmat[o + 6], geomXmat[o + 7], geomXmat[o + 8], 0,
      0, 0, 0, 1
    );
    tmpQuat.setFromRotationMatrix(tmpMat4);
    item.mesh.quaternion.copy(tmpQuat);
  }

  if (targetSphere && telemetry.refPos) {
    targetSphere.position.set(telemetry.refPos[0], telemetry.refPos[1], telemetry.refPos[2]);
  }
  if (eeFrameGroup && telemetry.eePos && telemetry.eeQuat) {
    eeFrameGroup.position.set(telemetry.eePos[0], telemetry.eePos[1], telemetry.eePos[2]);
    eeFrameGroup.quaternion.set(
      telemetry.eeQuat[1], telemetry.eeQuat[2], telemetry.eeQuat[3], telemetry.eeQuat[0]
    );
  }
  if (refFrameGroup && telemetry.refPos && telemetry.refQuat) {
    refFrameGroup.position.set(telemetry.refPos[0], telemetry.refPos[1], telemetry.refPos[2]);
    refFrameGroup.quaternion.set(
      telemetry.refQuat[1], telemetry.refQuat[2], telemetry.refQuat[3], telemetry.refQuat[0]
    );
  }
  if (contactForceArrow && telemetry.eePos && telemetry.dockForceVec) {
    if (currentDemoId === 4 && chkOverlayForce.checked) {
      tmpForceVec.set(telemetry.dockForceVec[0], telemetry.dockForceVec[1], telemetry.dockForceVec[2]);
      const mag = tmpForceVec.length();
      if (mag > 0.08) {
        contactForceArrow.visible = true;
        contactForceArrow.position.set(telemetry.eePos[0], telemetry.eePos[1], telemetry.eePos[2]);
        contactForceArrow.setDirection(tmpForceVec.divideScalar(mag));
        const len = Math.max(0.055, Math.min(0.28, 0.055 + 0.016 * mag));
        contactForceArrow.setLength(len, Math.min(0.032, len * 0.28), Math.min(0.015, len * 0.14));
        const color = mag > 8.0 ? 0xef4444 : mag > 2.0 ? 0xf59e0b : 0x38bdf8;
        contactForceArrow.setColor(color);
      } else {
        contactForceArrow.visible = false;
      }
    } else {
      contactForceArrow.visible = false;
    }
  }

  if (baseForceArrow && telemetry.basePos && telemetry.baseForceVec) {
    if (currentDemoId === 5 && chkOverlayForce.checked) {
      tmpForceVec.set(telemetry.baseForceVec[0], telemetry.baseForceVec[1], telemetry.baseForceVec[2]);
      const mag = tmpForceVec.length();
      if (mag > 0.35) {
        baseForceArrow.visible = true;
        baseForceArrow.position.set(telemetry.basePos[0], telemetry.basePos[1], telemetry.basePos[2]);
        baseForceArrow.setDirection(tmpForceVec.divideScalar(mag));
        const len = Math.max(0.08, Math.min(0.42, 0.08 + 0.0085 * mag));
        baseForceArrow.setLength(len, Math.min(0.045, len * 0.28), Math.min(0.022, len * 0.14));
        const color = mag > 25.0 ? 0xef4444 : mag > 10.0 ? 0xf59e0b : 0x38bdf8;
        baseForceArrow.setColor(color);
      } else {
        baseForceArrow.visible = false;
      }
    } else {
      baseForceArrow.visible = false;
    }
  }
  if (currentDemoId === 5) {
    updateFlexibleBeamVisuals(telemetry);
  }
  updateGlassContactOverlay(telemetry);
  updatePerturbOverlay(msg.perturb);
  updateWine(mainWine, telemetry.wineSlopeX || 0, telemetry.wineSlopeY || 0, !!telemetry.wineSpilled);
  applyGhostFrame(msg.ghost);
  telemetry.ghost = ghostGroup.visible && msg.ghost ? msg.ghost.telemetry : null;
  updateWorldOverlays(msg);

  if (trailLine && telemetry.eePos && (currentDemoId === 0 || currentDemoId === 1 || currentDemoId === 5)) {
    const validPos =
      telemetry.time > 0.005 &&
      Math.abs(telemetry.eePos[0]) + Math.abs(telemetry.eePos[1]) + Math.abs(telemetry.eePos[2]) > 1e-4;
    if (telemetry.time < lastTelemetryTime - 0.05) trailCount = 0;
    if (validPos) {
      if (trailCount < TRAIL_MAX) {
        trailPts[3 * trailCount + 0] = telemetry.eePos[0];
        trailPts[3 * trailCount + 1] = telemetry.eePos[1];
        trailPts[3 * trailCount + 2] = telemetry.eePos[2];
        trailCount++;
      } else {
        trailPts.copyWithin(0, 3);
        trailPts[3 * (TRAIL_MAX - 1) + 0] = telemetry.eePos[0];
        trailPts[3 * (TRAIL_MAX - 1) + 1] = telemetry.eePos[1];
        trailPts[3 * (TRAIL_MAX - 1) + 2] = telemetry.eePos[2];
      }
      trailLine.geometry.attributes.position.needsUpdate = true;
      trailLine.geometry.setDrawRange(0, trailCount);
    }
  }

  updateHudAndPlots(telemetry, rtf);
}

// --- Real-time Telemetry & Canvas Charts ---
const HISTORY_LEN = 320;
let history = [];
let lastTelemetryTime = -1;

const hudTime = document.getElementById('hudTime');
const hudRtf = document.getElementById('hudRtf');
const hudPhase = document.getElementById('hudPhase');
const hudPhaseSep = document.getElementById('hudPhaseSep');
const readoutEl = document.getElementById('readout');
const readoutLabel = document.getElementById('readoutLabel');
const readoutTag = document.getElementById('readoutTag');
const readoutValue = document.getElementById('readoutValue');
const readoutUnit = document.getElementById('readoutUnit');
const readoutSub = document.getElementById('readoutSub');
const readoutExtra = document.getElementById('readoutExtra');
const rxFric = document.getElementById('rxFric');
const rxFill = document.getElementById('rxFill');
const rxNote = document.getElementById('rxNote');
const rxWine = document.getElementById('rxWine');
const rxWineRow = document.getElementById('rxWineRow');
const rxGhost = document.getElementById('rxGhost');
let lastReadoutMs = 0;

// RMS of a telemetry channel over the trailing window (seconds) of the plot history
function windowRms(get, windowS = 1.0) {
  if (!history.length) return 0;
  const tEnd = history[history.length - 1].time;
  let sum = 0;
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].time >= tEnd - windowS; i--) {
    const v = Number(get(history[i])) || 0;
    sum += v * v;
    n += 1;
  }
  return n ? Math.sqrt(sum / n) : 0;
}

let lastAlignedError = '';

// toFixed without a "-0.0": values that round to zero print as zero.
function fixedNoNegZero(v, digits) {
  const t = Number(v).toFixed(digits);
  return /^-0\.?0*$/.test(t) ? t.slice(1) : t;
}

function updateReadout(tel) {
  const now = performance.now();
  if (now - lastReadoutMs < 150) return;
  lastReadoutMs = now;
  const alignedError = tel.alignedError || '';
  if (alignedError && alignedError !== lastAlignedError) {
    // As the Python run, a QP/dynamics failure ends it; the worker restarts from t = 0.
    showToast(`Low level stopped (${alignedError}); restarted`);
  }
  lastAlignedError = alignedError;
  const ours = !!currentParams.controllerEnabled;
  readoutEl.classList.toggle('baseline', !ours);
  readoutTag.textContent = ours ? (tel.aligned ? 'Ours · GRU + MOB' : 'Ours') : 'Fixed-base';
  const g = tel.ghost;
  if (currentDemoId === 2) {
    readoutLabel.textContent = 'Pendulum angle';
    readoutValue.textContent = fixedNoNegZero(tel.pendulumAngleDeg, 1);
    readoutUnit.textContent = '°';
    readoutSub.textContent = g
      ? `Fixed-base: ${fixedNoNegZero(g.pendulumAngleDeg, 0)}°`
      : DEMO_META[2].phaseNames[tel.phase] ?? '';
  } else if (currentDemoId === 4) {
    readoutLabel.textContent = 'Docking gap';
    readoutValue.textContent = tel.dockingGapMm.toFixed(2);
    readoutUnit.textContent = 'mm';
    readoutSub.textContent = g
      ? `${tel.dockingSeated ? 'Seated' : 'Aligning'} · fixed-base gap ${g.dockingGapMm.toFixed(1)} mm`
      : tel.dockingSeated ? 'Seated' : 'Aligning';
  } else {
    readoutLabel.textContent = 'End-effector error';
    readoutValue.textContent = windowRms((p) => p.eePosErrMm).toFixed(2);
    readoutUnit.textContent = 'mm';
    readoutSub.textContent = currentDemoId === 5
      ? `Base sway ${(tel.beamTipDispMm || 0).toFixed(0)} mm`
      : g
        ? `RMS over last 1 s · fixed-base ${windowRms((p) => (p.ghost ? p.ghost.eePosErrMm : 0)).toFixed(0)} mm`
        : 'RMS over last 1 s';
  }
  updateGlassReadout(tel);
}

// Friction budget of the free-standing glass: |tangential| / (mu * normal), peak over 0.5 s.
function updateGlassReadout(tel) {
  const hasGlass = currentDemoId === 0 || currentDemoId === 1;
  readoutExtra.classList.toggle('hidden', !hasGlass);
  if (!hasGlass) return;
  const tilt = tel.glassTiltDeg || 0;
  const tipped = tilt > 25;
  // Wine surface: peak tilt relative to the glass over the last 1 s (first sloshing mode)
  let ripple = 0;
  if (history.length) {
    const tEnd = history[history.length - 1].time;
    for (let i = history.length - 1; i >= 0 && history[i].time >= tEnd - 1.0; i--) {
      ripple = Math.max(ripple, history[i].wineRippleDeg || 0);
    }
  }
  rxWine.textContent = tel.wineSpilled ? 'Spilled' : `${ripple.toFixed(1)}°`;
  rxWineRow.classList.toggle('bad', !!tel.wineSpilled);
  const g = tel.ghost;
  rxGhost.classList.toggle('hidden', !g);
  if (g) {
    rxGhost.textContent = `Fixed-base: ${g.wineSpilled ? 'wine spilled' : `wine ${g.wineRippleDeg.toFixed(0)}°`}` +
      `${g.glassTiltDeg > 25 ? ', glass tipped over' : `, friction ${(100 * (g.glassFrictionUse || 0)).toFixed(0)} %`}`;
  }
  readoutExtra.classList.toggle('tipped', tipped);
  if (tipped) {
    rxFric.textContent = 'Tipped over';
    rxNote.textContent = `Glass tilt ${tilt.toFixed(0)}°`;
    return;
  }
  let peak = 0;
  if (history.length) {
    const tEnd = history[history.length - 1].time;
    for (let i = history.length - 1; i >= 0 && history[i].time >= tEnd - 0.5; i--) {
      peak = Math.max(peak, history[i].glassFrictionUse || 0);
    }
  }
  const pct = 100 * peak;
  rxFric.textContent = `${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)} %`;
  rxFill.style.width = `${Math.min(100, Math.max(1.5, pct))}%`;
  rxFill.style.background = `#${frictionColor(peak).toString(16).padStart(6, '0')}`;
  rxNote.textContent = `Slip ${(tel.glassSlipMm || 0).toFixed(2)} mm · tilt ${tilt.toFixed(2)}°`;
}
const metricGrid = document.getElementById('metricGrid');
const chart1 = document.getElementById('chart1');
const chart2 = document.getElementById('chart2');
const chart1Title = document.getElementById('chart1Title');
const chart1Legend = document.getElementById('chart1Legend');

function drawLineChart(canvasEl, seriesList, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvasEl.clientWidth || 300;
  const h = canvasEl.clientHeight || 128;
  if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
  }
  const ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padL = 38;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  // Subtle horizontal grid
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (ph * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  if (history.length < 2) return;
  let ymin = Infinity;
  let ymax = -Infinity;
  if (opts.yRange) {
    ymin = opts.yRange[0];
    ymax = opts.yRange[1];
  } else {
    for (const s of seriesList) {
      for (const pt of history) {
        const v = s.get(pt);
        if (v === null || !Number.isFinite(v)) continue;
        if (v < ymin) ymin = v;
        if (v > ymax) ymax = v;
      }
    }
    if (opts.log && Number.isFinite(ymin)) {
      ymin = Math.floor(ymin);
      ymax = Math.max(ymin + 1, Math.ceil(ymax));
    }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) return;
    if (opts.includeZero && !opts.log) {
      ymin = Math.min(ymin, 0);
      ymax = Math.max(ymax, 0);
    }
    if (opts.log) {
      // decade-aligned range, no padding
    } else if (Math.abs(ymax - ymin) < 1e-4) {
      ymin -= 1;
      ymax += 1;
    } else {
      const pad = (ymax - ymin) * 0.14;
      ymin = opts.nonNegative ? Math.max(0, ymin - pad * 0.5) : ymin - pad;
      ymax += pad;
    }
  }

  const mapY = (v) => padT + ph * (1 - (v - ymin) / (ymax - ymin));

  // Optional shaded threshold bands (e.g. +/-10 deg balance corridor)
  if (opts.bands) {
    for (const b of opts.bands) {
      const yTop = Math.max(padT, Math.min(padT + ph, mapY(b.max)));
      const yBot = Math.max(padT, Math.min(padT + ph, mapY(b.min)));
      ctx.fillStyle = b.color;
      ctx.fillRect(padL, yTop, pw, Math.max(1, yBot - yTop));
    }
  }

  // Optional horizontal reference guides
  if (opts.guides) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    for (const g of opts.guides) {
      if (g.value < ymin || g.value > ymax) continue;
      const y = mapY(g.value);
      ctx.strokeStyle = g.color || 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      if (g.label) {
        ctx.fillStyle = g.color || '#86868b';
        ctx.textAlign = 'right';
        ctx.fillText(g.label, w - padR - 2, Math.max(padT + 9, y - 3));
      }
    }
    ctx.restore();
  }

  // Y-axis tick labels (log axes: decade ticks of the raw value)
  ctx.fillStyle = '#86868b';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  if (opts.log) {
    const fmt = (e) => (e >= 0 ? String(10 ** e) : (10 ** e).toFixed(-e));
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    for (let e = Math.ceil(ymin); e <= Math.floor(ymax); e++) {
      const y = mapY(e);
      ctx.fillText(fmt(e), padL - 4, y + 3);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.fillText(ymax.toFixed(1), padL - 4, padT + 7);
    ctx.fillText(((ymax + ymin) * 0.5).toFixed(1), padL - 4, padT + ph * 0.5 + 3);
    ctx.fillText(ymin.toFixed(1), padL - 4, padT + ph + 1);
  }

  // X-axis time window labels
  const tFirst = history[0].time || 0;
  const tLast = history[history.length - 1].time || 0;
  const spanS = Math.max(0.1, tLast - tFirst);
  ctx.fillStyle = '#a1a1a6';
  ctx.font = '9.5px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`-${spanS.toFixed(1)}s`, padL, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`t=${tLast.toFixed(1)}s`, w - padR, h - 4);

  // Data traces
  for (const s of seriesList) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 1.7;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let prevV = null;
    for (let i = 0; i < history.length; i++) {
      const v = s.get(history[i]);
      if (v === null || !Number.isFinite(v)) {
        prevV = null;
        continue;
      }
      const x = padL + (pw * i) / (HISTORY_LEN - 1);
      const y = Math.max(padT, Math.min(padT + ph, mapY(v)));
      if (prevV === null || (s.breakJump && Math.abs(v - prevV) > s.breakJump)) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      prevV = v;
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Top-right crisp live readout for each series
  const lastPt = history[history.length - 1];
  let pillX = w - padR - 2;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let i = seriesList.length - 1; i >= 0; i--) {
    const s = seriesList[i];
    const v = (s.raw || s.get)(lastPt);
    if (v === null || !Number.isFinite(v)) continue;
    const txt = `${s.tag ? `${s.tag} ` : ''}${fixedNoNegZero(v, s.digits ?? 2)}`;
    ctx.fillStyle = s.color;
    ctx.fillText(txt, pillX, padT + 8);
    pillX -= ctx.measureText(txt).width + 9;
  }
  ctx.textAlign = 'left';
}

function drawTorqueBars(canvasEl, tauJ) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvasEl.clientWidth || 300;
  const h = canvasEl.clientHeight || 128;
  if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
  }
  const ctx = canvasEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const limits = [87, 87, 87, 87, 12, 12, 12];
  const midY = h * 0.52;
  const maxBar = h * 0.36;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.moveTo(8, midY);
  ctx.lineTo(w - 8, midY);
  ctx.stroke();

  const colW = (w - 16) / 7;
  for (let j = 0; j < 7; j++) {
    const val = tauJ[j] || 0;
    const norm = Math.max(-1, Math.min(1, val / limits[j]));
    const bh = norm * maxBar;
    const x = 12 + j * colW;
    const bw = colW - 8;
    ctx.fillStyle = Math.abs(norm) > 0.75 ? '#ff3b30' : norm >= 0 ? '#0071e3' : '#ff9500';
    if (bh >= 0) ctx.fillRect(x, midY - bh, bw, bh);
    else ctx.fillRect(x, midY, bw, -bh);

    ctx.fillStyle = '#86868b';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`J${j + 1}`, x + bw / 2, h - 5);
    ctx.fillStyle = '#1d1d1f';
    ctx.fillText(val.toFixed(1), x + bw / 2, 13);
  }
  ctx.textAlign = 'left';
}

function updateHudAndPlots(tel, rtf) {
  if (tel.time < lastTelemetryTime - 0.05) history = [];
  lastTelemetryTime = tel.time;
  history.push(tel);
  if (history.length > HISTORY_LEN) history.shift();

  hudTime.textContent = `${tel.time.toFixed(1)} s`;
  hudRtf.textContent = `${rtf.toFixed(2)}×`;
  hudRtf.className = rtf >= 0.85 ? '' : 'warn';
  const pNames = DEMO_META[currentDemoId].phaseNames;
  const multiPhase = Object.keys(pNames).length > 1;
  hudPhase.classList.toggle('hidden', !multiPhase);
  hudPhaseSep.classList.toggle('hidden', !multiPhase);
  if (multiPhase) hudPhase.textContent = pNames[tel.phase] ?? '';
  updateReadout(tel);

  const C_BLUE = '#0071e3';
  // Statistics (RMSE, dashed) and secondary signals (base sway, contact force) in neutral greys.
  const C_STAT = '#a1a1a6';
  const C_SIGNAL = '#6e6e73';
  const STAT_DASH = [5, 3];
  // Site-wide colour rule: blue is our controller, red the fixed-base baseline (ghost or switched off).
  const C_RED = '#d70015';
  const C_GHOST = C_RED;
  const C_MAIN = currentParams.controllerEnabled ? C_BLUE : C_RED;
  // [colour, label, dashed?]: a dashed series gets a short dashed swatch instead of a dot.
  const legend = (items) =>
    items.map(([c, t, dashed]) => `<span><i class="${dashed ? 'dash' : 'dot'}" style="${dashed ? 'color' : 'background'}:${c}"></i>${t}</span>`).join('');

  let boxes = [];
  let series = [];
  let chartOpts = {};
  if (currentDemoId === 0 || currentDemoId === 1) {
    boxes = [
      ['Position error', `${tel.eePosErrMm.toFixed(2)} mm`],
      ['RMSE', `${tel.eePosRmseMm.toFixed(2)} mm`],
      ['Orientation error', `${tel.eeRotErrDeg.toFixed(2)}&deg;`],
      ['Glass tilt', `${(tel.glassTiltDeg || 0).toFixed(2)}&deg;`],
      ['Max torque', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
      ['QP residual', tel.qpResidual >= 0 ? tel.qpResidual.toExponential(1) : 'fallback'],
    ];
    if (tel.ghost) {
      // Ours vs. the fixed-base ghost differ by orders of magnitude: log axis
      const lg = (v) => Math.log10(Math.max(0.05, v));
      chart1Title.textContent = 'End-effector error (mm, log scale)';
      chart1Legend.innerHTML = legend([[C_MAIN, 'Ours'], [C_GHOST, 'Fixed-base', true]]);
      series = [
        { color: C_MAIN, digits: 2, get: (p) => lg(p.eePosErrMm), raw: (p) => p.eePosErrMm },
        {
          color: C_GHOST, digits: 1, dash: [4, 3],
          get: (p) => (p.ghost ? lg(p.ghost.eePosErrMm) : null),
          raw: (p) => (p.ghost ? p.ghost.eePosErrMm : null),
        },
      ];
      chartOpts = { log: true, unit: 'mm' };
    } else {
      chart1Title.textContent = 'End-effector error (mm)';
      chart1Legend.innerHTML = legend([[C_MAIN, 'Error'], [C_STAT, 'RMSE', true]]);
      series = [
        { color: C_MAIN, tag: '', digits: 2, get: (p) => p.eePosErrMm },
        { color: C_STAT, tag: '', digits: 2, dash: STAT_DASH, get: (p) => p.eePosRmseMm },
      ];
      chartOpts = { nonNegative: true, includeZero: true, unit: 'mm' };
    }
  } else if (currentDemoId === 2) {
    boxes = [
      ['Angle', `${fixedNoNegZero(tel.pendulumAngleDeg, 1)}&deg;`],
      ['Angular rate', `${tel.pendulumVelRadS.toFixed(2)} rad/s`],
      ['Time balanced', `${tel.pendulumBalancedS.toFixed(1)} s`],
      ['Max torque', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.textContent = 'Pendulum angle from upright (deg)';
    chart1Legend.innerHTML = legend([[C_MAIN, 'Angle'], ['rgba(0, 0, 0, 0.16)', '±10° band']]
      .concat(tel.ghost ? [[C_GHOST, 'Fixed-base', true]] : []));
    series = [{ color: C_MAIN, tag: '', digits: 1, breakJump: 180, get: (p) => p.pendulumAngleDeg }];
    if (tel.ghost) {
      series.push({ color: C_GHOST, digits: 1, dash: [4, 3], breakJump: 180,
        get: (p) => (p.ghost ? p.ghost.pendulumAngleDeg : null) });
    }
    chartOpts = {
      yRange: [-180, 180],
      unit: 'deg',
      bands: [{ min: -10, max: 10, color: 'rgba(0, 0, 0, 0.05)' }],
      guides: [{ value: 0, color: 'rgba(0, 0, 0, 0.28)' }],
    };
  } else if (currentDemoId === 5) {
    boxes = [
      ['Base sway', `${(tel.beamTipDispMm || 0).toFixed(2)} mm`],
      ['Position error', `${tel.eePosErrMm.toFixed(2)} mm`],
      ['RMSE', `${tel.eePosRmseMm.toFixed(2)} mm`],
      ['Glass tilt', `${(tel.glassTiltDeg || 0).toFixed(2)}&deg;`],
      ['Base force', `${(tel.baseReactionN || 0).toFixed(1)} N`],
      ['Max torque', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.textContent = 'Base sway vs end-effector error (mm)';
    chart1Legend.innerHTML = legend([[C_SIGNAL, 'Base'], [C_MAIN, 'End effector'], [C_STAT, 'RMSE', true]]);
    series = [
      { color: C_SIGNAL, tag: '', digits: 1, width: 1.3, get: (p) => p.beamTipDispMm || 0 },
      { color: C_MAIN, tag: '', digits: 2, get: (p) => p.eePosErrMm },
      { color: C_STAT, tag: '', digits: 2, dash: STAT_DASH, get: (p) => p.eePosRmseMm },
    ];
    chartOpts = { nonNegative: true, includeZero: true, unit: 'mm' };
  } else {
    boxes = [
      ['Axial gap', `${tel.dockingGapMm.toFixed(2)} mm`],
      ['Contact force', `${tel.dockingForceN.toFixed(2)} N`],
      ['Status', tel.dockingSeated ? 'Seated' : 'Aligning'],
      ['Max torque', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.textContent = 'Docking gap (mm) and contact force (N)';
    chart1Legend.innerHTML = legend([[C_MAIN, 'Gap'], [C_SIGNAL, 'Force']]
      .concat(tel.ghost ? [[C_GHOST, 'Fixed-base gap', true]] : []));
    series = [
      { color: C_MAIN, tag: '', digits: 2, get: (p) => p.dockingGapMm },
      { color: C_SIGNAL, tag: '', digits: 2, width: 1.3, get: (p) => p.dockingForceN },
    ];
    if (tel.ghost) {
      series.push({ color: C_GHOST, digits: 2, dash: [4, 3], get: (p) => (p.ghost ? p.ghost.dockingGapMm : null) });
    }
    chartOpts = {
      includeZero: true,
      unit: 'mm / N',
      guides: [{ value: 0, color: 'rgba(0, 0, 0, 0.28)', label: 'seated' }],
    };
  }

  if (advancedCard.open) {
    metricGrid.innerHTML = boxes
      .map(([k, v]) => `<div class="metric-box"><div class="mlabel">${k}</div><div class="mval">${v}</div></div>`)
      .join('');
    drawTorqueBars(chart2, tel.tauJ || []);
  }
  drawLineChart(chart1, series, chartOpts);
  updateTeleopHud(tel);
}

// --- UI State & Worker Bridge ---
let currentDemoId = 0;
let activeLoadId = 0;
let isRunning = true;
let lastAutoBaseMode = 0; // remembers Sinusoidal (0) vs Recorded Sea Wave (2) across Tab toggles
let currentParams = {
  controllerEnabled: true,
  movingSupport: true,
  supportScale: 1.0,
  kTrans: 200,
  kRot: 200,
  trackingMode: 0,
  targetBounceHeight: 0.25,
  pendulumStartUpright: false,
  dockingCase: 0,
  dockingWristCompliance: true,
  teleopTarget: 0,
  teleopSpeed: 1.0,
  beamYoungGpa: 12.0,
  beamTaskMode: 0,
  beamDisturber: false,
};

const appShell = document.getElementById('appShell');
const advancedCard = document.getElementById('advancedCard');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const loadingBanner = document.getElementById('loadingBanner');
const loadingText = document.getElementById('loadingText');
const loadPoster = document.getElementById('loadPoster');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnReset = document.getElementById('btnReset');
const btnStep = document.getElementById('btnStep');
const selSpeed = document.getElementById('selSpeed');
const segCtrlBtns = [...document.querySelectorAll('#segCtrl button')];
const segCtrlBase = document.getElementById('segCtrlBase');
const rowGhost = document.getElementById('rowGhost');
const chkGhost = document.getElementById('chkGhost');
const chkBaseTrail = document.getElementById('chkBaseTrail');
const GHOST_DEMOS = new Set([0, 1, 2, 4]);
// Ghost costs a second physics run: default on for Still Wine / Tracking on desktop only.
const ghostChoice = {};
let ghostEnabled = false;
function ghostDefault(id) {
  if (ghostChoice[id] !== undefined) return ghostChoice[id];
  return !IS_SMALL_TOUCH && (id === 0 || id === 1);
}
const segBaseBtns = [...document.querySelectorAll('#segBase button')];
const rowBaseMode = document.getElementById('rowBaseMode');
const rowKukaMoving = document.getElementById('rowKukaMoving');
const rowKukaScale = document.getElementById('rowKukaScale');
const teleopCard = document.getElementById('teleopCard');
const chkMoving = document.getElementById('chkMoving');
const rngScale = document.getElementById('rngScale');
const valScale = document.getElementById('valScale');
const rngKtrans = document.getElementById('rngKtrans');
const valKtrans = document.getElementById('valKtrans');
const rngKrot = document.getElementById('rngKrot');
const valKrot = document.getElementById('valKrot');
const taskControls = document.getElementById('taskControls');
const selTeleopGear = document.getElementById('selTeleopGear');
const chkCameraFrame = document.getElementById('chkCameraFrame');
const btnTeleopHome = document.getElementById('btnTeleopHome');
const btnTeleopBrake = document.getElementById('btnTeleopBrake');
const teleopHint = document.getElementById('teleopHint');
const teleopHud = document.getElementById('teleopHud');
const teleopBadge = document.getElementById('teleopBadge');
const teleopGearPill = document.getElementById('teleopGearPill');
const teleopStatusPill = document.getElementById('teleopStatusPill');
const chkOverlayPath = document.getElementById('chkOverlayPath');
const chkOverlayFrames = document.getElementById('chkOverlayFrames');
const chkOverlayForce = document.getElementById('chkOverlayForce');
const chkOverlayStress = document.getElementById('chkOverlayStress');
const chkOverlayDeflect5x = document.getElementById('chkOverlayDeflect5x');
const rowOverlayStress = document.getElementById('rowOverlayStress');
const stressLegend = document.getElementById('stressLegend');
const rowOverlayDeflect5x = document.getElementById('rowOverlayDeflect5x');
const teleopBarEls = [0, 1, 2, 3, 4, 5].map((i) => document.getElementById(`tb${i}`));
const keycapEls = new Map();
document.querySelectorAll('.keycap[data-key]').forEach((el) => {
  keycapEls.set(el.dataset.key, el);
});

const worker = new Worker(new URL('./sim_worker.js', import.meta.url), { type: 'module' });

// Media capture (?capture=1, driven by simulation/web/tools/record_media.mjs): the UI is hidden and the
// simulation advances only through window.__fr3Capture.step(n): n physics steps, then one rendered frame.
const captureMode = new URLSearchParams(window.location.search).get('capture') === '1';
const captureWaiters = new Map();
let captureNextId = 0;
let captureLastTel = null;
let captureReadyResolve = null;
if (captureMode) {
  document.body.classList.add('capture');
  const ready = new Promise((resolve) => {
    captureReadyResolve = resolve;
  });
  window.__fr3Capture = {
    ready,
    step(steps) {
      const id = ++captureNextId;
      return new Promise((resolve) => {
        captureWaiters.set(id, resolve);
        worker.postMessage({ type: 'captureStep', steps, id });
      });
    },
  };
}

function captureTelemetry(tel) {
  if (!tel) return null;
  const pick = (t) => ({
    time: t.time,
    eePosErrMm: t.eePosErrMm,
    pendulumAngleDeg: t.pendulumAngleDeg,
    dockingGapMm: t.dockingGapMm,
    dockingSeated: t.dockingSeated,
    phase: t.phase,
    glassTiltDeg: t.glassTiltDeg,
    wineSpilled: t.wineSpilled,
  });
  return { ...pick(tel), ghost: tel.ghost ? pick(tel.ghost) : null };
}

function syncCtrlSeg() {
  const on = !!currentParams.controllerEnabled;
  for (const b of segCtrlBtns) b.classList.toggle('active', (b.dataset.on === '1') === on);
  syncGhostRow();
}

// The fixed-base ghost runs next to our controller; with the baseline itself selected the toggle has no effect.
function syncGhostRow() {
  rowGhost.classList.toggle('hidden', !GHOST_DEMOS.has(currentDemoId) || !currentParams.controllerEnabled);
}

function syncBaseSeg() {
  const mode = Number(currentParams.teleopTarget || 0);
  for (const b of segBaseBtns) b.classList.toggle('active', Number(b.dataset.mode) === mode);
}

// Still Wine / Tracking / Docking / Flexible Beam on the codex/sim-accuracy low level: the SE3 gains
// come from its scenario (hold_kuka.yaml; docking_kuka.yaml for Docking), so the stiffness sliders do
// not apply, nor does the Docking wrist-compliance switch (the wrist sensor feedback is docking_kuka's).
let sceneAligned = false;

function syncCommonInputs() {
  syncCtrlSeg();
  for (const r of [rngKtrans, rngKrot]) {
    r.disabled = sceneAligned;
    r.title = sceneAligned ? 'GRU + MOB low level: SE(3) gains from the sim-accuracy scenario' : '';
  }
  const chkComp = document.getElementById('chkComp');
  if (chkComp) {
    chkComp.disabled = sceneAligned;
    chkComp.title = sceneAligned ? 'GRU + MOB low level: wrist sensor feedback from docking_kuka' : '';
  }
  chkMoving.checked = currentParams.movingSupport;
  rngScale.value = currentParams.supportScale;
  valScale.textContent = `${Number(currentParams.supportScale).toFixed(1)}x`;
  rngKtrans.value = currentParams.kTrans;
  valKtrans.textContent = `${Math.round(currentParams.kTrans)}`;
  rngKrot.value = currentParams.kRot;
  valKrot.textContent = `${Math.round(currentParams.kRot)}`;
  syncBaseSeg();
  syncTeleopUiChrome();
}

// --- 6-DOF Keyboard SpaceMouse Emulation & Base Excitation ---
const TELEOP_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'KeyI', 'KeyK', 'KeyJ', 'KeyL', 'KeyU', 'KeyO',
]);
const pressedKeys = new Set();
let pointerKey = null;
let teleopGear = 1.0;
let shiftHeld = false;
let lastSentAxes = [0, 0, 0, 0, 0, 0];
const tmpCamFwd = new THREE.Vector3();
const tmpCamRight = new THREE.Vector3();

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function effectiveTeleopSpeed() {
  return teleopGear * (shiftHeld ? 0.35 : 1.0);
}

function syncTeleopUiChrome() {
  const mode = Number(currentParams.teleopTarget || 0);
  const kbdActive = mode === 1;
  teleopHud.classList.toggle('hidden', !kbdActive);
  teleopBadge.textContent = 'Keyboard';
  if (kbdActive) {
    teleopHint.innerHTML = 'Drive the base with <code>WASD</code>/<code>QE</code> and <code>IJKL</code>/<code>UO</code>. <code>Tab</code> to exit.';
  } else if (mode === 2) {
    teleopHint.textContent = 'Replays a recorded 110 s sea-wave base motion.';
  } else {
    teleopHint.innerHTML = 'Multi-axis sinusoidal base motion. Press <code>Tab</code> to drive it yourself.';
  }
  teleopGearPill.textContent = shiftHeld ? `FINE ${(teleopGear * 0.35).toFixed(2)}x` : `${teleopGear.toFixed(1)}x`;
  chkMoving.closest('.control-row')?.classList.toggle('dimmed', kbdActive);
  rngScale.closest('.control-row')?.classList.toggle('dimmed', kbdActive);
}

function updateTeleopHud(tel) {
  if (!tel || Number(currentParams.teleopTarget || 0) !== 1) return;
  const v = tel.teleopVelNorm || [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    const val = Math.max(-1, Math.min(1, Number(v[i]) || 0));
    const el = teleopBarEls[i];
    if (!el) continue;
    const pct = Math.abs(val) * 50;
    el.style.width = `${pct.toFixed(1)}%`;
    el.style.left = val >= 0 ? '50%' : `${(50 - pct).toFixed(1)}%`;
  }
  if (tel.teleopBraking) {
    teleopStatusPill.textContent = 'LIMIT BRAKE';
    teleopStatusPill.className = 'teleop-pill warn';
  } else if (tel.teleopHoming) {
    teleopStatusPill.textContent = 'HOMING';
    teleopStatusPill.className = 'teleop-pill ok';
  } else {
    teleopStatusPill.className = 'teleop-pill hidden';
  }
}

function refreshKeycapHighlights() {
  for (const [code, el] of keycapEls) {
    el.classList.toggle('active', pressedKeys.has(code) || pointerKey === code);
  }
}

function computeWorldTeleopAxes() {
  const has = (code) => pressedKeys.has(code) || pointerKey === code;
  const f = (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0);
  const r = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
  const u = (has('KeyE') ? 1 : 0) - (has('KeyQ') ? 1 : 0);
  const pitch = (has('KeyK') ? 1 : 0) - (has('KeyI') ? 1 : 0);
  const roll = (has('KeyO') ? 1 : 0) - (has('KeyU') ? 1 : 0);
  const yaw = (has('KeyJ') ? 1 : 0) - (has('KeyL') ? 1 : 0);

  if (f === 0 && r === 0 && u === 0 && pitch === 0 && roll === 0 && yaw === 0) {
    return [0, 0, 0, 0, 0, 0];
  }

  if (chkCameraFrame.checked) {
    tmpCamFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tmpCamFwd.z = 0;
    if (tmpCamFwd.lengthSq() < 1e-6) tmpCamFwd.set(0, 1, 0);
    else tmpCamFwd.normalize();
    tmpCamRight.set(tmpCamFwd.y, -tmpCamFwd.x, 0).normalize();
    const vx = f * tmpCamFwd.x + r * tmpCamRight.x;
    const vy = f * tmpCamFwd.y + r * tmpCamRight.y;
    const wx = pitch * tmpCamRight.x + roll * tmpCamFwd.x;
    const wy = pitch * tmpCamRight.y + roll * tmpCamFwd.y;
    return [vx, vy, u, wx, wy, yaw];
  }
  return [f, -r, u, roll, pitch, yaw];
}

function syncTeleopAxes(force = false) {
  const mode = Number(currentParams.teleopTarget || 0);
  const axes = mode === 1 ? computeWorldTeleopAxes() : [0, 0, 0, 0, 0, 0];
  let changed = force;
  if (!changed) {
    for (let i = 0; i < 6; i++) {
      if (Math.abs(axes[i] - lastSentAxes[i]) > 1e-3) {
        changed = true;
        break;
      }
    }
  }
  if (changed) {
    lastSentAxes = axes;
    worker.postMessage({ type: 'setTeleopAxes', axes });
  }
  refreshKeycapHighlights();
}

function clearTeleopInputs() {
  pressedKeys.clear();
  pointerKey = null;
  shiftHeld = false;
  syncTeleopUiChrome();
  syncTeleopAxes(true);
}

function setBaseMode(nextMode) {
  const mode = nextMode === 1 ? 1 : nextMode === 2 ? 2 : 0;
  if (mode === 0 || mode === 2) lastAutoBaseMode = mode;
  currentParams.teleopTarget = mode;
  currentParams.teleopSpeed = effectiveTeleopSpeed();
  syncBaseSeg();
  if (mode !== 1) {
    pressedKeys.clear();
    pointerKey = null;
  }
  worker.postMessage({
    type: 'setParams',
    params: { teleopTarget: mode, teleopSpeed: currentParams.teleopSpeed },
  });
  syncTeleopUiChrome();
  syncTeleopAxes(true);
}

function setTeleopGear(gear) {
  teleopGear = gear;
  selTeleopGear.value = String(gear);
  currentParams.teleopSpeed = effectiveTeleopSpeed();
  worker.postMessage({ type: 'setParams', params: { teleopSpeed: currentParams.teleopSpeed } });
  syncTeleopUiChrome();
}

function setSidebarCollapsed(collapsed) {
  appShell.classList.toggle('sidebar-collapsed', collapsed);
  const narrow = window.matchMedia('(max-width: 960px)').matches;
  btnToggleSidebar.textContent = narrow ? (collapsed ? 'Panel' : 'Close') : collapsed ? 'Show panel' : 'Hide panel';
  resize();
}

btnToggleSidebar.onclick = () => {
  setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));
};

for (const b of segBaseBtns) b.onclick = () => setBaseMode(Number(b.dataset.mode));
selTeleopGear.onchange = () => setTeleopGear(Number(selTeleopGear.value));
chkCameraFrame.onchange = () => syncTeleopAxes(true);
btnTeleopHome.onclick = () => {
  if (Number(currentParams.teleopTarget || 0) !== 1) setBaseMode(1);
  worker.postMessage({ type: 'teleopHome' });
};
btnTeleopBrake.onclick = () => {
  pressedKeys.clear();
  pointerKey = null;
  syncTeleopAxes(true);
  worker.postMessage({ type: 'teleopBrake' });
};

chkOverlayPath.onchange = syncOverlayVisibility;
chkGhost.onchange = () => {
  ghostEnabled = chkGhost.checked;
  ghostChoice[currentDemoId] = ghostEnabled;
  history = [];
  trailCount = 0;
  baseTrailCount = 0;
  lastTelemetryTime = -1;
  worker.postMessage({ type: 'setGhost', enabled: ghostEnabled });
};
chkOverlayFrames.onchange = syncOverlayVisibility;
chkOverlayForce.onchange = syncOverlayVisibility;
chkOverlayStress.onchange = syncOverlayVisibility;
chkOverlayDeflect5x.onchange = syncOverlayVisibility;

for (const [code, el] of keycapEls) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    pointerKey = code;
    syncTeleopAxes(true);
  });
  const endPointer = () => {
    if (pointerKey === code) {
      pointerKey = null;
      syncTeleopAxes(true);
    }
  };
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('lostpointercapture', endPointer);
}

window.addEventListener('keydown', (e) => {
  if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    setBaseMode(Number(currentParams.teleopTarget || 0) === 1 ? lastAutoBaseMode : 1);
    return;
  }
  if (e.code === 'KeyH' && !e.repeat && Number(currentParams.teleopTarget || 0) !== 1) {
    setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));
    return;
  }
  const active = Number(currentParams.teleopTarget || 0) === 1;
  if (!active) return;

  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (!shiftHeld) {
      shiftHeld = true;
      currentParams.teleopSpeed = effectiveTeleopSpeed();
      worker.postMessage({ type: 'setParams', params: { teleopSpeed: currentParams.teleopSpeed } });
      syncTeleopUiChrome();
    }
    return;
  }
  if (e.code === 'Digit1') { e.preventDefault(); setTeleopGear(0.4); return; }
  if (e.code === 'Digit2') { e.preventDefault(); setTeleopGear(1.0); return; }
  if (e.code === 'Digit3') { e.preventDefault(); setTeleopGear(1.8); return; }
  if (e.code === 'KeyR' && !e.repeat) {
    e.preventDefault();
    worker.postMessage({ type: 'teleopHome' });
    return;
  }
  if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    pressedKeys.clear();
    syncTeleopAxes(true);
    worker.postMessage({ type: 'teleopBrake' });
    return;
  }
  if (TELEOP_KEYS.has(e.code)) {
    e.preventDefault();
    if (!pressedKeys.has(e.code)) {
      pressedKeys.add(e.code);
      syncTeleopAxes(true);
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    if (shiftHeld) {
      shiftHeld = false;
      currentParams.teleopSpeed = effectiveTeleopSpeed();
      worker.postMessage({ type: 'setParams', params: { teleopSpeed: currentParams.teleopSpeed } });
      syncTeleopUiChrome();
    }
    return;
  }
  if (pressedKeys.delete(e.code)) {
    syncTeleopAxes(true);
  }
});

window.addEventListener('blur', clearTeleopInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTeleopInputs();
});

function renderTaskSpecificControls() {
  const meta = DEMO_META[currentDemoId];
  document.getElementById('demoTitle').textContent = meta.title;
  document.getElementById('demoDesc').textContent = meta.desc;

  const isBeam = currentDemoId === 5;
  rowKukaMoving.classList.toggle('hidden', isBeam);
  rowKukaScale.classList.toggle('hidden', isBeam);
  teleopCard.classList.toggle('hidden', isBeam);
  rowBaseMode.classList.toggle('hidden', isBeam);
  segCtrlBase.textContent = 'Fixed-base';
  syncGhostRow();
  document.getElementById('ctrlHint').textContent = GHOST_DEMOS.has(currentDemoId)
    ? 'Fixed-base: a conventional controller that assumes the base is still. The ghost runs it under the same base motion.'
    : 'Fixed-base: a conventional controller that assumes the base is still.';
  chkGhost.checked = ghostEnabled;

  const camLabels = { hero: 'Overview', ee: 'Close-up', top: 'Top' };
  document.querySelectorAll('.cam-btn[data-cam]').forEach((btn) => {
    if (camLabels[btn.dataset.cam]) btn.textContent = camLabels[btn.dataset.cam];
  });

  if (currentDemoId === 0) {
    taskControls.innerHTML = `
      <div class="btn-row">
        <button class="btn impulse" id="btnPulseX">Push base X</button>
        <button class="btn impulse" id="btnPulseY">Push base Y</button>
      </div>`;
    document.getElementById('btnPulseX').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 15, fy: 0, fz: 0, duration: 0.25 });
    document.getElementById('btnPulseY').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 0, fy: 15, fz: 0, duration: 0.25 });
  } else if (currentDemoId === 1) {
    taskControls.innerHTML = `
      <div class="control-row">
        <label for="selTrackMode">Path</label>
        <select id="selTrackMode">
          <option value="0" ${currentParams.trackingMode === 0 ? 'selected' : ''}>Taiji + circle</option>
          <option value="1" ${currentParams.trackingMode === 1 ? 'selected' : ''}>Line + circle</option>
        </select>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnPulseX">Push base X</button>
        <button class="btn impulse" id="btnPulseY">Push base Y</button>
      </div>`;
    document.getElementById('selTrackMode').onchange = (e) => {
      currentParams.trackingMode = Number(e.target.value);
      history = [];
      trailCount = 0;
      worker.postMessage({ type: 'setParams', params: { trackingMode: currentParams.trackingMode } });
    };
    document.getElementById('btnPulseX').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 15, fy: 0, fz: 0, duration: 0.25 });
    document.getElementById('btnPulseY').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 0, fy: 15, fz: 0, duration: 0.25 });
  } else if (currentDemoId === 2) {
    taskControls.innerHTML = `
      <div class="control-row">
        <label class="toggle"><input type="checkbox" id="chkUpright" ${currentParams.pendulumStartUpright ? 'checked' : ''} /> Start upright</label>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnPushP">Push +</button>
        <button class="btn impulse" id="btnPushN">Push −</button>
      </div>`;
    document.getElementById('chkUpright').onchange = (e) => {
      currentParams.pendulumStartUpright = e.target.checked;
      history = [];
      worker.postMessage({ type: 'setParams', params: { pendulumStartUpright: e.target.checked } });
    };
    document.getElementById('btnPushP').onclick = () =>
      worker.postMessage({ type: 'pendulumImpulse', deltaOmega: 2.5 });
    document.getElementById('btnPushN').onclick = () =>
      worker.postMessage({ type: 'pendulumImpulse', deltaOmega: -2.5 });
  } else if (currentDemoId === 5) {
    const curE = Number(currentParams.beamYoungGpa || 12.0);
    const estHz = (1.63 * Math.sqrt(curE / 30.0)).toFixed(2);
    taskControls.innerHTML = `
      <div class="control-row">
        <label for="selBeamMode">Task</label>
        <select id="selBeamMode">
          <option value="0" ${currentParams.beamTaskMode === 0 ? 'selected' : ''}>Self-excited tracking</option>
          <option value="1" ${currentParams.beamTaskMode === 1 ? 'selected' : ''}>Hold in world</option>
        </select>
      </div>
      <div class="control-row">
        <label title="Young's modulus of the beam">Beam stiffness</label>
        <input type="range" id="rngBeamE" min="4" max="30" step="1" value="${curE}" />
        <span class="val" id="valBeamE" style="min-width:92px;">${Math.round(curE)} GPa (${estHz} Hz)</span>
      </div>
      <div class="control-row">
        <label class="toggle" title="A second arm on the beam that the controller does not know about">
          <input type="checkbox" id="chkBeamDisturber" ${currentParams.beamDisturber ? 'checked' : ''} /> Unknown disturber arm
        </label>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnStrikeZ" title="Strike the beam tip downward">Strike down</button>
        <button class="btn impulse" id="btnStrikeY" title="Strike the beam tip sideways">Strike sideways</button>
      </div>`;
    document.getElementById('selBeamMode').onchange = (e) => {
      currentParams.beamTaskMode = Number(e.target.value);
      history = [];
      trailCount = 0;
      worker.postMessage({ type: 'setParams', params: { beamTaskMode: currentParams.beamTaskMode } });
      syncOverlayVisibility();
      syncPathCamButton();
    };
    document.getElementById('rngBeamE').oninput = (e) => {
      const val = Number(e.target.value);
      currentParams.beamYoungGpa = val;
      const hz = (1.63 * Math.sqrt(val / 30.0)).toFixed(2);
      document.getElementById('valBeamE').textContent = `${Math.round(val)} GPa (${hz} Hz)`;
      worker.postMessage({ type: 'setParams', params: { beamYoungGpa: val } });
    };
    document.getElementById('chkBeamDisturber').onchange = (e) => {
      currentParams.beamDisturber = e.target.checked;
      worker.postMessage({ type: 'setParams', params: { beamDisturber: e.target.checked } });
      for (const dg of disturberGroups) dg.visible = e.target.checked;
    };
    document.getElementById('btnStrikeZ').onclick = () =>
      worker.postMessage({ type: 'beamStrike', fy: 8, fz: -55, duration: 0.25 });
    document.getElementById('btnStrikeY').onclick = () =>
      worker.postMessage({ type: 'beamStrike', fy: 45, fz: -25, duration: 0.25 });
  } else {
    taskControls.innerHTML = `
      <div class="control-row">
        <label for="selDock">Start offset</label>
        <select id="selDock">
          <option value="0" ${currentParams.dockingCase === 0 ? 'selected' : ''}>Aligned</option>
          <option value="1" ${currentParams.dockingCase === 1 ? 'selected' : ''}>Yaw +5&deg;</option>
          <option value="2" ${currentParams.dockingCase === 2 ? 'selected' : ''}>Combined</option>
        </select>
      </div>
      <div class="control-row">
        <label class="toggle"><input type="checkbox" id="chkComp" ${currentParams.dockingWristCompliance ? 'checked' : ''} /> Wrist compliance</label>
      </div>`;
    document.getElementById('selDock').onchange = (e) => {
      currentParams.dockingCase = Number(e.target.value);
      history = [];
      worker.postMessage({ type: 'setParams', params: { dockingCase: currentParams.dockingCase } });
    };
    document.getElementById('chkComp').onchange = (e) => {
      currentParams.dockingWristCompliance = e.target.checked;
      worker.postMessage({ type: 'setParams', params: { dockingWristCompliance: e.target.checked } });
    };
  }
}

function applyCamera(c, activePreset = null, smooth = true) {
  document.querySelectorAll('.cam-btn[data-cam]').forEach((btn) => {
    btn.classList.toggle('active', activePreset !== null && btn.dataset.cam === activePreset);
  });
  const targetFov = c.fov || 30;
  if (!smooth) {
    camAnim.active = false;
    const prevDamping = controls.enableDamping;
    controls.enableDamping = false;
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
    camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    controls.target.set(c.target[0], c.target[1], c.target[2]);
    controls.update();
    controls.enableDamping = prevDamping;
    return;
  }
  camAnim.fromPos.copy(camera.position);
  camAnim.toPos.set(c.pos[0], c.pos[1], c.pos[2]);
  camAnim.fromTarget.copy(controls.target);
  camAnim.toTarget.set(c.target[0], c.target[1], c.target[2]);
  camAnim.fromFov = camera.fov;
  camAnim.toFov = targetFov;
  camAnim.startMs = performance.now();
  camAnim.durMs = 450;
  camAnim.active = true;
}

function setCameraPreset(preset, smooth = true) {
  if (preset === 'path' && pathCam) {
    applyCamera(pathCam, 'path', smooth);
    return;
  }
  const presets = getCameraPresetsForDemo(currentDemoId);
  const c = presets[preset] || DEMO_META[currentDemoId].cam;
  applyCamera(fitCameraToViewport(c), presets[preset] ? preset : null, smooth);
}

// The presets are framed for a landscape view. On narrower ones (phones) pull back and slide the target
// toward the end effector, so the task stays in frame instead of falling off the right edge.
const DESIGN_ASPECT = 1.3;
function fitCameraToViewport(c) {
  const aspect = camera.aspect || DESIGN_ASPECT;
  if (aspect >= DESIGN_ASPECT * 0.92) return c;
  const focus = getCameraPresetsForDemo(currentDemoId).ee.target;
  const k = Math.min(1, (DESIGN_ASPECT - aspect) / 0.8);
  const target = c.target.map((v, i) => v + 0.6 * k * (focus[i] - v));
  const scale = 1 + 0.45 * k;
  const pos = c.pos.map((v, i) => target[i] + (v - c.target[i]) * scale);
  return { ...c, pos, target };
}

let pendingInitialCam = null;

function selectDemo(id, extraOverrides = null) {
  const resolvedId = DEMO_META[id] ? id : 0;
  currentDemoId = resolvedId;
  activeLoadId += 1;
  const loadId = activeLoadId;
  clearTeleopInputs();
  document.querySelectorAll('.demo-tab').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.demo) === resolvedId);
  });
  revealActiveTab();
  history = [];
  trailCount = 0;
  lastTelemetryTime = -1;
  isRunning = true;
  btnPlayPause.textContent = 'Pause';
  document.getElementById('demoTitle').textContent = DEMO_META[resolvedId].title;
  document.getElementById('demoDesc').textContent = DEMO_META[resolvedId].desc;
  loadingText.textContent = `Loading ${DEMO_META[resolvedId].title}…`;
  loadPoster.style.backgroundImage = `url(./posters/demo-${resolvedId}.jpg)`;
  loadingBanner.classList.remove('hidden');
  endPush();

  const mergedOverride = {
    ...(DEMO_META[resolvedId].paramsOverride || {}),
    ...(extraOverrides || {}),
  };
  ghostEnabled = GHOST_DEMOS.has(resolvedId) && ghostDefault(resolvedId);
  worker.postMessage({
    type: 'loadDemo',
    loadId,
    demoId: resolvedId,
    ghost: ghostEnabled,
    paramsOverride: Object.keys(mergedOverride).length ? mergedOverride : null,
  });
}

worker.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'progress') {
    updateDownloadProgress(msg.key, msg.loaded, msg.total);
  } else if (msg.type === 'status') {
    if (msg.loadId !== undefined && msg.loadId !== activeLoadId) return;
    loadingText.textContent = msg.text;
  } else if (msg.type === 'sceneLoaded') {
    if (msg.loadId !== activeLoadId) return;
    if (!assetsReady) await ensureVisualAssets();
    if (msg.loadId !== activeLoadId) return;
    currentParams = msg.params;
    sceneAligned = !!msg.aligned;
    if (currentParams.teleopTarget === 0 || currentParams.teleopTarget === 2) {
      lastAutoBaseMode = currentParams.teleopTarget;
    }
    syncCommonInputs();
    renderTaskSpecificControls();
    buildSceneMeshes(msg.bodyNames, msg.geoms, msg.refPath, msg.bodyRootIds);
    if (msg.initialFrame) {
      applyFrame(msg.initialFrame);
    }
    const useSmooth = hasRenderedFirstScene;
    const presets = getCameraPresetsForDemo(currentDemoId);
    if (pendingInitialCam && typeof pendingInitialCam === 'object') {
      applyCamera(pendingInitialCam, null, useSmooth);
      pendingInitialCam = null;
    } else if (pendingInitialCam && presets[pendingInitialCam]) {
      setCameraPreset(pendingInitialCam, useSmooth);
      pendingInitialCam = null;
    } else if (currentDemoId === 1 && pathCam) {
      applyCamera(pathCam, 'path', useSmooth);
    } else {
      const cam = DEMO_META[currentDemoId].cam;
      applyCamera(fitCameraToViewport(cam), cam.preset || null, useSmooth);
    }
    if (!hasRenderedFirstScene) setTimeout(maybeStartTour, 1400);
    hasRenderedFirstScene = true;
    loadingBanner.classList.add('hidden');
    worker.postMessage({ type: 'beginSim', loadId: msg.loadId });
    if (captureMode) {
      // Restart from t = 0 and hold; the recorder steps the simulation from here.
      worker.postMessage({ type: 'setRunning', running: false });
      worker.postMessage({ type: 'reset' });
      captureReadyResolve?.();
    }
  } else if (msg.type === 'refPath') {
    if (msg.loadId !== undefined && msg.loadId !== activeLoadId) return;
    updateReferencePathOverlay(msg.refPath);
    trailCount = 0;
  } else if (msg.type === 'frame') {
    if (msg.loadId !== undefined && msg.loadId !== activeLoadId) return;
    applyFrame(msg);
    if (captureMode) captureLastTel = msg.telemetry;
  } else if (msg.type === 'captureDone') {
    // The frame of this step was applied just before; resolve once it has been rendered.
    const resolve = captureWaiters.get(msg.id);
    captureWaiters.delete(msg.id);
    const tel = captureTelemetry(captureLastTel);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve?.(tel)));
  } else if (msg.type === 'error') {
    loadingText.textContent = `Error: ${msg.message}`;
    loadingBanner.classList.remove('hidden');
    console.error('[SimWorker]', msg.message);
  }
};

// --- Mouse / touch push: drag a body to pull it with a spring (MuJoCo-viewer style) ---
const viewportWrap = canvas.parentElement;
const btnPushMode = document.getElementById('btnPushMode');
const pushHint = document.getElementById('pushHint');
const forceLabel = document.getElementById('forceLabel');
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const tmpProj = new THREE.Vector3();
let pushMode = false;
let pushDrag = null;

function setPushMode(on) {
  pushMode = on;
  btnPushMode.classList.toggle('active', on);
  viewportWrap.classList.toggle('push-mode', on);
}
btnPushMode.onclick = () => setPushMode(!pushMode);
setTimeout(() => pushHint.classList.add('gone'), 9000);

function rayFromEvent(ev) {
  const r = canvas.getBoundingClientRect();
  pointerNdc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
}

function pickBody(ev) {
  rayFromEvent(ev);
  for (const h of raycaster.intersectObject(robotGroup, true)) {
    let o = h.object;
    while (o && o.userData.bodyId === undefined) o = o.parent;
    if (!o) continue;
    const id = o.userData.bodyId;
    if (id > 0 && bodyGroups[id]) return { bodyId: id, point: h.point.clone() };
  }
  return null;
}

viewportWrap.addEventListener(
  'pointerdown',
  (ev) => {
    if (ev.target !== canvas || ev.button !== 0 || pushDrag) return;
    if (!(pushMode || ev.ctrlKey || ev.metaKey)) return;
    const hit = pickBody(ev);
    if (!hit) return;
    ev.stopPropagation();
    ev.preventDefault();
    const g = bodyGroups[hit.bodyId];
    g.updateMatrixWorld(true);
    const local = g.worldToLocal(hit.point.clone());
    camera.getWorldDirection(tmpVecB);
    dragPlane.setFromNormalAndCoplanarPoint(tmpVecB, hit.point);
    pushDrag = { pointerId: ev.pointerId, target: hit.point.clone() };
    controls.enabled = false;
    viewportWrap.classList.add('dragging');
    pushHint.classList.add('gone');
    worker.postMessage({
      type: 'perturbStart',
      body: hit.bodyId,
      local: [local.x, local.y, local.z],
      target: [hit.point.x, hit.point.y, hit.point.z],
    });
  },
  { capture: true }
);
window.addEventListener('pointermove', (ev) => {
  if (!pushDrag || ev.pointerId !== pushDrag.pointerId) return;
  rayFromEvent(ev);
  if (raycaster.ray.intersectPlane(dragPlane, tmpVecA)) {
    pushDrag.target.copy(tmpVecA);
    worker.postMessage({ type: 'perturbTarget', target: [tmpVecA.x, tmpVecA.y, tmpVecA.z] });
  }
});
function endPush(ev) {
  if (!pushDrag || (ev && ev.pointerId !== undefined && ev.pointerId !== pushDrag.pointerId)) return;
  pushDrag = null;
  controls.enabled = true;
  viewportWrap.classList.remove('dragging');
  worker.postMessage({ type: 'perturbEnd' });
  if (perturbViz) perturbViz.group.visible = false;
  forceLabel.classList.add('hidden');
}
window.addEventListener('pointerup', endPush);
window.addEventListener('pointercancel', endPush);
canvas.addEventListener('contextmenu', (e) => {
  if (pushDrag || e.ctrlKey) e.preventDefault();
});

function placeForceLabel() {
  if (!pushDrag || forceLabel.classList.contains('hidden')) return;
  tmpProj.copy(pushDrag.target).project(camera);
  const r = canvas.getBoundingClientRect();
  const w = viewportWrap.getBoundingClientRect();
  forceLabel.style.left = `${(tmpProj.x * 0.5 + 0.5) * r.width + (r.left - w.left)}px`;
  forceLabel.style.top = `${(-tmpProj.y * 0.5 + 0.5) * r.height + (r.top - w.top)}px`;
}

// Wire UI events
document.querySelectorAll('.demo-tab').forEach((btn) => {
  btn.onclick = () => selectDemo(Number(btn.dataset.demo));
});

// Narrow screens: the tab strip scrolls; fade the edge that hides tabs and keep the active tab in view.
const demoTabsEl = document.getElementById('demoTabs');
function syncTabFade() {
  const max = demoTabsEl.scrollWidth - demoTabsEl.clientWidth;
  demoTabsEl.classList.toggle('fade-l', demoTabsEl.scrollLeft > 2);
  demoTabsEl.classList.toggle('fade-r', demoTabsEl.scrollLeft < max - 2);
}
function revealActiveTab() {
  const tab = demoTabsEl.querySelector('.demo-tab.active');
  if (!tab) return;
  const left = tab.offsetLeft - demoTabsEl.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left < demoTabsEl.scrollLeft + 24) demoTabsEl.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
  else if (right > demoTabsEl.scrollLeft + demoTabsEl.clientWidth - 24) {
    demoTabsEl.scrollTo({ left: right - demoTabsEl.clientWidth + 24, behavior: 'smooth' });
  }
}
demoTabsEl.addEventListener('scroll', syncTabFade, { passive: true });
window.addEventListener('resize', syncTabFade);
syncTabFade();
document.querySelectorAll('.cam-btn[data-cam]').forEach((btn) => {
  btn.onclick = () => setCameraPreset(btn.dataset.cam, true);
});

btnPlayPause.onclick = () => {
  isRunning = !isRunning;
  btnPlayPause.textContent = isRunning ? 'Pause' : 'Resume';
  worker.postMessage({ type: 'setRunning', running: isRunning });
};
btnReset.onclick = () => {
  endPush();
  history = [];
  trailCount = 0;
  lastTelemetryTime = -1;
  worker.postMessage({ type: 'reset' });
};
btnStep.onclick = () => {
  isRunning = false;
  btnPlayPause.textContent = 'Resume';
  worker.postMessage({ type: 'stepOnce' });
};
selSpeed.onchange = () => worker.postMessage({ type: 'setSpeed', speed: Number(selSpeed.value) });

for (const b of segCtrlBtns) {
  b.onclick = () => {
    currentParams.controllerEnabled = b.dataset.on === '1';
    syncCtrlSeg();
    lastReadoutMs = 0;
    if ([0, 1, 2, 4, 5].includes(currentDemoId)) {
      // Ours runs the elastic sim-accuracy plant, the fixed-base baseline the rigid scene: reload.
      const keep = ['controllerEnabled', 'teleopTarget', 'trackingMode', 'movingSupport', 'supportScale',
        'beamTaskMode', 'beamDisturber', 'beamYoungGpa', 'dockingCase', 'pendulumStartUpright'];
      selectDemo(currentDemoId, Object.fromEntries(keep.map((k) => [k, currentParams[k]])));
      return;
    }
    worker.postMessage({ type: 'setParams', params: { controllerEnabled: currentParams.controllerEnabled } });
  };
}
advancedCard.addEventListener('toggle', () => {
  if (advancedCard.open && history.length) updateHudAndPlots(history.pop(), 1);
});
chkMoving.onchange = () => {
  currentParams.movingSupport = chkMoving.checked;
  worker.postMessage({ type: 'setParams', params: { movingSupport: chkMoving.checked } });
};
rngScale.oninput = () => {
  currentParams.supportScale = Number(rngScale.value);
  valScale.textContent = `${currentParams.supportScale.toFixed(1)}x`;
  worker.postMessage({ type: 'setParams', params: { supportScale: currentParams.supportScale } });
};
rngKtrans.oninput = () => {
  currentParams.kTrans = Number(rngKtrans.value);
  valKtrans.textContent = `${Math.round(currentParams.kTrans)}`;
  worker.postMessage({ type: 'setParams', params: { kTrans: currentParams.kTrans } });
};
rngKrot.oninput = () => {
  currentParams.kRot = Number(rngKrot.value);
  valKrot.textContent = `${Math.round(currentParams.kRot)}`;
  worker.postMessage({ type: 'setParams', params: { kRot: currentParams.kRot } });
};

// --- Share: copy a deep link that reproduces this demo, its settings and the current camera ---
const btnShare = document.getElementById('btnShare');
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.classList.add('hidden'), 260);
  }, 1800);
}

function buildShareUrl() {
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  const q = u.searchParams;
  q.set('demo', String(currentDemoId));
  const bm = Number(currentParams.teleopTarget || 0);
  if (currentDemoId !== 5) q.set('base', bm === 2 ? 'wave' : bm === 1 ? 'kbd' : 'sine');
  if (!currentParams.controllerEnabled) q.set('ctrl', '0');
  if (currentDemoId === 1) q.set('track', String(Number(currentParams.trackingMode || 0)));
  if (currentDemoId === 4) q.set('dock', String(Number(currentParams.dockingCase || 0)));
  if (currentDemoId === 5) {
    q.set('beamE', String(Number(currentParams.beamYoungGpa || 8)));
    q.set('beamMode', String(Number(currentParams.beamTaskMode || 0)));
    q.set('disturber', currentParams.beamDisturber ? '1' : '0');
  }
  if (GHOST_DEMOS.has(currentDemoId)) q.set('ghost', ghostEnabled ? '1' : '0');
  const r = (v) => String(Math.round(v * 1000) / 1000);
  q.set('view', [...camera.position.toArray(), ...controls.target.toArray()].map(r).concat([Math.round(camera.fov)]).join(','));
  return u.toString();
}

btnShare.onclick = async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link to this view copied');
  } catch {
    window.prompt('Copy this link:', url);
  }
};

// --- First-visit tour (three steps, skippable, remembered in localStorage) ---
const TOUR_KEY = 'deer-wbc-tour-v1';
const tourEl = document.getElementById('tour');
const tourRing = document.getElementById('tourRing');
const tourCard = document.getElementById('tourCard');
const tourText = document.getElementById('tourText');
const tourStepEl = document.getElementById('tourStep');
const tourNext = document.getElementById('tourNext');
const tourSkip = document.getElementById('tourSkip');
const TOUR_STEPS = [
  {
    anchor: '#segCtrl',
    text: 'Compare our controller with a conventional <b>fixed-base</b> one. The translucent arm is the fixed-base controller under the same base motion.',
  },
  {
    anchor: '#btnPushMode',
    text: IS_SMALL_TOUCH
      ? 'Push the glass or the arm yourself: turn on <b>Push</b> (hand icon) and drag it.'
      : 'Push the glass or the arm yourself: turn on <b>Push</b> and drag, or hold Ctrl / &#8984; and drag.',
  },
  {
    anchor: '#readout',
    text: 'Live numbers: end-effector error, how much of its friction the free-standing glass uses, and how far the wine surface tilts.',
  },
];
let tourIdx = -1;
let tourSteps = [];

function anchorRect(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight) return null;
  return r;
}

function placeTour() {
  const step = tourSteps[tourIdx];
  const r = step && anchorRect(step.anchor);
  if (!r) {
    endTour();
    return;
  }
  const pad = 6;
  Object.assign(tourRing.style, {
    left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px`,
  });
  const cw = tourCard.offsetWidth || 280;
  const ch = tourCard.offsetHeight || 120;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = r.left + r.width / 2 - cw / 2;
  let top = r.bottom + 14;
  if (top + ch > vh - 12) top = r.top - ch - 14;
  if (top < 12) {
    top = Math.min(vh - ch - 12, Math.max(12, r.top));
    left = r.left - cw - 16 >= 12 ? r.left - cw - 16 : r.right + 16;
  }
  left = Math.min(vw - cw - 12, Math.max(12, left));
  tourCard.style.left = `${left}px`;
  tourCard.style.top = `${top}px`;
}

function showTourStep(i) {
  tourIdx = i;
  if (i >= tourSteps.length) {
    endTour();
    return;
  }
  tourText.innerHTML = tourSteps[i].text;
  tourStepEl.textContent = `${i + 1} / ${tourSteps.length}`;
  tourNext.textContent = i === tourSteps.length - 1 ? 'Done' : 'Next';
  tourEl.classList.remove('hidden');
  placeTour();
}

function endTour() {
  tourEl.classList.add('hidden');
  tourIdx = -1;
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

function maybeStartTour() {
  let seen = false;
  try {
    seen = localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    seen = true;
  }
  if (seen || new URLSearchParams(window.location.search).get('tour') === '0' || navigator.webdriver) return;
  tourSteps = TOUR_STEPS.filter((st) => anchorRect(st.anchor));
  if (tourSteps.length) showTourStep(0);
}

tourNext.onclick = () => showTourStep(tourIdx + 1);
tourSkip.onclick = endTour;
window.addEventListener('resize', () => {
  if (tourIdx >= 0) placeTour();
});

// --- Pause the simulation while the tab is hidden (saves CPU; resumes where it was) ---
let pausedByHidden = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isRunning) {
    pausedByHidden = true;
    worker.postMessage({ type: 'setRunning', running: false });
  } else if (!document.hidden && pausedByHidden) {
    pausedByHidden = false;
    worker.postMessage({ type: 'setRunning', running: true });
  }
});

function resize() {
  const wrap = canvas.parentElement;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  if (camAnim.active) {
    const rawT = Math.min(1, (performance.now() - camAnim.startMs) / camAnim.durMs);
    // Cubic ease-in-out
    const s = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, s);
    controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, s);
    camera.fov = camAnim.fromFov + (camAnim.toFov - camAnim.fromFov) * s;
    camera.updateProjectionMatrix();
    if (rawT >= 1) camAnim.active = false;
  }
  controls.update();
  if (Number(currentParams.teleopTarget || 0) === 1 && (pressedKeys.size > 0 || pointerKey !== null)) {
    syncTeleopAxes(false);
  }
  headlight.position.copy(camera.position);
  headlight.target.position.copy(controls.target);
  placeForceLabel();
  renderer.render(scene, camera);
}
animate();

// Boot: parse URL deep-link query params (?demo=0|1|2|4&base=sine|wave|kbd&cam=hero|...&ctrl=1|0&overlays=1|0&track=0|1&dock=0|1|2&sidebar=0|1)
const qs = new URLSearchParams(window.location.search);
const rawDemo = Number(qs.get('demo'));
const initDemo = rawDemo === 3 ? 4 : DEMO_META[rawDemo] ? rawDemo : 0;

const bootOverrides = {};
const baseParam = (qs.get('base') || '').toLowerCase();
if (baseParam === 'wave' || baseParam === 'seawave') {
  bootOverrides.teleopTarget = 2;
  lastAutoBaseMode = 2;
} else if (baseParam === 'kbd' || baseParam === 'keyboard') {
  bootOverrides.teleopTarget = 1;
} else if (baseParam === 'sine') {
  bootOverrides.teleopTarget = 0;
}
if (qs.has('ctrl')) {
  bootOverrides.controllerEnabled = qs.get('ctrl') !== '0';
}
if (qs.has('track') && initDemo === 1) {
  bootOverrides.trackingMode = Number(qs.get('track')) === 1 ? 1 : 0;
}
if (qs.has('dock') && initDemo === 4) {
  const dc = Number(qs.get('dock'));
  if (dc === 0 || dc === 1 || dc === 2) bootOverrides.dockingCase = dc;
}
if (initDemo === 5) {
  if (qs.has('beamE')) {
    const ev = Number(qs.get('beamE'));
    if (Number.isFinite(ev) && ev >= 4 && ev <= 30) bootOverrides.beamYoungGpa = ev;
  }
  if (qs.has('beamMode')) {
    bootOverrides.beamTaskMode = Number(qs.get('beamMode')) === 1 ? 1 : 0;
  }
  if (qs.has('disturber')) {
    bootOverrides.beamDisturber = qs.get('disturber') === '1';
  }
}
if (qs.has('ghost')) ghostChoice[initDemo] = qs.get('ghost') !== '0';
// Recordings: the pose-frame triads and force arrows read as debug graphics in a clip.
if (captureMode || qs.get('frames') === '0') chkOverlayFrames.checked = false;
if (captureMode) chkOverlayForce.checked = false;
if (qs.get('overlays') === '0') {
  chkOverlayPath.checked = false;
  chkOverlayFrames.checked = false;
  chkOverlayForce.checked = false;
  chkOverlayStress.checked = false;
  chkOverlayDeflect5x.checked = false;
}
setSidebarCollapsed(
  qs.get('sidebar') === '0' || (qs.get('sidebar') !== '1' && window.matchMedia('(max-width: 960px)').matches)
);
const camParam = (qs.get('cam') || '').toLowerCase();
if (getCameraPresetsForDemo(initDemo)[camParam]) {
  pendingInitialCam = camParam;
}
// Explicit view: ?view=px,py,pz,tx,ty,tz[,fov]
const viewParam = (qs.get('view') || '').split(',').map(Number);
if (viewParam.length >= 6 && viewParam.every(Number.isFinite)) {
  pendingInitialCam = { pos: viewParam.slice(0, 3), target: viewParam.slice(3, 6), fov: viewParam[6] || 30 };
}

ensureVisualAssets().catch((err) => {
  loadingText.textContent = `Visual asset load failed: ${err.message}`;
  console.error(err);
});
selectDemo(initDemo, Object.keys(bootOverrides).length ? bootOverrides : null);
