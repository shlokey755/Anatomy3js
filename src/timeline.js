// Scroll progress p runs 0 → 1 across the whole story. Each chapter owns a slice of it.
export const T = {
  hero: [0, 0.12],
  body: [0.12, 0.32], // parts slide along Y
  wheels: [0.32, 0.5], // parts slide along Z
  power: [0.5, 0.68], // parts slide along X
  assemble: [0.68, 0.9], // parts return, car rotates about X, Y and Z
  finale: [0.9, 1],
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// smoothstep between a and b
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ease-in-out cubic between a and b
export const ease = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// [start, end] in p, as fractions (a, b) of a chapter
export const win = (chapter, a, b) => [
  lerp(T[chapter][0], T[chapter][1], a),
  lerp(T[chapter][0], T[chapter][1], b),
];
