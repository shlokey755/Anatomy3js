import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCar, applyPalette } from './model.js';
import { clamp, smooth, ease } from './timeline.js';
import './style.css';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Chapters: nav targets, readout label, and which axis rows light up. */
const CHAPTERS = [
  { p: 0.0, start: 0.0, name: 'Intro', axis: '', rows: [] },
  { p: 0.15, start: 0.12, name: 'Body', axis: 'Y', rows: ['y'] },
  { p: 0.35, start: 0.32, name: 'Wheels', axis: 'Z', rows: ['z'] },
  { p: 0.53, start: 0.5, name: 'Powertrain', axis: 'X', rows: ['x'] },
  { p: 0.72, start: 0.68, name: 'Assembly', axis: 'X Y Z', rows: ['x', 'y', 'z'] },
  { p: 0.93, start: 0.9, name: 'Assembled', axis: '', rows: [] },
];

/* Camera path: it moves on all three axes. `w` = half-width of the scene we need in frame. */
const KEYS = [
  { p: 0.0, pos: [5.6, 1.9, 7.0], tgt: [0, 0.8, 0], w: 3.0 },
  { p: 0.13, pos: [7.6, 3.0, 9.0], tgt: [0, 1.2, 0], w: 5.0 },
  { p: 0.32, pos: [9.8, 5.2, 11.0], tgt: [0, 2.4, 0], w: 4.6 },
  { p: 0.5, pos: [11.8, 3.8, 4.0], tgt: [0, 2.2, 0], w: 4.4 },
  { p: 0.59, pos: [7.0, 4.2, 11.8], tgt: [0.3, 2.1, 0], w: 5.2 },
  { p: 0.68, pos: [1.0, 3.4, 14.8], tgt: [0.6, 2.1, 0], w: 5.6 },
  { p: 0.84, pos: [8.5, 5.0, 9.5], tgt: [0, 3.0, 0], w: 3.6 },
  { p: 1.0, pos: [-6.4, 2.2, 8.2], tgt: [0, 0.9, 0], w: 3.4 },
];

function keyPos(p) {
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (p <= KEYS[i + 1].p) {
      const u = (p - KEYS[i].p) / (KEYS[i + 1].p - KEYS[i].p);
      return { t: (i + u) / (KEYS.length - 1), w: KEYS[i].w + (KEYS[i + 1].w - KEYS[i].w) * u };
    }
  }
  return { t: 1, w: KEYS[KEYS.length - 1].w };
}

/* ---------------------------------------------------------------- 3D stage */
function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 20, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 0.8));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 13, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 1, far: 40, left: -12, right: 12, top: 12, bottom: -12 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let grid = null;
  const makeGrid = (centre, lines) => {
    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      grid.material.dispose();
    }
    grid = new THREE.GridHelper(80, 80, centre, lines);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    scene.add(grid);
  };

  const { car, parts, spinners, shaftSpin, mats, max } = buildCar();
  const rig = new THREE.Group(); // pivot at the car's centre so it tumbles about itself
  rig.position.y = 0.7;
  car.position.y = -0.7;
  rig.add(car);
  scene.add(rig);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 140);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k.tgt)), false, 'centripetal');
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();

  let W = 1;
  let H = 1;
  const off = { x: 0, y: 0, z: 0 };
  const rot = { x: 0, y: 0, z: 0 };
  const state = { off, rot, cam: camPos, max };

  function theme() {
    const cs = getComputedStyle(root);
    const v = (n) => cs.getPropertyValue(n).trim();
    const dark = v('--scene') === 'dark';
    applyPalette(mats, dark ? 'dark' : 'light');
    scene.fog.color.set(v('--bg'));
    makeGrid(v('--line'), v('--grid'));
    ground.material.opacity = dark ? 0.4 : 0.18;
    scene.environmentIntensity = dark ? 0.35 : 0.55;
  }

  function resize(w, h) {
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }

  // p: scroll progress; ox/oy: pixel shift of the picture so the car sits clear of the text card
  function draw(p, ox, oy) {
    /* parts slide along their own axis inside their chapter's window, and return in "assemble" */
    off.x = off.y = off.z = 0;
    for (const pt of parts) {
      const [a, b, c, d] = pt.win;
      const e = ease(a, b, p) * (1 - ease(c, d, p));
      pt.group.position.set(pt.dir.x * e, pt.dir.y * e, pt.dir.z * e);
      off.x = Math.max(off.x, Math.abs(pt.dir.x * e));
      off.y = Math.max(off.y, Math.abs(pt.dir.y * e));
      off.z = Math.max(off.z, Math.abs(pt.dir.z * e));
    }

    /* wheels and driveshaft turn with the scroll */
    const spin = p * 70;
    spinners.forEach((s) => (s.rotation.y = -spin));
    shaftSpin.rotation.x = spin * 2.2;

    /* whole car: swing in the intro, then hop up and turn about Z (pitch), X (roll) and Y (yaw) */
    const yawBase = -0.45 + 0.7 * smooth(0, 0.12, p) - 0.25 * smooth(0.16, 0.3, p) - 0.35 * smooth(0.92, 1, p);
    const turn = (a, b) => ease(a, b, p) * Math.PI * 2;
    rig.rotation.set(turn(0.81, 0.86), yawBase + turn(0.86, 0.91), turn(0.76, 0.81));
    rig.position.y = 0.7 + 2.4 * (smooth(0.7, 0.76, p) - smooth(0.91, 0.96, p));
    rot.x = THREE.MathUtils.radToDeg(rig.rotation.x);
    rot.y = THREE.MathUtils.radToDeg(rig.rotation.y);
    rot.z = THREE.MathUtils.radToDeg(rig.rotation.z);

    /* camera glides along a spline through X, Y and Z, pulled back if the screen is narrow */
    const { t, w } = keyPos(p);
    posCurve.getPoint(t, camPos);
    tgtCurve.getPoint(t, camTgt);
    const dist = camPos.distanceTo(camTgt);
    const k = Math.max(1, w / (tanHalf * camera.aspect * dist));
    camPos.sub(camTgt).multiplyScalar(k).add(camTgt);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    scene.fog.near = dist * k * 0.9;
    scene.fog.far = dist * k * 2.6 + 12;
    camera.setViewOffset(W, H, ox, oy, W, H);

    renderer.render(scene, camera);
    return state;
  }

  theme();
  return { resize, theme, draw };
}

/* ------------------------------------------------------------ page wiring */
const story = $('#story');
const ref = $('#ref');
const cards = $$('.card').map((el) => ({
  el,
  r: el.dataset.range.split(',').map(Number),
  axis: el.dataset.axis,
  dir: el.dataset.side === 'left' ? -1 : 1,
}));
const reveals = $$('[data-reveal]');
const hudRows = Object.fromEntries($$('#hud .hud-row[data-axis]').map((el) => [el.dataset.axis, el]));
const hudCh = $('#hud-ch');
const hudCam = $('#hud-cam');
const pct = $('#pct');
const progbar = $('#progbar');

let stage = null;
try {
  stage = createStage($('#gl'));
} catch (err) {
  console.warn('WebGL unavailable', err);
  root.classList.add('no-gl');
}
if (stage) {
  new MutationObserver(() => {
    stage.theme();
    need = true;
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    stage.theme();
    need = true;
  });
}

let W = innerWidth;
let H = innerHeight;
let stack = false; // phone / portrait: cards sit at the bottom instead of beside the car
let storyMax = 1;
let need = true;

const navButtons = CHAPTERS.map((c) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', `Go to ${c.name}`);
  b.innerHTML = `<span class="lbl">${c.name}</span><span class="dot"></span>`;
  b.addEventListener('click', () => window.scrollTo({ top: c.p * storyMax, behavior: reduceMotion ? 'auto' : 'smooth' }));
  $('#nav').append(b);
  return b;
});
$$('[data-goto]').forEach((b) =>
  b.addEventListener('click', () => {
    const top = b.dataset.goto === 'ref' ? ref.offsetTop : 0;
    window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  })
);

function measureReveals() {
  for (const el of reveals) {
    el.style.transform = 'none';
    el._top = el.getBoundingClientRect().top + scrollY;
  }
}

function measure() {
  W = innerWidth;
  H = innerHeight;
  stack = W < 900 || W / H < 1;
  storyMax = Math.max(1, story.offsetHeight - H);
  stage?.resize(W, H);
  measureReveals();
  need = true;
}
addEventListener('resize', measure);
addEventListener('load', measure);
document.fonts?.ready.then(measure);
measure();

const fmt = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1);
const wrapDeg = (d) => Math.round(((((d + 180) % 360) + 360) % 360) - 180);

function updateCards(p) {
  let side = 0;
  let seen = 0;
  for (const c of cards) {
    const [a, b, cc, d] = c.r;
    const vin = smooth(a, b, p);
    const vout = smooth(cc, d, p);
    const v = vin * (1 - vout);
    const ki = 1 - vin;
    let tr;
    if (c.axis === 'x') tr = `translate3d(${c.dir * 150 * (ki + vout)}px,0,0) rotateY(${-c.dir * 30 * (ki + vout)}deg)`;
    else if (c.axis === 'y') tr = `translate3d(0,${110 * ki - 110 * vout}px,0) rotateX(${-20 * ki + 20 * vout}deg)`;
    else tr = `translate3d(0,0,${-700 * ki + 450 * vout}px)`;
    c.el.style.transform = `perspective(1100px) ${tr}`;
    c.el.style.opacity = reduceMotion ? (v > 0.5 ? 1 : 0) : v;
    c.el.style.visibility = v > 0.003 ? 'visible' : 'hidden';
    c.el.style.pointerEvents = v > 0.6 ? 'auto' : 'none';
    side += -c.dir * v;
    seen += v;
  }
  return { side: clamp(side, -1, 1), seen: clamp(seen) };
}

function updateReveals() {
  for (const el of reveals) {
    const t = reduceMotion ? 1 : clamp((H * 0.96 - (el._top - scrollY)) / (H * 0.42));
    const e = 1 - Math.pow(1 - t, 3);
    const k = 1 - e;
    const dir = el.dataset.dir === '-1' ? -1 : 1;
    const axis = el.dataset.reveal;
    let tr;
    if (axis === 'x') tr = `translate3d(${-110 * k * dir}px,0,0) rotateY(${28 * k * dir}deg)`;
    else if (axis === 'y') tr = `translate3d(0,${80 * k}px,0) rotateX(${-24 * k}deg)`;
    else tr = `translate3d(0,0,${-520 * k}px)`;
    el.style.transform = `perspective(1000px) ${tr}`;
    el.style.opacity = 0.1 + 0.9 * e;
  }
}

function updateHud(p, s) {
  let idx = 0;
  CHAPTERS.forEach((c, i) => {
    if (p >= c.start) idx = i;
  });
  const ch = CHAPTERS[idx];
  hudCh.textContent = idx === 0 ? 'Intro' : idx === CHAPTERS.length - 1 ? 'Assembled' : `0${idx} ${ch.name} · axis ${ch.axis}`;
  for (const ax of ['x', 'y', 'z']) {
    const row = hudRows[ax];
    row.classList.toggle('on', ch.rows.includes(ax));
    row.querySelector('i').style.transform = `scaleX(${clamp(s.off[ax] / s.max[ax])})`;
    row.querySelector('.off').textContent = s.off[ax].toFixed(2);
    row.querySelector('.rot').textContent = `${wrapDeg(s.rot[ax])}°`;
  }
  hudCam.textContent = `${fmt(s.cam.x)} ${fmt(s.cam.y)} ${fmt(s.cam.z)}`;
  navButtons.forEach((b, i) => b.setAttribute('aria-current', String(i === idx)));
}

function updateProgress(p) {
  pct.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
  progbar.style.transform = `scaleX(${p})`;
}

let cur = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const target = clamp(scrollY / storyMax);
  const prev = cur;
  cur += (target - cur) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 7));
  if (Math.abs(target - cur) < 1e-5) cur = target;

  const onStage = scrollY < storyMax + H * 1.2; // after that the reference page fully covers the canvas
  const inRef = scrollY > storyMax + H * 0.5; // readout and rail would sit on top of the reference text
  if (inRef !== document.body.classList.contains('in-ref')) document.body.classList.toggle('in-ref', inRef);
  if (cur !== prev || need) {
    const ui = updateCards(cur);
    updateProgress(cur);
    if (stage && onStage) {
      const ox = stack ? 0 : -ui.side * W * 0.2;
      const oy = stack ? H * 0.2 * ui.seen : 0;
      updateHud(cur, stage.draw(cur, ox, oy));
    }
    need = false;
  }
  if (scrollY > storyMax - H) updateReveals();
}
requestAnimationFrame(frame);
updateReveals();
