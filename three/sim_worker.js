// Dedicated Web Worker: runs MuJoCo 4.0.1 + SE(3) Impedance + ProxQP at 1 kHz inside WASM.
// Every demo runs the codex/sim-accuracy low level (WASM AlignedRunner: joint sensors, link
// estimator, GRU, friction shaping, full MOB, SE3, QP on the elastic plant, exported by
// simulation/web/tools/export_sim_scene.py); the rigid scenes below are only the fallback when an
// aligned scene cannot be loaded.
import createFr3SimModule from './wasm/fr3_sim_wasm.js';

let Module = null;
let session = null;
let running = true;
let speed = 1.0;
let timerId = null;
let lastWall = 0;
let accumSim = 0;
let loadedAssets = false;
let currentDemoId = 0;
let currentLoadId = 0;
// Demos on the codex/sim-accuracy low level -> exported scene (export_sim_scene.py SCENES).
const ALIGNED_DEMOS = new Map([[0, 'kuka'], [1, 'kuka'], [2, 'cartpole'], [4, 'docking'], [5, 'beam']]);
const alignedScenes = new Map();   // scene -> { xml, document } once its assets are in the session
let currentAligned = false;

const PHYSICS_ASSETS = [
  'physics_hold.xml',
  'physics_tracking.xml',
  'physics_pendulum.xml',
  'physics_docking.xml',
  'physics_beam.xml',
  'link0_coll.stl',
  'link1_coll.stl',
  'link2_coll.stl',
  'link3_coll.stl',
  'link4_coll.stl',
  'link5_coll.stl',
  'link6_coll.stl',
  'link7_coll.stl',
  'revn_dn02.stl',
  'revn_j03a.stl',
];

const DEMO_XML = {
  0: 'physics_hold.xml',
  1: 'physics_tracking.xml',
  2: 'physics_pendulum.xml',
  4: 'physics_docking.xml',
  5: 'physics_beam.xml',
};

let rtfSmooth = 1.0;
let lastFrameSent = 0;

async function fetchUint8WithProgress(url, onChunk) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  const total = Number(resp.headers.get('content-length')) || 0;
  if (!resp.body || !resp.body.getReader) {
    const buf = new Uint8Array(await resp.arrayBuffer());
    onChunk(buf.byteLength, total || buf.byteLength);
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onChunk(loaded, total || loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function ensureInit() {
  if (!Module) {
    postMessage({ type: 'status', text: 'Loading simulation…' });
    const wasmBytes = await fetchUint8WithProgress('./wasm/fr3_sim_wasm.wasm', (loaded, total) => {
      postMessage({ type: 'progress', key: 'wasm', loaded, total });
    });
    postMessage({ type: 'status', text: 'Preparing physics…' });
    Module = await createFr3SimModule({ wasmBinary: wasmBytes });
    session = new Module.WasmSimSession();
  }
  if (!loadedAssets) {
    postMessage({ type: 'status', text: 'Loading models…' });
    const allFiles = [...PHYSICS_ASSETS, 'sea_wave_kuka.bin'];
    const perLoaded = new Map();
    const perTotal = new Map();
    const emitPhysicsProgress = () => {
      let l = 0;
      let t = 0;
      for (const f of allFiles) {
        l += perLoaded.get(f) || 0;
        t += perTotal.get(f) || 0;
      }
      postMessage({ type: 'progress', key: 'physics', loaded: l, total: Math.max(t, l) });
    };

    const results = await Promise.all(
      allFiles.map(async (fname) => {
        const buf = await fetchUint8WithProgress(`./assets/physics/${fname}`, (loaded, total) => {
          perLoaded.set(fname, loaded);
          perTotal.set(fname, total);
          emitPhysicsProgress();
        });
        return [fname, buf];
      })
    );
    for (const [fname, buf] of results) {
      if (fname === 'sea_wave_kuka.bin') session.loadSeaWave(buf);
      else session.addAsset(fname, buf);
    }
    loadedAssets = true;
  }
}

// An aligned scene (plant XML + exported document) and its GRU bundle, fetched once per scene.
async function ensureAligned(scene) {
  if (alignedScenes.has(scene)) return alignedScenes.get(scene);
  postMessage({ type: 'status', loadId: currentLoadId, text: 'Loading GRU + MOB low level…' });
  const base = './assets/aligned';
  const response = await fetch(`${base}/aligned_${scene}.json`);
  if (!response.ok) throw new Error(`aligned_${scene}.json: HTTP ${response.status}`);
  const documentText = await response.text();
  const doc = JSON.parse(documentText);
  const xml = await fetchUint8WithProgress(`${base}/${doc.xml}`, () => {});
  session.addAsset(doc.xml, xml);
  await Promise.all(doc.gru.files.map(async (f) => {
    const bytes = await fetchUint8WithProgress(`${base}/${doc.gru.directory}/${f.name}`, () => {});
    session.writeFile(`${doc.gru.mount}/${f.name}`, bytes);
  }));
  const entry = { xml: doc.xml, document: documentText };
  alignedScenes.set(scene, entry);
  return entry;
}

async function loadMainScene(demoId, override) {
  const wantAligned = ALIGNED_DEMOS.has(demoId);
  currentAligned = false;
  if (wantAligned) {
    try {
      const a = await ensureAligned(ALIGNED_DEMOS.get(demoId));
      session.loadAlignedScene(a.xml, a.document, demoId);
      currentAligned = true;
    } catch (err) {
      console.error('[SimWorker] aligned low level unavailable, using the rigid scene:', err);
    }
  }
  if (!currentAligned) session.loadScene(DEMO_XML[demoId] ?? DEMO_XML[0], demoId);
  if (override) {
    const p = session.getParams();
    Object.assign(p, override);
    session.setParams(p);
    session.reset();
  }
}

function stopLoop() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function captureFramePayload(rtf) {
  const bx = new Float32Array(session.getBodyXposView());
  const bq = new Float32Array(session.getBodyXquatView());
  const gx = new Float32Array(session.getGeomXposView());
  const gm = new Float32Array(session.getGeomXmatView());
  const telemetry = session.getTelemetry();
  const perturb = session.getPerturbState();
  const transfer = [bx.buffer, bq.buffer, gx.buffer, gm.buffer];
  return {
    payload: {
      perturb,
      loadId: currentLoadId,
      bodyXpos: bx,
      bodyXquat: bq,
      geomXpos: gx,
      geomXmat: gm,
      telemetry,
      rtf,
    },
    transfer,
  };
}

function sendSceneLoaded() {
  const bodyNames = session.getBodyNames();
  const geoms = session.getGeoms();
  const refPath = session.getReferencePath(240);
  const params = session.getParams();
  const { payload, transfer } = captureFramePayload(speed);
  postMessage(
    {
      type: 'sceneLoaded',
      loadId: currentLoadId,
      demoId: currentDemoId,
      bodyNames,
      geoms,
      refPath,
      params,
      aligned: currentAligned,
      initialFrame: payload,
    },
    transfer
  );
}

function sendFrame(rtf) {
  const { payload, transfer } = captureFramePayload(rtf);
  postMessage({ type: 'frame', ...payload }, transfer);
}

function tickLoop() {
  if (!session || !running) return;
  const now = performance.now();
  const wallDt = Math.min(0.05, Math.max(0.0, (now - lastWall) / 1000.0));
  lastWall = now;

  const dt = session.timestep();
  accumSim += wallDt * speed;
  // Cap per-tick steps to avoid spiral of death on slower devices / heavy SDF
  const maxSteps = Math.max(1, Math.min(40, Math.round((0.025 * speed) / dt)));
  const nSteps = Math.min(maxSteps, Math.floor(accumSim / dt));

  if (nSteps > 0) {
    accumSim -= nSteps * dt;
    if (accumSim > 0.05 * speed) accumSim = 0;

    const t0 = performance.now();
    session.stepBatch(nSteps);
    const stepMs = performance.now() - t0;
    const simMs = nSteps * dt * 1000.0;
    const instRtf = stepMs > 0.05 ? Math.min(speed, simMs / Math.max(stepMs, wallDt * 1000.0)) : speed;
    rtfSmooth = 0.85 * rtfSmooth + 0.15 * instRtf;
  }

  if (now - lastFrameSent >= 16.0) {
    lastFrameSent = now;
    sendFrame(rtfSmooth);
  }
}

function startLoop() {
  stopLoop();
  lastWall = performance.now();
  lastFrameSent = lastWall;
  accumSim = 0;
  timerId = setInterval(tickLoop, 16);
}

onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'loadDemo') {
      stopLoop();
      running = false;
      currentLoadId = Number(msg.loadId) || 0;
      await ensureInit();
      currentDemoId = msg.demoId;
      postMessage({ type: 'status', loadId: currentLoadId, text: 'Building scene…' });
      session.clearPerturb();
      await loadMainScene(currentDemoId, msg.paramsOverride);
      accumSim = 0;
      rtfSmooth = speed;
      // Wait for main thread to finish GLB/mesh setup and initial t=0 render before stepping
      sendSceneLoaded();
    } else if (msg.type === 'beginSim' && session) {
      if (Number(msg.loadId) === currentLoadId) {
        running = true;
        startLoop();
      }
    } else if (msg.type === 'setParams' && session) {
      const p = session.getParams();
      const trackingChanged =
        currentDemoId === 1 &&
        msg.params.trackingMode !== undefined &&
        msg.params.trackingMode !== p.trackingMode;
      const uprightChanged =
        currentDemoId === 2 &&
        msg.params.pendulumStartUpright !== undefined &&
        msg.params.pendulumStartUpright !== p.pendulumStartUpright;
      const dockCaseChanged =
        currentDemoId === 4 &&
        msg.params.dockingCase !== undefined &&
        msg.params.dockingCase !== p.dockingCase;
      const beamModeChanged =
        currentDemoId === 5 &&
        msg.params.beamTaskMode !== undefined &&
        msg.params.beamTaskMode !== p.beamTaskMode;
      Object.assign(p, msg.params);
      session.setParams(p);
      if (trackingChanged || uprightChanged || dockCaseChanged || beamModeChanged) {
        if (!beamModeChanged) session.reset();
        lastWall = performance.now();
        lastFrameSent = lastWall;
        accumSim = 0;
        postMessage({ type: 'refPath', loadId: currentLoadId, refPath: session.getReferencePath(240) });
      }
      sendFrame(rtfSmooth);
    } else if (msg.type === 'setRunning') {
      running = Boolean(msg.running);
      lastWall = performance.now();
      lastFrameSent = lastWall;
      accumSim = 0;
    } else if (msg.type === 'setSpeed') {
      speed = Math.max(0.1, Math.min(3.0, Number(msg.speed) || 1.0));
    } else if (msg.type === 'reset' && session) {
      session.clearPerturb();
      session.reset();
      session.setTeleopAxes(0, 0, 0, 0, 0, 0);
      lastWall = performance.now();
      lastFrameSent = lastWall;
      accumSim = 0;
      postMessage({ type: 'refPath', loadId: currentLoadId, refPath: session.getReferencePath(240) });
      sendFrame(rtfSmooth);
    } else if (msg.type === 'setTeleopAxes' && session) {
      const a = (msg.axes || [0, 0, 0, 0, 0, 0]).map((v) => Number(v) || 0);
      session.setTeleopAxes(a[0], a[1], a[2], a[3], a[4], a[5]);
    } else if (msg.type === 'teleopHome' && session) {
      session.triggerTeleopHome();
    } else if (msg.type === 'teleopBrake' && session) {
      session.triggerTeleopBrake();
    } else if (msg.type === 'stepOnce' && session) {
      running = false;
      session.stepBatch(10);
      sendFrame(0);
    } else if (msg.type === 'captureStep' && session) {
      // Media capture (tools/record_media.mjs): advance exactly n physics steps, then one frame.
      running = false;
      const n = Math.max(0, Math.floor(Number(msg.steps) || 0));
      if (n > 0) session.stepBatch(n);
      sendFrame(0);
      postMessage({ type: 'captureDone', id: msg.id });
    } else if (msg.type === 'pendulumImpulse' && session) {
      session.injectPendulumImpulse(Number(msg.deltaOmega) || 0);
      sendFrame(rtfSmooth);
    } else if (msg.type === 'ballNudge' && session) {
      session.injectBallNudge(Number(msg.dvx) || 0.2, Number(msg.dvy) || -0.15);
      sendFrame(rtfSmooth);
    } else if (msg.type === 'basePulse' && session) {
      session.injectBasePulse(
        Number(msg.fx) || 15,
        Number(msg.fy) || 0,
        Number(msg.fz) || 0,
        Number(msg.duration) || 0.25
      );
    } else if (msg.type === 'perturbStart' && session) {
      const l = msg.local || [0, 0, 0];
      const t = msg.target || [0, 0, 0];
      session.setPerturb(Number(msg.body) | 0, +l[0], +l[1], +l[2], +t[0], +t[1], +t[2]);
    } else if (msg.type === 'perturbTarget' && session) {
      const t = msg.target || [0, 0, 0];
      session.setPerturbTarget(+t[0], +t[1], +t[2]);
    } else if (msg.type === 'perturbEnd' && session) {
      session.clearPerturb();
    } else if (msg.type === 'beamStrike' && session) {
      session.injectBeamStrike(
        Number(msg.fy) || 0,
        Number(msg.fz) || -55,
        Number(msg.duration) || 0.25
      );
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err?.message || err) });
  }
};
