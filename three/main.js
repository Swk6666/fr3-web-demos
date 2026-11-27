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
    title: '1. Floating-Base Brandy Cup Hold',
    desc: '3030 aluminum mobile base & Franka Control cabinet + flat-bottom brandy cradle with free 6-DOF 330 mL wine glass, wrist IMU & 3 mocap spheres (J7 = +45°). 1 kHz SE(3) + ProxQP rejects KUKA sinusoidal or 110 s recorded sea-wave disturbances.',
    phaseNames: { 0: 'HOLDING' },
    paramsOverride: { kTrans: 200, kRot: 200 },
    cam: { ...CAMERA_PRESETS.hero, preset: 'hero' },
  },
  1: {
    title: '2. Trajectory Tracking (Brandy Cup)',
    desc: 'Continuous C² vertical YZ Figure-8 + Circle or horizontal Line + XY Circle tracked at tray_surface_site (J7 = +45°) while the free 6-DOF 330 mL brandy wine glass rides upright on the moving support.',
    phaseNames: { 0: 'TRACKING' },
    paramsOverride: { kTrans: 200, kRot: 200, trackingMode: 0 },
    cam: { pos: [0.68, 0.52, 2.70], target: [-0.46, 1.28, 2.48], fov: 30 },
  },
  2: {
    title: '3. Floating-Base Cart-Pole (BRT38)',
    desc: 'Fixed G00 wrist receiver and a 90° tool-side bracket with coaxial BRT38 encoder & Ø8×250 mm aluminum rod (J7 = +45°, fixed wrist IMU & 3 mocap spheres clear with 0/721 collisions, swing along world +X). Encoder side: two M4×30 button heads enter from G00 above; locknuts slide into the G01 side windows. The opposite two screws enter from below.',
    phaseNames: { 0: 'KICK', 1: 'SWING-UP', 2: 'LQR BALANCE' },
    paramsOverride: { kTrans: 160, kRot: 80, supportScale: 0.3 },
    cam: { pos: [-0.22, 0.02, 2.74], target: [-0.46, 1.18, 2.62], fov: 35 },
  },
  4: {
    title: '4. Lotus Petal SDF Contact Docking',
    desc: 'Compact DN01 thin ring + HPS74A 6-axis F/T sensor + DN02 male lotus petal & J03A female station on fixed wrist receiver (J7 = +45°): direct CAD-mesh MuJoCo native SDF contact mating on moving KUKA with compliant alignment & live 3D force vector.',
    phaseNames: { 0: 'SETTLE', 1: 'APPROACH', 2: 'ALIGNING', 3: 'SEATED' },
    paramsOverride: { kTrans: 300, kRot: 300 },
    cam: { pos: [0.12, 0.68, 2.68], target: [-0.46, 1.30, 2.57], fov: 30 },
  },
  5: {
    title: '5. 3.5 m Flexible Beam Coupling (Two-Way)',
    desc: 'Native 8-segment 3D Euler–Bernoulli cantilevered beam (L = 3.5 m, live E = 4–30 GPa) coupled two-way to FR3 link0. Inertial reactions visibly bend & ring the beam while End-Effector-Rooted SE(3)+QP stabilizes the wine glass.',
    phaseNames: { 0: 'SELF-EXCITED', 1: 'HOLD / TAP', 2: 'DISTURBER ON' },
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const scene = new THREE.Scene();
const FOG_COLOR = srgb(0.34, 0.39, 0.43);
scene.background = srgb(0.30, 0.35, 0.40);
scene.fog = new THREE.Fog(FOG_COLOR, 18, 50);

// Z-up studio gradient sky dome
const skyGeo = new THREE.SphereGeometry(52, 32, 20);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTopColor: { value: srgb(0.43, 0.50, 0.55) },
    uHorizonColor: { value: srgb(0.60, 0.64, 0.68) },
    uBottomColor: { value: srgb(0.20, 0.24, 0.29) },
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
      #include <tonemapping_fragment>
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
  new THREE.Color(0.28, 0.30, 0.33),
  0.44
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

// Seamless matte slate studio floor
const floorGeo = new THREE.PlaneGeometry(96, 96);
const floorMat = new THREE.MeshStandardMaterial({
  color: srgb(0.36, 0.40, 0.43),
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
    loadProgressMeta.textContent = `${(sumLoaded / 1048576).toFixed(1)} / ${(sumTotal / 1048576).toFixed(1)} MB · ${peakProgressPct}%`;
  }
}

// Loaded visual GLB geometry library + body manifest + Studio IBL
const glbGeometries = new Map();
let visualManifest = {};
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
    new THREE.LineDashedMaterial({ color: 0xcbd5e1, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.55 })
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

function buildSceneMeshes(bodyNames, geoms, refPath) {
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
    const visList = visualManifest[bname];
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

  syncOverlayVisibility();
}

function updateReferencePathOverlay(refPath) {
  if (refLine) {
    overlayGroup.remove(refLine);
    refLine.geometry.dispose();
    refLine = null;
  }
  if (!refPath || refPath.length < 6) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(refPath), 3));
  refLine = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 })
  );
  refLine.visible = chkOverlayPath.checked;
  overlayGroup.add(refLine);
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
  ctx.strokeStyle = 'rgba(154, 166, 180, 0.13)';
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
        if (v < ymin) ymin = v;
        if (v > ymax) ymax = v;
      }
    }
    if (!Number.isFinite(ymin) || !Number.isFinite(ymax)) return;
    if (opts.includeZero) {
      ymin = Math.min(ymin, 0);
      ymax = Math.max(ymax, 0);
    }
    if (Math.abs(ymax - ymin) < 1e-4) {
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
      ctx.strokeStyle = g.color || 'rgba(148, 163, 184, 0.35)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      if (g.label) {
        ctx.fillStyle = g.color || '#94a3b8';
        ctx.textAlign = 'right';
        ctx.fillText(g.label, w - padR - 2, Math.max(padT + 9, y - 3));
      }
    }
    ctx.restore();
  }

  // Y-axis tick labels
  ctx.fillStyle = '#9aa6b4';
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(ymax.toFixed(1), padL - 4, padT + 7);
  ctx.fillText(((ymax + ymin) * 0.5).toFixed(1), padL - 4, padT + ph * 0.5 + 3);
  ctx.fillText(ymin.toFixed(1), padL - 4, padT + ph + 1);

  // X-axis time window labels
  const tFirst = history[0].time || 0;
  const tLast = history[history.length - 1].time || 0;
  const spanS = Math.max(0.1, tLast - tFirst);
  ctx.fillStyle = '#7e8c9c';
  ctx.font = '9.5px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`-${spanS.toFixed(1)}s`, padL, h - 4);
  ctx.textAlign = 'center';
  ctx.fillText(opts.unit ? `Window (${opts.unit})` : 'Time Window', padL + pw * 0.5, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`t=${tLast.toFixed(1)}s`, w - padR, h - 4);

  // Data traces
  for (const s of seriesList) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    let prevV = null;
    for (let i = 0; i < history.length; i++) {
      const v = s.get(history[i]);
      const x = padL + (pw * i) / (HISTORY_LEN - 1);
      const y = Math.max(padT, Math.min(padT + ph, mapY(v)));
      if (i === 0 || (s.breakJump && prevV !== null && Math.abs(v - prevV) > s.breakJump)) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      prevV = v;
    }
    ctx.stroke();
  }

  // Top-right crisp live readout for each series
  const lastPt = history[history.length - 1];
  let pillX = w - padR - 2;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'right';
  for (let i = seriesList.length - 1; i >= 0; i--) {
    const s = seriesList[i];
    const v = s.get(lastPt);
    const txt = `${s.tag ? `${s.tag} ` : ''}${v.toFixed(s.digits ?? 2)}`;
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
  ctx.strokeStyle = 'rgba(154, 166, 180, 0.28)';
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
    ctx.fillStyle = Math.abs(norm) > 0.75 ? '#ef4444' : norm >= 0 ? '#52b6e6' : '#f27024';
    if (bh >= 0) ctx.fillRect(x, midY - bh, bw, bh);
    else ctx.fillRect(x, midY, bw, -bh);

    ctx.fillStyle = '#9aa6b4';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`J${j + 1}`, x + bw / 2, h - 5);
    ctx.fillStyle = '#d8e0e8';
    ctx.fillText(val.toFixed(1), x + bw / 2, 13);
  }
  ctx.textAlign = 'left';
}

function updateHudAndPlots(tel, rtf) {
  if (tel.time < lastTelemetryTime - 0.05) history = [];
  lastTelemetryTime = tel.time;
  history.push(tel);
  if (history.length > HISTORY_LEN) history.shift();

  hudTime.textContent = `${tel.time.toFixed(2)} s`;
  hudRtf.textContent = `${rtf.toFixed(2)}x RT`;
  hudRtf.className = `v ${rtf >= 0.85 ? 'ok' : 'warn'}`;
  const pNames = DEMO_META[currentDemoId].phaseNames;
  hudPhase.textContent = pNames[tel.phase] ?? `P${tel.phase}`;

  let boxes = [];
  let series = [];
  let chartOpts = {};
  if (currentDemoId === 0 || currentDemoId === 1) {
    boxes = [
      ['&Vert;p<sub>e</sub>&Vert;', `${tel.eePosErrMm.toFixed(2)} mm`],
      ['RMSE(p<sub>e</sub>)', `${tel.eePosRmseMm.toFixed(2)} mm`],
      ['&Vert;&phi;&Vert;', `${tel.eeRotErrDeg.toFixed(2)}&deg;`],
      ['&psi;<sub>glass</sub>', `${(tel.glassTiltDeg || 0).toFixed(2)}&deg;`],
      ['&Vert;&tau;<sub>sdk</sub>&Vert;<sub>&infin;</sub>', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
      ['QP Res', tel.qpResidual >= 0 ? tel.qpResidual.toExponential(1) : 'FALLBACK'],
    ];
    chart1Title.innerHTML = 'End-Effector Error &Vert;p<sub>e</sub>&Vert; &amp; RMSE (mm)';
    chart1Legend.innerHTML =
      '<span><i class="dot" style="background:#52b6e6"></i>&Vert;p<sub>e</sub>&Vert; (mm)</span>' +
      '<span><i class="dot" style="background:#34d399"></i>RMSE (mm)</span>';
    series = [
      { color: '#52b6e6', tag: 'err', digits: 2, get: (p) => p.eePosErrMm },
      { color: '#34d399', tag: 'rmse', digits: 2, get: (p) => p.eePosRmseMm },
    ];
    chartOpts = {
      nonNegative: true,
      includeZero: true,
      unit: 'mm',
      guides: [{ value: 0, color: 'rgba(148,163,184,0.35)' }],
    };
  } else if (currentDemoId === 2) {
    boxes = [
      ['&theta; (Upright)', `${tel.pendulumAngleDeg.toFixed(1)}&deg;`],
      ['&theta;&#775; (Rate)', `${tel.pendulumVelRadS.toFixed(2)} rad/s`],
      ['t<sub>bal</sub> (&le;10&deg;)', `${tel.pendulumBalancedS.toFixed(1)} s`],
      ['&Vert;&tau;<sub>sdk</sub>&Vert;<sub>&infin;</sub>', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.innerHTML = 'Pendulum Upright Error &theta; (deg)';
    chart1Legend.innerHTML =
      '<span><i class="dot" style="background:#f27024"></i>&theta; (deg)</span>' +
      '<span><i class="dot" style="background:rgba(52,211,153,0.55)"></i>&plusmn;10&deg; LQR Band</span>';
    series = [{ color: '#f27024', tag: 'θ', digits: 1, breakJump: 180, get: (p) => p.pendulumAngleDeg }];
    chartOpts = {
      yRange: [-180, 180],
      unit: 'deg',
      bands: [{ min: -10, max: 10, color: 'rgba(52, 211, 153, 0.16)' }],
      guides: [
        { value: 0, color: 'rgba(52, 211, 153, 0.55)', label: '0°' },
      ],
    };
  } else if (currentDemoId === 5) {
    boxes = [
      ['&Vert;&delta;<sub>base</sub>&Vert; (Tip)', `${(tel.beamTipDispMm || 0).toFixed(2)} mm`],
      ['&Vert;p<sub>e</sub>&Vert; (EE)', `${tel.eePosErrMm.toFixed(2)} mm`],
      ['RMSE(p<sub>e</sub>)', `${tel.eePosRmseMm.toFixed(2)} mm`],
      ['&psi;<sub>glass</sub>', `${(tel.glassTiltDeg || 0).toFixed(2)}&deg;`],
      ['&Vert;&Delta;f<sub>s</sub>&Vert; (Base)', `${(tel.baseReactionN || 0).toFixed(1)} N`],
      ['&Vert;&tau;<sub>sdk</sub>&Vert;<sub>&infin;</sub>', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.innerHTML = 'Base Tip Sway &Vert;&delta;<sub>base</sub>&Vert; vs EE Error &Vert;p<sub>e</sub>&Vert; (mm)';
    chart1Legend.innerHTML =
      '<span><i class="dot" style="background:#f27024"></i>Base &Vert;&delta;<sub>base</sub>&Vert;</span>' +
      '<span><i class="dot" style="background:#52b6e6"></i>EE &Vert;p<sub>e</sub>&Vert;</span>' +
      '<span><i class="dot" style="background:#34d399"></i>EE RMSE</span>';
    series = [
      { color: '#f27024', tag: 'base', digits: 1, get: (p) => p.beamTipDispMm || 0 },
      { color: '#52b6e6', tag: 'ee', digits: 2, get: (p) => p.eePosErrMm },
      { color: '#34d399', tag: 'rmse', digits: 2, get: (p) => p.eePosRmseMm },
    ];
    chartOpts = {
      nonNegative: true,
      includeZero: true,
      unit: 'mm',
      guides: [{ value: 0, color: 'rgba(148,163,184,0.35)' }],
    };
  } else {
    boxes = [
      ['Axial Gap &Delta;z', `${tel.dockingGapMm.toFixed(2)} mm`],
      ['Contact Force F<sub>n</sub>', `${tel.dockingForceN.toFixed(2)} N`],
      ['Mating Status', tel.dockingSeated ? 'SEATED' : 'ALIGNING'],
      ['&Vert;&tau;<sub>sdk</sub>&Vert;<sub>&infin;</sub>', `${tel.maxTorqueNm.toFixed(1)} N&middot;m`],
    ];
    chart1Title.innerHTML = 'Docking Gap &Delta;z (mm) &amp; Force F<sub>n</sub> (N)';
    chart1Legend.innerHTML =
      '<span><i class="dot" style="background:#52b6e6"></i>&Delta;z (mm)</span>' +
      '<span><i class="dot" style="background:#f27024"></i>F<sub>n</sub> (N)</span>';
    series = [
      { color: '#52b6e6', tag: 'Δz', digits: 2, get: (p) => p.dockingGapMm },
      { color: '#f27024', tag: 'Fn', digits: 2, get: (p) => p.dockingForceN },
    ];
    chartOpts = {
      includeZero: true,
      unit: 'mm / N',
      guides: [
        { value: 0, color: 'rgba(52, 211, 153, 0.48)', label: '0 mm seated' },
      ],
    };
  }

  metricGrid.innerHTML = boxes
    .map(([k, v]) => `<div class="metric-box"><div class="mlabel">${k}</div><div class="mval">${v}</div></div>`)
    .join('');

  drawLineChart(chart1, series, chartOpts);
  drawTorqueBars(chart2, tel.tauJ || []);
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
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const loadingBanner = document.getElementById('loadingBanner');
const loadingText = document.getElementById('loadingText');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnReset = document.getElementById('btnReset');
const btnStep = document.getElementById('btnStep');
const selSpeed = document.getElementById('selSpeed');
const chkCtrl = document.getElementById('chkCtrl');
const lblCtrlToggle = document.getElementById('lblCtrlToggle');
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
const selTeleopTarget = document.getElementById('selTeleopTarget');
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

function syncCommonInputs() {
  chkCtrl.checked = currentParams.controllerEnabled;
  chkMoving.checked = currentParams.movingSupport;
  rngScale.value = currentParams.supportScale;
  valScale.textContent = `${Number(currentParams.supportScale).toFixed(1)}x`;
  rngKtrans.value = currentParams.kTrans;
  valKtrans.textContent = `${Math.round(currentParams.kTrans)}`;
  rngKrot.value = currentParams.kRot;
  valKrot.textContent = `${Math.round(currentParams.kRot)}`;
  selTeleopTarget.value = String(currentParams.teleopTarget || 0);
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
  teleopBadge.textContent = 'KUKA BASE 6-DOF';
  if (kbdActive) {
    teleopHint.innerHTML =
      'Controlling <strong>KUKA moving base</strong> via 1 kHz DLS IK + smooth braking. <code>WASD/QE</code> move, <code>IKJL/UO</code> tilt/yaw, <code>R</code> smooth home.';
  } else if (mode === 2) {
    teleopHint.innerHTML =
      'Replaying <strong>110 s 4-band sea-wave spectrum</strong> (0.19–0.95 Hz, Catmull-Rom 1 kHz, 6-axis KUKA excitation). Scale with <em>Base Amp</em> or press <code>Tab</code> for Keyboard 6-DOF.';
  } else {
    teleopHint.innerHTML =
      'Running <strong>multi-axis sinusoidal wave</strong>. Switch to <em>Recorded Sea Wave (110 s)</em> for experimental wave excitation, or press <code>Tab</code> for 6-DOF keyboard teleop.';
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
  selTeleopTarget.value = String(mode);
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
  btnToggleSidebar.textContent = collapsed ? 'Show Panel' : 'Hide Panel';
  resize();
}

btnToggleSidebar.onclick = () => {
  setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));
};

selTeleopTarget.onchange = () => setBaseMode(Number(selTeleopTarget.value));
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
  const fastenersLink = document.getElementById('cartpoleFasteners');
  if (fastenersLink) fastenersLink.hidden = currentDemoId !== 2;

  const isBeam = currentDemoId === 5;
  rowKukaMoving.classList.toggle('hidden', isBeam);
  rowKukaScale.classList.toggle('hidden', isBeam);
  teleopCard.classList.toggle('hidden', isBeam);
  lblCtrlToggle.textContent = isBeam
    ? 'End-Effector-Rooted (Ours) vs Fixed-Base'
    : 'SE(3) + ProxQP Active';

  const camLabels = isBeam
    ? { hero: 'Hero', workcell: 'Full Span', detail: 'Root Clamp', base: 'Base Joint', ee: 'End-Effector', side: 'Side', top: 'Top' }
    : { hero: 'Hero', workcell: 'Workcell', detail: 'Foundry Detail', base: 'Mobile Base', ee: 'End-Effector', side: 'Side', top: 'Top' };
  document.querySelectorAll('.cam-btn').forEach((btn) => {
    if (camLabels[btn.dataset.cam]) btn.textContent = camLabels[btn.dataset.cam];
  });

  if (currentDemoId === 0) {
    taskControls.innerHTML = `
      <div class="btn-row">
        <button class="btn impulse" id="btnPulseX">Push +15 N (X)</button>
        <button class="btn impulse" id="btnPulseY">Push +15 N (Y)</button>
      </div>`;
    document.getElementById('btnPulseX').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 15, fy: 0, fz: 0, duration: 0.25 });
    document.getElementById('btnPulseY').onclick = () =>
      worker.postMessage({ type: 'basePulse', fx: 0, fy: 15, fz: 0, duration: 0.25 });
  } else if (currentDemoId === 1) {
    taskControls.innerHTML = `
      <div class="control-row">
        <label for="selTrackMode">Trajectory</label>
        <select id="selTrackMode">
          <option value="0" ${currentParams.trackingMode === 0 ? 'selected' : ''}>Figure-8 + Circle (YZ)</option>
          <option value="1" ${currentParams.trackingMode === 1 ? 'selected' : ''}>Line + XY Circle</option>
        </select>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnPulseX">Push +15 N (X)</button>
        <button class="btn impulse" id="btnPulseY">Push +15 N (Y)</button>
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
        <label class="toggle"><input type="checkbox" id="chkUpright" ${currentParams.pendulumStartUpright ? 'checked' : ''} /> Start Near Upright (Push Recovery)</label>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnPushP">Push +2.5 rad/s</button>
        <button class="btn impulse" id="btnPushN">Push -2.5 rad/s</button>
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
        <label for="selBeamMode">Coupling Task</label>
        <select id="selBeamMode">
          <option value="0" ${currentParams.beamTaskMode === 0 ? 'selected' : ''}>Self-Excited Tracking (Single Arm)</option>
          <option value="1" ${currentParams.beamTaskMode === 1 ? 'selected' : ''}>World Hold (Tap / Disturber)</option>
        </select>
      </div>
      <div class="control-row">
        <label title="3.5 m Euler-Bernoulli cantilever modulus E (30 GPa = paper reference ~1.6 Hz)">Beam E</label>
        <input type="range" id="rngBeamE" min="4" max="30" step="1" value="${curE}" />
        <span class="val" id="valBeamE" style="min-width:86px;">${Math.round(curE)} GPa (${estHz} Hz)</span>
      </div>
      <div class="control-row">
        <label class="toggle" title="Attach unknown 3-DOF mid-span disturber arm at x = 2.19 m (controller is blind to it)">
          <input type="checkbox" id="chkBeamDisturber" ${currentParams.beamDisturber ? 'checked' : ''} /> Unknown Beam Disturber (x=2.19 m)
        </label>
      </div>
      <div class="btn-row">
        <button class="btn impulse" id="btnStrikeZ" title="Apply smooth 55 N downward impact to beam tip">Strike Beam (-55 N Z)</button>
        <button class="btn impulse" id="btnStrikeY" title="Apply 3D lateral+vertical impact to beam tip">Lateral Strike (+45 N Y)</button>
      </div>`;
    document.getElementById('selBeamMode').onchange = (e) => {
      currentParams.beamTaskMode = Number(e.target.value);
      history = [];
      trailCount = 0;
      worker.postMessage({ type: 'setParams', params: { beamTaskMode: currentParams.beamTaskMode } });
      syncOverlayVisibility();
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
        <label for="selDock">Initial Offset</label>
        <select id="selDock">
          <option value="0" ${currentParams.dockingCase === 0 ? 'selected' : ''}>Aligned</option>
          <option value="1" ${currentParams.dockingCase === 1 ? 'selected' : ''}>Yaw +5&deg;</option>
          <option value="2" ${currentParams.dockingCase === 2 ? 'selected' : ''}>Combined (Yaw+Roll+XY)</option>
        </select>
      </div>
      <div class="control-row">
        <label class="toggle"><input type="checkbox" id="chkComp" ${currentParams.dockingWristCompliance ? 'checked' : ''} /> Wrist Force Compliance</label>
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
  document.querySelectorAll('.cam-btn').forEach((btn) => {
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
  const presets = getCameraPresetsForDemo(currentDemoId);
  const c = presets[preset] || DEMO_META[currentDemoId].cam;
  applyCamera(c, presets[preset] ? preset : null, smooth);
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
  history = [];
  trailCount = 0;
  lastTelemetryTime = -1;
  isRunning = true;
  btnPlayPause.textContent = 'Pause';
  loadingText.textContent = `Loading ${DEMO_META[resolvedId].title}…`;
  loadingBanner.classList.remove('hidden');

  const mergedOverride = {
    ...(DEMO_META[resolvedId].paramsOverride || {}),
    ...(extraOverrides || {}),
  };
  worker.postMessage({
    type: 'loadDemo',
    loadId,
    demoId: resolvedId,
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
    if (currentParams.teleopTarget === 0 || currentParams.teleopTarget === 2) {
      lastAutoBaseMode = currentParams.teleopTarget;
    }
    syncCommonInputs();
    renderTaskSpecificControls();
    buildSceneMeshes(msg.bodyNames, msg.geoms, msg.refPath);
    if (msg.initialFrame) {
      applyFrame(msg.initialFrame);
    }
    const useSmooth = hasRenderedFirstScene;
    const presets = getCameraPresetsForDemo(currentDemoId);
    if (pendingInitialCam && presets[pendingInitialCam]) {
      setCameraPreset(pendingInitialCam, useSmooth);
      pendingInitialCam = null;
    } else {
      const cam = DEMO_META[currentDemoId].cam;
      applyCamera(cam, cam.preset || null, useSmooth);
    }
    hasRenderedFirstScene = true;
    loadingBanner.classList.add('hidden');
    worker.postMessage({ type: 'beginSim', loadId: msg.loadId });
  } else if (msg.type === 'refPath') {
    if (msg.loadId !== undefined && msg.loadId !== activeLoadId) return;
    updateReferencePathOverlay(msg.refPath);
    trailCount = 0;
  } else if (msg.type === 'frame') {
    if (msg.loadId !== undefined && msg.loadId !== activeLoadId) return;
    applyFrame(msg);
  } else if (msg.type === 'error') {
    loadingText.textContent = `Error: ${msg.message}`;
    loadingBanner.classList.remove('hidden');
    console.error('[SimWorker]', msg.message);
  }
};

// Wire UI events
document.querySelectorAll('.demo-tab').forEach((btn) => {
  btn.onclick = () => selectDemo(Number(btn.dataset.demo));
});
document.querySelectorAll('.cam-btn').forEach((btn) => {
  btn.onclick = () => setCameraPreset(btn.dataset.cam, true);
});

btnPlayPause.onclick = () => {
  isRunning = !isRunning;
  btnPlayPause.textContent = isRunning ? 'Pause' : 'Resume';
  worker.postMessage({ type: 'setRunning', running: isRunning });
};
btnReset.onclick = () => {
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

chkCtrl.onchange = () => {
  currentParams.controllerEnabled = chkCtrl.checked;
  worker.postMessage({ type: 'setParams', params: { controllerEnabled: chkCtrl.checked } });
};
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
if (qs.get('overlays') === '0') {
  chkOverlayPath.checked = false;
  chkOverlayFrames.checked = false;
  chkOverlayForce.checked = false;
  chkOverlayStress.checked = false;
  chkOverlayDeflect5x.checked = false;
}
if (qs.get('sidebar') === '0') {
  setSidebarCollapsed(true);
}
const camParam = (qs.get('cam') || '').toLowerCase();
if (getCameraPresetsForDemo(initDemo)[camParam]) {
  pendingInitialCam = camParam;
}

ensureVisualAssets().catch((err) => {
  loadingText.textContent = `Visual asset load failed: ${err.message}`;
  console.error(err);
});
selectDemo(initDemo, Object.keys(bootOverrides).length ? bootOverrides : null);
