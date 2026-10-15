import * as THREE from 'three';
import { win } from './timeline.js';

// Car-local axes: +X = front, +Y = up, Z = across the car. 1 unit ≈ 1 metre.
const WHEEL_X = 1.4;
const WHEEL_R = 0.36;
const WHEEL_Z = 0.72;
const TYRE_W = 0.3;
const ARCH_R = 0.46;
const SILL_Y = 0.2;
const BODY_W = 1.8;
const CABIN_W = 1.5;
const ARCH_DX = Math.sqrt(ARCH_R ** 2 - (WHEEL_R - SILL_Y) ** 2);
const ARCH_A0 = Math.atan2(SILL_Y - WHEEL_R, -ARCH_DX);
const ARCH_A1 = Math.atan2(SILL_Y - WHEEL_R, ARCH_DX);

// Cool-tinted neutrals, one set per theme.
export const PALETTES = {
  light: {
    body: '#d3d4d4', interior: '#8d9093', chassis: '#585c60', engine: '#a1a4a7',
    metal: '#c9cccf', dark: '#2a2d30', tyre: '#1d1f21', glass: '#1b1d1f',
    glassOpacity: 0.28, lamp: '#ffffff', tail: '#16181a', line: '#0e1113',
  },
  dark: {
    body: '#464a4e', interior: '#6f7479', chassis: '#8b9095', engine: '#a6abb0',
    metal: '#c2c7cc', dark: '#1c1f22', tyre: '#0b0c0d', glass: '#c4c9ce',
    glassOpacity: 0.2, lamp: '#ffffff', tail: '#050505', line: '#eceeef',
  },
};

export function applyPalette(mats, name) {
  const p = PALETTES[name];
  for (const k of ['body', 'interior', 'chassis', 'engine', 'metal', 'dark', 'tyre', 'glass', 'lamp', 'tail']) {
    mats[k].color.set(p[k]);
  }
  mats.glass.opacity = p.glassOpacity;
  mats.lamp.emissive.set(p.lamp);
  mats.line.color.set(p.line);
}

function makeMaterials() {
  // polygonOffset pushes faces back a hair so the outline edges never z-fight with them
  const base = { roughness: 0.55, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const std = (o = {}) => new THREE.MeshStandardMaterial({ ...base, ...o });
  return {
    body: std({ roughness: 0.4, metalness: 0.25 }),
    interior: std({ roughness: 0.8, metalness: 0 }),
    chassis: std({ metalness: 0.5 }),
    engine: std({ roughness: 0.45, metalness: 0.6 }),
    metal: std({ roughness: 0.3, metalness: 0.85 }),
    dark: std({ roughness: 0.6, metalness: 0.2 }),
    tyre: std({ roughness: 0.9, metalness: 0 }),
    glass: std({ roughness: 0.1, metalness: 0.4, transparent: true, depthWrite: false }),
    lamp: std({ roughness: 0.2, metalness: 0, emissiveIntensity: 0.35 }),
    tail: std({ roughness: 0.2, metalness: 0.3 }),
    line: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }),
  };
}

// Side profile of the lower body, with wheel-arch cut-outs in the underside.
function bodyShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.25, SILL_Y);
  [-WHEEL_X, WHEEL_X].forEach((cx) => {
    s.lineTo(cx - ARCH_DX, SILL_Y);
    s.absarc(cx, WHEEL_R, ARCH_R, ARCH_A0, ARCH_A1, true);
  });
  s.lineTo(2.25, SILL_Y);
  s.lineTo(2.3, 0.5);
  s.lineTo(2.25, 0.78);
  s.lineTo(1.9, 0.9);
  s.lineTo(0.9, 0.98);
  s.lineTo(-1.3, 0.98);
  s.lineTo(-1.7, 0.96);
  s.lineTo(-2.22, 0.88);
  s.lineTo(-2.3, 0.5);
  s.closePath();
  return s;
}

function cabinShape() {
  const s = new THREE.Shape();
  s.moveTo(-1.3, 0.94);
  s.lineTo(-0.75, 1.38);
  s.lineTo(0.3, 1.38);
  s.lineTo(0.9, 0.94);
  s.closePath();
  return s;
}

// Dark liner filling an arch so you can't see straight through the body.
function wellShape() {
  const s = new THREE.Shape();
  s.moveTo(-ARCH_DX, SILL_Y);
  s.absarc(0, WHEEL_R, ARCH_R, ARCH_A0, ARCH_A1, true);
  s.closePath();
  return s;
}

function extrude(shape, width) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, -width / 2);
  return g;
}

class Helix extends THREE.Curve {
  constructor(r, h, turns) {
    super();
    this.r = r;
    this.h = h;
    this.turns = turns;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(this.r * Math.cos(a), t * this.h, this.r * Math.sin(a));
  }
}

export function buildCar() {
  const mats = makeMaterials();
  const car = new THREE.Group();
  const parts = []; // every group that slides: { group, dir, win:[inStart,inEnd,outStart,outEnd] }
  const spinners = []; // wheel spinners, turned by scroll
  let shaftSpin = null;

  const OUT = (a, b) => win('assemble', a, b);

  const part = (name, dir, inWin, outWin) => {
    const group = new THREE.Group();
    group.name = name;
    car.add(group);
    parts.push({ name, group, dir: new THREE.Vector3(...dir), win: [...inWin, ...outWin] });
    return group;
  };

  const add = (parent, geo, mat, o = {}) => {
    const mesh = new THREE.Mesh(geo, mat);
    if (o.pos) mesh.position.set(...o.pos);
    if (o.rot) mesh.rotation.set(...o.rot);
    mesh.castShadow = o.cast !== false;
    if (o.edges !== false) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), mats.line));
    parent.add(mesh);
    return mesh;
  };
  const box = (parent, w, h, d, mat, pos, o = {}) => add(parent, new THREE.BoxGeometry(w, h, d), mat, { pos, ...o });
  // cylinder along an axis; rTop sits on the +Y side of the unrotated cylinder
  const cyl = (parent, rTop, rBot, len, mat, axis, pos, o = {}) =>
    add(parent, new THREE.CylinderGeometry(rTop, rBot, len, 32), mat, {
      pos,
      rot: axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0],
      ...o,
    });
  const both = (fn) => [1, -1].forEach(fn);

  /* ---------- Chassis (stays put: the reference) ---------- */
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  car.add(chassis);
  both((s) => box(chassis, 4.1, 0.14, 0.1, mats.chassis, [-0.05, 0.32, 0.5 * s]));
  [1.9, 0.1, -0.9, -2.2].forEach((x) => box(chassis, 0.12, 0.1, 1.1, mats.chassis, [x, 0.32, 0]));

  /* ---------- Y axis: body, cabin, interior ---------- */
  const body = part('body', [0, 1.6, 0], win('body', 0.14, 0.74), OUT(0.02, 0.36));
  add(body, extrude(bodyShape(), BODY_W), mats.body);
  [WHEEL_X, -WHEEL_X].forEach((x) =>
    add(body, extrude(wellShape(), 1.6), mats.dark, { pos: [x, 0, 0], edges: false })
  );
  both((s) => box(body, 0.1, 0.12, 0.4, mats.lamp, [2.28, 0.66, 0.58 * s])); // headlights
  box(body, 0.06, 0.14, 1.1, mats.dark, [2.29, 0.36, 0]); // intake
  box(body, 0.07, 0.09, 1.42, mats.tail, [-2.265, 0.74, 0]); // tail-light bar
  both((s) => box(body, 0.09, 0.13, 0.34, mats.tail, [-2.27, 0.74, 0.6 * s]));
  box(body, 0.06, 0.14, 1.2, mats.dark, [-2.285, 0.32, 0]); // diffuser
  both((s) => box(body, 0.05, 0.1, 0.06, mats.dark, [-2.05, 0.96, 0.5 * s])); // spoiler posts
  box(body, 0.34, 0.035, 1.5, mats.dark, [-2.1, 1.03, 0]).rotation.z = -0.08; // spoiler wing

  const cabin = part('cabin', [0, 3.0, 0], win('body', 0.2, 0.86), OUT(0, 0.34));
  add(cabin, extrude(cabinShape(), CABIN_W), mats.glass);
  box(cabin, 1.05, 0.05, CABIN_W, mats.body, [-0.225, 1.405, 0]); // roof
  both((s) => box(cabin, 0.12, 0.09, 0.16, mats.body, [0.75, 1.06, 0.82 * s])); // mirrors

  const interior = part('interior', [0, 0.45, 0], win('body', 0.16, 0.7), OUT(0.04, 0.38));
  both((s) => {
    box(interior, 0.55, 0.14, 0.46, mats.interior, [-0.15, 0.5, 0.4 * s]); // seat
    box(interior, 0.1, 0.62, 0.46, mats.interior, [-0.45, 0.85, 0.4 * s]).rotation.z = 0.12; // backrest
    box(interior, 0.1, 0.16, 0.26, mats.interior, [-0.5, 1.22, 0.4 * s]); // headrest
  });
  box(interior, 0.35, 0.2, 1.3, mats.interior, [0.62, 1.08, 0]); // dashboard
  const wheelRing = add(interior, new THREE.TorusGeometry(0.17, 0.02, 8, 28), mats.dark, { pos: [0.34, 1.0, 0.4], edges: false });
  wheelRing.rotation.order = 'ZYX';
  wheelRing.rotation.set(0, Math.PI / 2, -0.35); // steering wheel

  /* ---------- Z axis: springs, brakes, wheels ---------- */
  const helixGeo = new THREE.TubeGeometry(new Helix(0.085, 0.42, 7), 120, 0.016, 6, false);
  const wheelParts = [];
  both((sz) =>
    [WHEEL_X, -WHEEL_X].forEach((x) => {
      const sus = part('suspension', [0, 0, 1.0 * sz], win('wheels', 0.14, 0.74), OUT(0.06, 0.4));
      add(sus, helixGeo, mats.metal, { pos: [x, 0.42, 0.42 * sz], edges: false });
      cyl(sus, 0.03, 0.03, 0.46, mats.dark, 'y', [x, 0.65, 0.42 * sz], { edges: false });
      cyl(sus, 0.06, 0.06, 0.02, mats.metal, 'y', [x, 0.43, 0.42 * sz], { edges: false });
      cyl(sus, 0.06, 0.06, 0.02, mats.metal, 'y', [x, 0.87, 0.42 * sz], { edges: false });

      const brake = part('brake', [0, 0, 1.5 * sz], win('wheels', 0.2, 0.8), OUT(0.08, 0.42));
      cyl(brake, 0.21, 0.21, 0.03, mats.metal, 'z', [x, WHEEL_R, 0.52 * sz]);
      cyl(brake, 0.07, 0.07, 0.08, mats.dark, 'z', [x, WHEEL_R, 0.52 * sz], { edges: false });
      box(brake, 0.2, 0.11, 0.08, mats.dark, [x, WHEEL_R + 0.2, 0.52 * sz]); // caliper

      const wheel = part('wheel', [0, 0, 2.3 * sz], win('wheels', 0.26, 0.86), OUT(0.1, 0.44));
      wheelParts.push({ wheel, x, sz });
    })
  );
  wheelParts.forEach(({ wheel, x, sz }) => {
    const outer = new THREE.Group(); // axle (local Y) -> world Z
    outer.rotation.x = Math.PI / 2;
    outer.position.set(x, WHEEL_R, WHEEL_Z * sz);
    const spin = new THREE.Group();
    outer.add(spin);
    const c = (r, h, mat, seg = 40, edges = false) =>
      add(spin, new THREE.CylinderGeometry(r, r, h, seg), mat, { edges });
    c(WHEEL_R, TYRE_W, mats.tyre, 40, true);
    c(0.26, TYRE_W + 0.01, mats.metal);
    c(0.21, TYRE_W + 0.018, mats.dark);
    for (let i = 0; i < 3; i++) {
      add(spin, new THREE.BoxGeometry(0.44, TYRE_W + 0.022, 0.05), mats.metal, { edges: false }).rotation.y = (i * Math.PI) / 3;
    }
    c(0.06, TYRE_W + 0.03, mats.metal, 16);
    wheel.add(outer);
    spinners.push(spin);
  });

  /* ---------- X axis: powertrain ---------- */
  const rad = part('radiator', [2.9, 0, 0], win('power', 0.1, 0.7), OUT(0.1, 0.44));
  box(rad, 0.08, 0.42, 0.9, mats.engine, [2.05, 0.55, 0]);
  for (let i = 0; i < 5; i++) box(rad, 0.09, 0.015, 0.84, mats.dark, [2.05, 0.4 + 0.065 * i, 0], { edges: false });
  box(rad, 0.1, 0.14, 1.5, mats.chassis, [2.18, 0.4, 0]); // bumper beam

  const eng = part('engine', [1.9, 0, 0], win('power', 0.15, 0.75), OUT(0.12, 0.46));
  box(eng, 0.84, 0.34, 0.62, mats.engine, [1.35, 0.52, 0]); // block
  box(eng, 0.84, 0.12, 0.56, mats.engine, [1.35, 0.75, 0]); // head
  [-0.3, -0.1, 0.1, 0.3].forEach((dx) => cyl(eng, 0.045, 0.045, 0.09, mats.dark, 'y', [1.35 + dx, 0.855, 0], { edges: false }));
  box(eng, 0.6, 0.1, 0.4, mats.chassis, [1.35, 0.3, 0]); // sump
  cyl(eng, 0.1, 0.1, 0.05, mats.metal, 'x', [1.8, 0.5, 0]); // pulley

  const gear = part('gearbox', [0.9, 0, 0], win('power', 0.2, 0.8), OUT(0.14, 0.48));
  cyl(gear, 0.13, 0.2, 0.7, mats.engine, 'x', [0.55, 0.45, 0]); // wider at the engine end

  const shaft = part('driveshaft', [-0.7, 0, 0], win('power', 0.22, 0.82), OUT(0.16, 0.5));
  shaftSpin = new THREE.Group();
  shaftSpin.position.set(-0.55, 0.42, 0);
  shaft.add(shaftSpin);
  cyl(shaftSpin, 0.04, 0.04, 1.5, mats.metal, 'x', [0, 0, 0]);
  [0.75, -0.75].forEach((x) => {
    box(shaftSpin, 0.06, 0.16, 0.06, mats.dark, [x, 0, 0]);
    box(shaftSpin, 0.06, 0.06, 0.16, mats.dark, [x, 0, 0]);
  });

  const diff = part('differential', [-1.5, 0, 0], win('power', 0.26, 0.86), OUT(0.18, 0.52));
  cyl(diff, 0.2, 0.2, 0.36, mats.engine, 'z', [-1.4, 0.36, 0]);
  cyl(diff, 0.04, 0.04, 1.4, mats.metal, 'z', [-1.4, 0.36, 0], { edges: false });

  const exhaust = part('exhaust', [-1.9, 0, 0], win('power', 0.2, 0.85), OUT(0.2, 0.54));
  both((s) => {
    cyl(exhaust, 0.035, 0.035, 2.73, mats.metal, 'x', [-0.965, 0.27, 0.28 * s], { edges: false });
    cyl(exhaust, 0.12, 0.12, 0.7, mats.engine, 'x', [-1.75, 0.3, 0.28 * s]);
    cyl(exhaust, 0.05, 0.05, 0.12, mats.metal, 'x', [-2.33, 0.28, 0.28 * s]);
  });

  // largest slide per axis, for the readout
  const max = { x: 0, y: 0, z: 0 };
  parts.forEach(({ dir }) => {
    max.x = Math.max(max.x, Math.abs(dir.x));
    max.y = Math.max(max.y, Math.abs(dir.y));
    max.z = Math.max(max.z, Math.abs(dir.z));
  });

  return { car, parts, spinners, shaftSpin, mats, max };
}
