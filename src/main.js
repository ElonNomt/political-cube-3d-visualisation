import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* =====================================================================
   POLITICAL CUBE
   The cube runs from -1 to +1 on every axis. Where things sit:

     x (left  -> right)  Economics   Socialist (-1)     -> Capitalist (+1)
     y (down  -> up)     Governance  Anarchist (-1)     -> Authoritarian (+1)
     z (back  -> front)  Culture     Collectivist (-1)  -> Individualist (+1)

   The "Left Wing" corner is (-1, -1, +1): Socialist, Anarchist, Individualist.
   The "Right Wing" corner is (+1, +1, -1): Capitalist, Authoritarian, Collectivist.
   ===================================================================== */

// ---------- 1. Settings you can tweak ----------

const COLORS = {
  background: 0xeeeeee,
  gradientLeft: 0x6b74f0,    // blue end of the gradient
  gradientRight: 0xf06b6b,   // red end of the gradient
  wallSocialist: 0xf2afaf,   // pink wall (left side)
  wallCollectivist: 0xafaff2, // blue wall (back)
  wallAnarchist: 0xf2f2a0,   // yellow floor
};

const AXIS_OUT = 1.3;   // how far the black axis arrows sit outside the cube
const HOME_VIEW = { azimuth: 35, elevation: 20, distance: 13 };   // starting camera angle (degrees) and distance

// The three sliders. "low" is the -1 end, "high" is the +1 end.
const AXES = [
  { key: 'economics',  title: 'Economics',  low: 'Socialist',     high: 'Capitalist' },
  { key: 'governance', title: 'Governance', low: 'Anarchist',     high: 'Authoritarian' },
  { key: 'culture',    title: 'Culture',    low: 'Individualist', high: 'Collectivist' },
];

// ---------- 2. Build the page (the 3D stage and the control panel) ----------

const root =
  document.querySelector('#app') ??
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'app' }));

document.title = 'Political Cube';

const sliderHTML = ({ key, title, low, high }) => `
  <div class="slider">
    <label for="${key}">${title}</label>
    <input type="range" id="${key}" min="-100" max="100" step="1" value="0" />
    <div class="ends"><span>${low}</span><output id="out-${key}" for="${key}">Centre</output><span>${high}</span></div>
  </div>`;

root.innerHTML = `
  <div id="stage"></div>
  <aside id="panel">
    <h1>Political Cube</h1>
    <p class="hint">Drag to rotate. Scroll or pinch to zoom. Move the sliders to place your point inside the cube.</p>

    <h2>Your position</h2>
    ${AXES.map(sliderHTML).join('')}

    <div class="wing">
      <div class="wing-bar"><span id="wing-tick"></span></div>
      <div class="wing-ends"><span>Left Wing</span><span>Right Wing</span></div>
      <p id="wing-text"></p>
    </div>
    <button type="button" id="reset-point">Reset point</button>

    <h2>View</h2>
    <fieldset>
      <legend>Cube colouring</legend>
      <div class="choices">
        <label><input type="radio" name="fill" value="gradient" checked /> Gradient</label>
        <label><input type="radio" name="fill" value="walls" /> Coloured walls</label>
        <label><input type="radio" name="fill" value="none" /> None</label>
      </div>
    </fieldset>
    <label class="toggle"><input type="checkbox" id="opt-arrow" checked /> Left Wing to Right Wing arrow</label>
    <label class="toggle"><input type="checkbox" id="opt-grid" checked /> Grid lines</label>
    <label class="toggle"><input type="checkbox" id="opt-spin" /> Auto-rotate</label>
    <button type="button" id="reset-view">Reset view</button>

    <p class="credit">Concept from <a href="https://politicube.netlify.app/" target="_blank" rel="noopener">politicube.netlify.app</a>.</p>
  </aside>`;

const stage = root.querySelector('#stage');

// ---------- 3. Three.js basics: scene, camera, renderers, mouse controls ----------

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.background);

// A narrow field of view (30) makes the cube look like the flat, nearly parallel drawing in the original images.
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

// A second renderer draws the text labels as normal HTML on top of the 3D canvas.
const labelRenderer = new CSS2DRenderer();
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
stage.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 30;
controls.autoRotateSpeed = 1.2;

function resetView() {
  const az = THREE.MathUtils.degToRad(HOME_VIEW.azimuth);
  const el = THREE.MathUtils.degToRad(HOME_VIEW.elevation);
  camera.position.set(
    HOME_VIEW.distance * Math.cos(el) * Math.sin(az),
    HOME_VIEW.distance * Math.sin(el),
    HOME_VIEW.distance * Math.cos(el) * Math.cos(az)
  );
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);   // "false": the CSS decides the canvas size
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.zoom = Math.min(1, camera.aspect / 1.15);   // zoom out a bit on tall (phone) screens
  camera.updateProjectionMatrix();
}

// ---------- 4. Small helpers ----------

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Show or hide a group AND everything inside it (including the HTML labels).
function setVisible(object, on) {
  object.traverse((child) => { child.visible = on; });
}

// A double-headed arrow between two points.
function makeArrow(from, to, { color, headLength, headRadius, shaftRadius, overlay = false }) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  dir.normalize();

  const material = new THREE.MeshBasicMaterial({ color, transparent: overlay, depthTest: !overlay });
  const up = v3(0, 1, 0);                                        // cylinders and cones point "up" by default
  const forward = new THREE.Quaternion().setFromUnitVectors(up, dir);
  const backward = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().negate());

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, length - 2 * headLength, 12), material);
  shaft.quaternion.copy(forward);
  shaft.position.copy(from).addScaledVector(dir, length / 2);

  const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 20);
  const headEnd = new THREE.Mesh(headGeometry, material);
  headEnd.quaternion.copy(forward);
  headEnd.position.copy(to).addScaledVector(dir, -headLength / 2);

  const headStart = new THREE.Mesh(headGeometry, material);
  headStart.quaternion.copy(backward);
  headStart.position.copy(from).addScaledVector(dir, headLength / 2);

  group.add(shaft, headEnd, headStart);
  if (overlay) group.traverse((child) => { child.renderOrder = 10; });   // draw on top of the cube colours
  return { group, material };
}

// Where a label's text sits relative to its point: [x, y] where 0 = left/bottom and 1 = right/top.
const ANCHORS = {
  left: [1, 0.5],
  right: [0, 0.5],
  below: [0.5, 1],
  above: [0.5, 0],
  middle: [0.5, 0.5],
  'below-right': [0, 1],
};

function makeLabel(title, subtitle, position, anchor = 'middle', extraClass = '') {
  const el = document.createElement('div');
  el.className = `label ${anchor} ${extraClass}`.trim();

  const t = document.createElement('div');
  t.className = 't';
  t.textContent = title;
  el.appendChild(t);

  if (subtitle) {
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = subtitle;
    el.appendChild(s);
  }

  const label = new CSS2DObject(el);
  label.center.set(...ANCHORS[anchor]);
  label.position.copy(position);
  return label;
}

// ---------- 5. The cube itself ----------

// 5a. Thin outline of the cube
scene.add(
  new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
    new THREE.LineBasicMaterial({ color: 0x8a8a8a })
  )
);

// 5b. Grid lines: three squares through the middle of the cube, which split every face into four
const grid = new THREE.Group();
const gridMaterial = new THREE.LineBasicMaterial({ color: 0xa4a4a4 });
const squares = [
  [v3(-1, -1, 0), v3(1, -1, 0), v3(1, 1, 0), v3(-1, 1, 0)],   // slices front/back
  [v3(0, -1, -1), v3(0, -1, 1), v3(0, 1, 1), v3(0, 1, -1)],   // slices left/right
  [v3(-1, 0, -1), v3(1, 0, -1), v3(1, 0, 1), v3(-1, 0, 1)],   // slices top/bottom
];
for (const corners of squares) {
  grid.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), gridMaterial));
}
scene.add(grid);

// 5c. The black cross through the centre (one line per axis)
scene.add(
  new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      v3(-1, 0, 0), v3(1, 0, 0),
      v3(0, -1, 0), v3(0, 1, 0),
      v3(0, 0, -1), v3(0, 0, 1),
    ]),
    new THREE.LineBasicMaterial({ color: 0x111111 })
  )
);

// 5d. Gradient fill: each corner gets a colour based on how far it is along the Left Wing -> Right Wing diagonal
const gradientGeometry = new THREE.BoxGeometry(2, 2, 2);
{
  const positions = gradientGeometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const left = new THREE.Color(COLORS.gradientLeft);
  const right = new THREE.Color(COLORS.gradientRight);
  const mix = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const t = ((x + y - z) / 3 + 1) / 2;   // 0 at the Left Wing corner, 1 at the Right Wing corner
    mix.copy(left).lerp(right, t);
    colors.set([mix.r, mix.g, mix.b], i * 3);
  }
  gradientGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
const gradientFill = new THREE.Mesh(
  gradientGeometry,
  new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
);
scene.add(gradientFill);

// 5e. Coloured walls: the left wall, back wall and floor
const walls = new THREE.Group();
function addWall(color, position, rotation) {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
  );
  wall.position.set(...position);
  wall.rotation.set(...rotation);
  walls.add(wall);
}
addWall(COLORS.wallSocialist, [-1, 0, 0], [0, Math.PI / 2, 0]);        // left wall  (Socialist side)
addWall(COLORS.wallCollectivist, [0, 0, -1], [0, 0, 0]);               // back wall  (Collectivist side)
addWall(COLORS.wallAnarchist, [0, -1, 0], [-Math.PI / 2, 0, 0]);       // floor      (Anarchist side)
scene.add(walls);

// ---------- 6. Axis arrows and labels ----------

const axisArrow = { color: 0x111111, headLength: 0.2, headRadius: 0.06, shaftRadius: 0.014 };
scene.add(
  makeArrow(v3(-1, -AXIS_OUT, 1), v3(1, -AXIS_OUT, 1), axisArrow).group,            // Economics
  makeArrow(v3(AXIS_OUT, -AXIS_OUT, 1), v3(AXIS_OUT, -AXIS_OUT, -1), axisArrow).group, // Culture
  makeArrow(v3(-AXIS_OUT, -1, 1), v3(-AXIS_OUT, 1, 1), axisArrow).group              // Governance
);

const addLabel = (...args) => scene.add(makeLabel(...args));

// Economics (along the bottom front edge)
addLabel('Socialist', '(Planned Economy)', v3(-0.6, -AXIS_OUT, 1), 'below');
addLabel('Capitalist', '(Free Market)', v3(0.6, -AXIS_OUT, 1), 'below');
addLabel('Economics', null, v3(0, -AXIS_OUT, 1), 'middle', 'axis-name');

// Culture (along the bottom right edge, front to back)
addLabel('Individualist', '(Nonconformity)', v3(AXIS_OUT, -AXIS_OUT, 1), 'below-right');
addLabel('Collectivist', '(Conformity)', v3(AXIS_OUT, -AXIS_OUT, -1), 'right');
addLabel('Culture', null, v3(AXIS_OUT, -AXIS_OUT, 0), 'middle', 'axis-name');

// Governance (up the front left edge)
addLabel('Authoritarian', '(Centralized)', v3(-AXIS_OUT, 0.8, 1), 'left');
addLabel('Anarchist', '(Decentralized)', v3(-AXIS_OUT, -0.8, 1), 'left');
addLabel('Governance', null, v3(-AXIS_OUT, 0, 1), 'middle', 'axis-name');

// The big diagonal arrow from the Left Wing corner to the Right Wing corner
const LEFT_CORNER = v3(-1, -1, 1);
const RIGHT_CORNER = v3(1, 1, -1);
const wingArrow = makeArrow(LEFT_CORNER, RIGHT_CORNER, {
  color: 0xffffff, headLength: 0.32, headRadius: 0.1, shaftRadius: 0.028, overlay: true,
});
const pointAlong = (t) => new THREE.Vector3().lerpVectors(LEFT_CORNER, RIGHT_CORNER, t);
wingArrow.group.add(
  makeLabel('Left Wing', '(Cooperative)', pointAlong(0.2), 'above', 'wing'),
  makeLabel('Right Wing', '(Competitive)', pointAlong(0.8), 'above', 'wing')
);
scene.add(wingArrow.group);

// ---------- 7. Your point inside the cube ----------

// state: where you are on each axis, from -1 to +1
const state = { economics: 0, governance: 0, culture: 0 };

// "target" is where the point should be, "current" is where it is drawn (it glides toward the target)
const target = new THREE.Vector3(0, 0, 0);
const current = new THREE.Vector3(0, 0, 0);
const EASE = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.2;

const marker = new THREE.Group();
const dotOutline = new THREE.Mesh(
  new THREE.SphereGeometry(0.105, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide, transparent: true, depthTest: false })
);
const dot = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false })
);
dotOutline.renderOrder = 20;
dot.renderOrder = 21;
marker.add(dotOutline, dot, makeLabel('You', null, v3(0, 0, 0), 'right', 'you'));
scene.add(marker);

// Thin lines from your point to the three walls, so you can read off where you are in 3D
const drops = [
  { color: 0xd45d5d, foot: (p) => v3(-1, p.y, p.z) },   // to the left wall  (Socialist)
  { color: 0x5560d8, foot: (p) => v3(p.x, p.y, -1) },   // to the back wall  (Collectivist)
  { color: 0xb8a800, foot: (p) => v3(p.x, -1, p.z) },   // to the floor      (Anarchist)
].map(({ color, foot }) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false }));
  line.frustumCulled = false;   // its points move, so don't let Three.js cull it
  line.renderOrder = 15;
  const end = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false })
  );
  end.renderOrder = 15;
  scene.add(line, end);
  return { line, end, foot };
});

function applyMarker() {
  marker.position.copy(current);
  for (const { line, end, foot } of drops) {
    const p = foot(current);
    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, current.x, current.y, current.z);
    positions.setXYZ(1, p.x, p.y, p.z);
    positions.needsUpdate = true;
    end.position.copy(p);
  }
}

// ---------- 8. Wire up the controls ----------

const $ = (selector) => root.querySelector(selector);

function describe(value, low, high) {
  const percent = Math.round(Math.abs(value) * 100);
  if (percent === 0) return 'Centre';
  return `${percent}% ${value < 0 ? low : high}`;
}

function updateFromState() {
  // Culture is drawn along the depth axis, with Individualist toward you (+z) and Collectivist at the back (-z).
  target.set(state.economics, state.governance, -state.culture);

  for (const { key, low, high } of AXES) {
    $(`#out-${key}`).textContent = describe(state[key], low, high);
  }

  // 0 = Left Wing corner, 1 = Right Wing corner (the average of the three axes)
  const towardRight = ((state.economics + state.governance + state.culture) / 3 + 1) / 2;
  $('#wing-tick').style.left = `${towardRight * 100}%`;
  $('#wing-text').textContent =
    `${Math.round(towardRight * 100)}% of the way from Left Wing (Cooperative) to Right Wing (Competitive).`;
}

for (const { key } of AXES) {
  $(`#${key}`).addEventListener('input', (event) => {
    state[key] = Number(event.target.value) / 100;
    updateFromState();
  });
}

$('#reset-point').addEventListener('click', () => {
  for (const { key } of AXES) {
    state[key] = 0;
    $(`#${key}`).value = 0;
  }
  updateFromState();
});

function applyFill(mode) {
  gradientFill.visible = mode === 'gradient';
  setVisible(walls, mode === 'walls');
  stage.classList.toggle('gradient-on', mode === 'gradient');
  wingArrow.material.color.set(mode === 'gradient' ? 0xffffff : 0x333333);   // white arrow only reads well on the gradient
}

root.querySelectorAll('input[name="fill"]').forEach((radio) => {
  radio.addEventListener('change', () => applyFill(radio.value));
});
$('#opt-arrow').addEventListener('change', (event) => setVisible(wingArrow.group, event.target.checked));
$('#opt-grid').addEventListener('change', (event) => setVisible(grid, event.target.checked));
$('#opt-spin').addEventListener('change', (event) => { controls.autoRotate = event.target.checked; });
$('#reset-view').addEventListener('click', resetView);

// ---------- 9. Start ----------

new ResizeObserver(resize).observe(stage);
resize();
resetView();
applyFill('gradient');
updateFromState();
current.copy(target);
applyMarker();

function animate() {
  requestAnimationFrame(animate);

  if (!current.equals(target)) {
    if (current.distanceToSquared(target) < 1e-6) current.copy(target);
    else current.lerp(target, EASE);
    applyMarker();
  }

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();