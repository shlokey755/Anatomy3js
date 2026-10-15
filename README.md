# Anatomy of a Car

A scroll-driven 3D teardown of a car, built with Vite and Three.js. Scroll takes the car apart one axis at a time, then puts it back together while it pitches, rolls and yaws.

| Chapter | Scroll | What moves |
|---|---|---|
| Body | 12–32% | parts slide along Y (up) |
| Wheels | 32–50% | parts slide along Z (sideways) |
| Powertrain | 50–68% | parts slide along X (front to back) |
| Assembly | 68–90% | parts return, car turns about X, Y and Z |

The camera also flies along a path through all three axes. The readout (bottom left) shows each part group's slide on X/Y/Z, the car's turn in degrees, and the camera position. A reference section below the story explains the three axes, the systems, the four strokes and a short glossary.

Every part is generated from code. There are no model files.

## Run

```bash
npm install
npm run dev      # local dev server
npm run build    # single-file build in dist/index.html
```

Needs Node 20.19+ or 22.12+.

## Files

- `src/main.js` page wiring, camera path (`KEYS`), cards, readout
- `src/model.js` the car, built from primitives and extrusions
- `src/timeline.js` chapter windows and easing helpers
- `src/style.css` styling, light and dark themes
