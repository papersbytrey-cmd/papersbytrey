// papersbytrey promo renderer: 3D exam hall + 2D overlays, rendered frame-by-frame.
import * as THREE from './node_modules/three/build/three.module.js';

const W = 1080, H = 1920;
const YELLOW = '#FFC531', NAVY = '#0F1B2D';

// ---------- canvases ----------
const out = document.createElement('canvas');
out.width = W; out.height = H;
document.body.appendChild(out);
const ctx = out.getContext('2d');
const prevBuf = document.createElement('canvas');
prevBuf.width = W; prevBuf.height = H;
const pctx = prevBuf.getContext('2d');
const clean = document.createElement('canvas'); // last 3D frame without overlays
clean.width = W; clean.height = H;
const cctx = clean.getContext('2d');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 200);

// deterministic random
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rand() * a.length)];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

// ---------- hall ----------
const HALL = { w: 40, d: 64 };
const floorTex = canvasTex(2048, 2048, (g, w, h) => {
  g.fillStyle = '#b48a5c'; g.fillRect(0, 0, w, h);
  const plankW = 26;
  for (let x = 0; x < w; x += plankW) {
    for (let y = -rand() * 300; y < h; y += 220 + rand() * 260) {
      const l = 150 + rand() * 260;
      const v = Math.floor(rand() * 26) - 13;
      g.fillStyle = `rgb(${180 + v},${138 + v},${92 + v})`;
      g.fillRect(x, y, plankW - 1, l);
    }
    g.fillStyle = 'rgba(70,45,20,0.25)'; g.fillRect(x + plankW - 1, 0, 1, h);
  }
  // court markings (hall 40 x 64 -> 2048 px; 51.2 px per m)
  const m = w / HALL.w;
  g.lineWidth = 0.09 * m;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.strokeRect(3 * m, 6 * m, 34 * m, 52 * m);
  g.beginPath(); g.moveTo(3 * m, 32 * m); g.lineTo(37 * m, 32 * m); g.stroke();
  g.beginPath(); g.arc(20 * m, 32 * m, 3.6 * m, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(200,40,40,0.9)';
  g.strokeRect(5 * m, 9 * m, 30 * m, 46 * m);
  g.strokeStyle = 'rgba(40,90,200,0.85)';
  g.beginPath(); g.moveTo(1.5 * m, 20 * m); g.lineTo(38.5 * m, 20 * m); g.stroke();
  g.beginPath(); g.moveTo(1.5 * m, 44 * m); g.lineTo(38.5 * m, 44 * m); g.stroke();
});
floorTex.wrapS = floorTex.wrapT = THREE.ClampToEdgeWrapping;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), std(0xffffff, { map: floorTex, roughness: 0.55 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallTex = canvasTex(1024, 512, (g, w, h) => {
  g.fillStyle = '#dfe3e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6f8aa6'; g.fillRect(0, h * 0.78, w, h * 0.22);
  g.fillStyle = '#2b3f57'; g.fillRect(0, h * 0.76, w, h * 0.02);
  for (let y = 0; y < h * 0.76; y += 18) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(0, y, w, 1); }
});
const wallMat = std(0xffffff, { map: wallTex });
const wallH = 10;
function wall(w, x, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
  m.position.set(x, wallH / 2, z); m.rotation.y = ry; scene.add(m);
}
wall(HALL.w, 0, -HALL.d / 2, 0);
wall(HALL.w, 0, HALL.d / 2, Math.PI);
wall(HALL.d, -HALL.w / 2, 0, Math.PI / 2);
wall(HALL.d, HALL.w / 2, 0, -Math.PI / 2);
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), std(0x3a3f47));
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = wallH; scene.add(ceiling);

// high windows
const winMat = new THREE.MeshBasicMaterial({ color: 0xcfe6ff });
const windows = new THREE.Group();
for (let i = 0; i < 12; i++) {
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), winMat);
    m.position.set(side * (HALL.w / 2 - 0.02), 8.1, -27 + i * 4.9);
    m.rotation.y = -side * Math.PI / 2; windows.add(m);
  }
}
scene.add(windows);

// ceiling light panels
const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.08, 0.5), panelMat, 6 * 12);
{
  let k = 0; const mm = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) for (let j = 0; j < 12; j++) {
    mm.makeTranslation(-15 + i * 6, wallH - 0.05, -27 + j * 5); panels.setMatrixAt(k++, mm);
  }
}
scene.add(panels);

// clock on front wall
const clock = new THREE.Group();
const clockFace = canvasTex(512, 512, (g, w) => {
  g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, 7); g.fill();
  g.lineWidth = 22; g.strokeStyle = '#151515'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 14, 0, 7); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, r1 = w / 2 - 34, r2 = r1 - (i % 5 ? 12 : 30);
    g.lineWidth = i % 5 ? 4 : 10; g.strokeStyle = '#151515';
    g.beginPath(); g.moveTo(w / 2 + Math.sin(a) * r1, w / 2 - Math.cos(a) * r1);
    g.lineTo(w / 2 + Math.sin(a) * r2, w / 2 - Math.cos(a) * r2); g.stroke();
  }
  g.fillStyle = '#151515'; g.font = '700 44px Montserrat'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = i / 12 * Math.PI * 2, r = w / 2 - 98;
    g.fillText(String(i), w / 2 + Math.sin(a) * r, w / 2 - Math.cos(a) * r);
  }
});
const face = new THREE.Mesh(new THREE.CircleGeometry(1.3, 64), new THREE.MeshBasicMaterial({ map: clockFace }));
clock.add(face);
const handMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.02), handMat);
const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.02), handMat);
const secHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.0, 0.02), new THREE.MeshBasicMaterial({ color: 0xd0242b }));
for (const [hnd, len, zz] of [[hourHand, 0.62, 0.02], [minHand, 0.95, 0.03], [secHand, 1.0, 0.04]]) {
  hnd.geometry.translate(0, len / 2 - 0.08, 0);
  hnd.position.z = zz; clock.add(hnd);
}
clock.position.set(0, 6.2, -HALL.d / 2 + 0.03);
scene.add(clock);
function setClock(totalSec) {
  const h = totalSec / 3600, m = (totalSec / 60) % 60, s = totalSec % 60;
  hourHand.rotation.z = -(h % 12) / 12 * Math.PI * 2;
  minHand.rotation.z = -m / 60 * Math.PI * 2;
  secHand.rotation.z = -Math.floor(s) / 60 * Math.PI * 2;
}

// ---------- desks, chairs, students ----------
const COLS = 8, ROWS = 11;
const deskPos = [];
for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) deskPos.push([-8.75 + i * 2.5, -14 + j * 2.6]);
const HERO = 7 * COLS + 4;      // x=1.25, z=4.2
const NEIGHBOUR = 7 * COLS + 5; // x=3.75, z=4.2
const N = deskPos.length;
const deskTopY = 0.76;

function inst(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  scene.add(m); return m;
}
const deskTops = inst(new THREE.BoxGeometry(1.1, 0.04, 0.7), std(0xc9a57c, { roughness: 0.6 }), N);
const legGeo = new THREE.CylinderGeometry(0.018, 0.018, deskTopY, 6);
const deskLegs = inst(legGeo, std(0x8a9096, { metalness: 0.4, roughness: 0.4 }), N * 4);
const chairSeats = inst(new THREE.BoxGeometry(0.44, 0.04, 0.42), std(0x2f68d0, { roughness: 0.5 }), N);
const chairBacks = inst(new THREE.BoxGeometry(0.44, 0.3, 0.03), std(0x2f68d0, { roughness: 0.5 }), N);
const chairLegs = inst(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 5), std(0x5a6066, { metalness: 0.4 }), N * 4);
const papers = inst(new THREE.PlaneGeometry(0.3, 0.42), std(0xf7f7f2, { roughness: 0.9 }), N);
const shadowTex = canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const shadows = inst(new THREE.PlaneGeometry(1.7, 1.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), N);

const torsoGeo = new THREE.CapsuleGeometry(0.17, 0.32, 4, 10);
const torsos = inst(torsoGeo, std(0xffffff), N);
const heads = inst(new THREE.SphereGeometry(0.115, 16, 12), std(0xffffff, { roughness: 0.6 }), N);
const hairs = inst(new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), std(0xffffff, { roughness: 0.9 }), N);
const arms = inst(new THREE.CapsuleGeometry(0.05, 0.36, 3, 6), std(0xffffff), N * 2);

const blazers = [0x1b2440, 0x1b2440, 0x23262b, 0x5a1f2b, 0x1f3b2a, 0xf2f2f2];
const skins = [0xf1c7a5, 0xe0ac86, 0xc68a62, 0x8d5a3b, 0x5e3a26, 0xf6d3b8];
const hairCols = [0x1a1410, 0x3b2516, 0x6b4426, 0xb88b4a, 0x111111, 0x2a1d14];
const studentPhase = [];
const tmp = new THREE.Object3D();
const col = new THREE.Color();
for (let k = 0; k < N; k++) {
  const [x, z] = deskPos[k];
  const ry = (rand() - 0.5) * 0.04;
  tmp.position.set(x, deskTopY - 0.02, z); tmp.rotation.set(0, ry, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
  deskTops.setMatrixAt(k, tmp.matrix);
  let l = 0;
  for (const [dx, dz] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) {
    tmp.position.set(x + dx, deskTopY / 2, z + dz); tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
    deskLegs.setMatrixAt(k * 4 + l++, tmp.matrix);
  }
  const cz = z + 0.62;
  tmp.position.set(x, 0.46, cz); tmp.updateMatrix(); chairSeats.setMatrixAt(k, tmp.matrix);
  tmp.position.set(x, 0.72, cz + 0.2); tmp.rotation.set(-0.12, 0, 0); tmp.updateMatrix(); chairBacks.setMatrixAt(k, tmp.matrix);
  l = 0;
  for (const [dx, dz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    tmp.position.set(x + dx, 0.23, cz + dz); tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
    chairLegs.setMatrixAt(k * 4 + l++, tmp.matrix);
  }
  tmp.position.set(x + (rand() - 0.5) * 0.15, deskTopY + 0.002, z + (rand() - 0.5) * 0.08);
  tmp.rotation.set(-Math.PI / 2, 0, (rand() - 0.5) * 0.5); tmp.updateMatrix(); papers.setMatrixAt(k, tmp.matrix);
  tmp.position.set(x, 0.005, z + 0.3); tmp.rotation.set(-Math.PI / 2, 0, 0); tmp.updateMatrix(); shadows.setMatrixAt(k, tmp.matrix);

  torsos.setColorAt(k, col.setHex(pick(blazers)));
  heads.setColorAt(k, col.setHex(pick(skins)));
  hairs.setColorAt(k, col.setHex(pick(hairCols)));
  studentPhase.push(rand() * 10);
}
for (let k = 0; k < N; k++) {
  const c = new THREE.Color(); torsos.getColorAt(k, c);
  arms.setColorAt(k * 2, c); arms.setColorAt(k * 2 + 1, c);
}
let hiddenStudents = new Set();
let studentsVisible = true;
function updateStudents(t) {
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < N; k++) {
    if (!studentsVisible || hiddenStudents.has(k) || k === HERO) {
      torsos.setMatrixAt(k, zero); heads.setMatrixAt(k, zero); hairs.setMatrixAt(k, zero);
      arms.setMatrixAt(k * 2, zero); arms.setMatrixAt(k * 2 + 1, zero); continue;
    }
    const [x, z] = deskPos[k];
    const ph = studentPhase[k];
    const bob = Math.sin(t * 1.3 + ph) * 0.015;
    const lean = 0.32 + Math.sin(t * 0.7 + ph) * 0.04;
    const cz = z + 0.6;
    tmp.scale.set(1, 1, 1);
    tmp.position.set(x, 0.86, cz - 0.05); tmp.rotation.set(-lean, 0, 0); tmp.updateMatrix(); torsos.setMatrixAt(k, tmp.matrix);
    const hx = x + Math.sin(t * 0.5 + ph) * 0.02, hy = 1.22 + bob, hz = cz - 0.25;
    tmp.position.set(hx, hy, hz); tmp.rotation.set(-0.5, Math.sin(t * 0.4 + ph) * 0.15, 0); tmp.updateMatrix(); heads.setMatrixAt(k, tmp.matrix);
    tmp.position.set(hx, hy + 0.012, hz + 0.012); tmp.updateMatrix(); hairs.setMatrixAt(k, tmp.matrix);
    // arms resting forward to the desk, writing hand moves
    const wr = Math.sin(t * 6 + ph) * 0.03;
    tmp.position.set(x - 0.2, 0.92, cz - 0.38); tmp.rotation.set(-1.15, 0, 0.12); tmp.updateMatrix(); arms.setMatrixAt(k * 2, tmp.matrix);
    tmp.position.set(x + 0.2 + wr, 0.92, cz - 0.38); tmp.rotation.set(-1.15, 0, -0.12); tmp.updateMatrix(); arms.setMatrixAt(k * 2 + 1, tmp.matrix);
  }
  for (const m of [torsos, heads, hairs, arms]) m.instanceMatrix.needsUpdate = true;
}
// hide hero chair paper (hero paper is its own mesh)
{
  const z = new THREE.Matrix4().makeScale(0, 0, 0);
  papers.setMatrixAt(HERO, z);
}

// ---------- invigilator ----------
const invig = new THREE.Group();
const trousers = std(0x2a2d33), cardigan = std(0x6b2737), skin = std(0xe8b896), grey = std(0x9a9a9a);
const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 3, 8), trousers);
const legR = legL.clone();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.42, 4, 10), cardigan);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), grey);
const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.55, 3, 8), cardigan);
const armR = armL.clone();
for (const p of [legL, legR]) p.geometry.translate(0, -0.42, 0);
legL.position.set(-0.1, 0.9, 0); legR.position.set(0.1, 0.9, 0);
armL.geometry.translate(0, -0.3, 0);
armL.position.set(-0.29, 1.46, 0); armR.position.set(0.29, 1.46, 0);
body.position.y = 1.24; head.position.y = 1.7; hair.position.set(0, 1.72, 0.01);
invig.add(legL, legR, body, head, hair, armL, armR);
invig.visible = false;
scene.add(invig);
function poseInvig(t, z) {
  const sw = Math.sin(t * 5.5) * 0.35;
  legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * 0.6; armR.rotation.x = sw * 0.6;
  invig.position.set(0, Math.abs(Math.cos(t * 5.5)) * 0.03, z);
  invig.rotation.y = Math.PI; // walking towards -z, back to camera
}

// ---------- hero desk props ----------
const [HX, HZ] = deskPos[HERO];
const [NX, NZ] = deskPos[NEIGHBOUR];
const props = {};

function drawPage(g, w, h, opts) {
  g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#111'; g.textBaseline = 'top';
  if (opts.cover) {
    g.fillStyle = '#111'; g.fillRect(40, 40, w - 80, 10);
    g.font = '800 64px Montserrat'; g.fillText('GCSE', 50, 90);
    g.font = '700 46px Montserrat'; g.fillText(opts.subject || 'MATHEMATICS', 50, 170);
    g.font = '600 34px Montserrat'; g.fillText(opts.paper || 'Paper 1 · Higher Tier', 50, 235);
    g.fillText('June 2026', 50, 282);
    g.strokeStyle = '#111'; g.lineWidth = 3;
    g.strokeRect(50, 360, w - 100, 120);
    g.font = '500 26px Montserrat'; g.fillText('Candidate number', 66, 376);
    for (let i = 0; i < 4; i++) g.strokeRect(66 + i * 70, 418, 56, 48);
    g.font = '500 25px Montserrat';
    const lines = ['Time allowed: 1 hour 30 minutes', 'Answer all questions.', 'Do not turn over until told to', 'do so.'];
    lines.forEach((l, i) => g.fillText(l, 50, 540 + i * 40));
    g.fillRect(40, h - 50, w - 80, 10);
    return;
  }
  g.font = '800 40px Montserrat'; g.fillText(opts.qnum || '14', 46, 46);
  g.font = '500 28px Montserrat';
  let y = 50;
  for (const para of opts.lines || []) {
    const words = para.split(' '); let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (g.measureText(test).width > w - 150) { g.fillText(line, 110, y); y += 40; line = wd; } else line = test;
    }
    g.fillText(line, 110, y); y += 58;
  }
  g.strokeStyle = '#bbb'; g.lineWidth = 2;
  g.setLineDash([3, 8]);
  for (let yy = y + 30; yy < h - 140; yy += 56) { g.beginPath(); g.moveTo(110, yy); g.lineTo(w - 50, yy); g.stroke(); }
  g.setLineDash([]);
  g.font = '700 28px Montserrat'; g.fillText('(4 marks)', w - 190, h - 90);
}

function makeHeroPaper(frontOpts) {
  const grp = new THREE.Group();
  const pw = 0.3, ph = 0.42;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), std(0xffffff, { map: canvasTex(600, 840, (g, w, h) => drawPage(g, w, h, frontOpts)) }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), std(0xffffff, { map: canvasTex(600, 840, (g, w, h) => drawPage(g, w, h, { cover: true, ...frontOpts })) }));
  // pivot on the left edge: page lies flat; flip angle rotates around z axis through left edge
  front.position.x = pw / 2; back.position.x = pw / 2;
  front.rotation.x = -Math.PI / 2; back.rotation.x = -Math.PI / 2;
  const inner = new THREE.Group(); inner.add(front, back);
  // back is seen first (face up = cover), front is underneath facing down
  front.rotation.y = Math.PI; front.position.y = -0.001;
  grp.add(inner);
  grp.position.set(HX + 0.15, deskTopY + 0.004, HZ + 0.02);
  grp.userData.inner = inner;
  scene.add(grp);
  return grp;
}
function setFlip(grp, f) {
  // f: 0 = cover up, 1 = question up. Rotate around the left edge (local z axis).
  const e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  const inner = grp.userData.inner;
  inner.rotation.z = e * Math.PI;
  inner.position.y = Math.sin(e * Math.PI) * 0.02;
}

function makeStationery(x, z) {
  const g = new THREE.Group();
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8), std(0x111111, { roughness: 0.3 }));
  pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; pen.position.set(-0.3, 0.008, 0.18);
  const caseM = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0xdfefff, transparent: true, opacity: 0.45, roughness: 0.1 }));
  caseM.position.set(-0.36, 0.02, -0.24); caseM.rotation.y = 0.15;
  const calc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.15), std(0x2b2f36, { roughness: 0.4 }));
  calc.position.set(-0.42, 0.006, 0.02); calc.rotation.y = -0.2;
  g.add(pen, caseM, calc);
  g.position.set(x, deskTopY, z);
  scene.add(g); return g;
}

function makeNotesStack(x, z) { // student who only re-reads notes
  const g = new THREE.Group();
  const cols = [0xfff27a, 0xffb3d1, 0xa8f0c6, 0x9fd3ff, 0xffffff];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.006, 0.36), std(pick(cols)));
    s.position.set((rand() - 0.5) * 0.06 - 0.1, 0.004 + i * 0.007, (rand() - 0.5) * 0.06); s.rotation.y = (rand() - 0.5) * 0.4; g.add(s);
  }
  for (const [c, dx] of [[0xffe600, 0], [0xff4fa3, 0.04], [0x44e07a, 0.08]]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 8), std(c, { roughness: 0.4 }));
    h.rotation.z = Math.PI / 2; h.rotation.y = 0.3; h.position.set(0.25 + dx * 0.3, 0.012, 0.05 + dx); g.add(h);
  }
  g.position.set(x, deskTopY, z); scene.add(g); return g;
}
function makePaperStack(x, z) { // student who does past papers
  const g = new THREE.Group();
  const pageTex = canvasTex(600, 840, (c, w, h) => drawPage(c, w, h, { cover: true }));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.42), [std(0xf4f4ef), std(0xf4f4ef), std(0xffffff, { map: pageTex }), std(0xf4f4ef), std(0xf4f4ef), std(0xf4f4ef)]);
    s.position.set(-0.12 + (rand() - 0.5) * 0.02, 0.004 + i * 0.009, (rand() - 0.5) * 0.02); s.rotation.y = (rand() - 0.5) * 0.12; g.add(s);
  }
  const timer = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.07), [std(0x222222), std(0x222222), std(0x222222), std(0x222222), std(0x222222), new THREE.MeshBasicMaterial({
    map: canvasTex(200, 100, (c, w, h) => { c.fillStyle = '#0b0f0c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3b3b'; c.font = '800 64px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('89:59', w / 2, h / 2 + 4); })
  })]);
  timer.position.set(0.28, 0.025, -0.2); timer.rotation.x = -0.0; timer.rotation.y = -0.3;
  g.add(timer);
  g.position.set(x, deskTopY, z); scene.add(g); return g;
}
function makeEnvelope(x, z, grade) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.01, 0.23), std(0xf3efe6));
  env.position.y = 0.005; g.add(env);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), std(0xe9e3d6, { side: THREE.DoubleSide }));
  flap.rotation.x = -Math.PI / 2; flap.position.set(0, 0.011, -0.06);
  g.add(flap);
  const slipTex = canvasTex(400, 560, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#111'; c.font = '700 30px Montserrat'; c.fillText('RESULTS', 30, 60);
    c.fillStyle = '#ccc'; c.fillRect(30, 80, w - 60, 3);
    c.fillStyle = '#111'; c.font = '600 28px Montserrat'; c.fillText('Mathematics', 30, 150);
    c.font = '900 220px Montserrat'; c.textAlign = 'center'; c.fillStyle = grade >= 7 ? '#0a8f3c' : '#c22d2d';
    c.fillText(String(grade), w / 2, 420);
  });
  const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.31), std(0xffffff, { map: slipTex }));
  slip.rotation.x = -Math.PI / 2; slip.position.y = 0.013;
  g.add(slip);
  g.userData.slip = slip;
  g.position.set(x, deskTopY, z); scene.add(g); return g;
}
function setEnvelope(g, f) {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, f)), 3);
  g.userData.slip.position.z = -e * 0.3;
  g.userData.slip.position.y = 0.013 + e * 0.004;
}
function makeLamp(x, z) {
  const g = new THREE.Group();
  const baseM = std(0x1d1f24, { metalness: 0.5, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 20), baseM); base.position.y = 0.01;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), baseM); arm.position.set(0, 0.21, 0.04); arm.rotation.x = 0.25;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 24, 1, true), std(0x1d1f24, { side: THREE.DoubleSide, metalness: 0.5 }));
  shade.position.set(0, 0.42, -0.05); shade.rotation.x = 0.9;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
  bulb.position.set(0, 0.39, -0.08);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 20), std(0xf2f2f2));
  mug.position.set(-0.4, 0.045, 0.1);
  g.add(base, arm, shade, bulb, mug);
  g.position.set(x + 0.42, deskTopY, z - 0.2); scene.add(g); return g;
}
function makeBoard() {
  const g = new THREE.Group();
  const cork = canvasTex(1024, 768, (c, w, h) => {
    c.fillStyle = '#b07d4a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${60 + rand() * 60},${30 + rand() * 30},10,${0.15 + rand() * 0.2})`; c.fillRect(rand() * w, rand() * h, 2, 2); }
    c.strokeStyle = '#5a3a1c'; c.lineWidth = 24; c.strokeRect(0, 0, w, h);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.1), std(0xffffff, { map: cork }));
  g.add(board);
  const years = ['2019', '2022', '2023', '2024', '2025', '2026'];
  const spots = [[-1.45, 0.85], [0.0, 0.95], [1.45, 0.8], [-1.35, -0.75], [0.1, -0.8], [1.45, -0.7]];
  const pins = [];
  spots.forEach(([x, y], i) => {
    const latest = years[i] === '2026';
    const tex = canvasTex(420, 560, (c, w, h) => {
      c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.font = '800 46px Montserrat'; c.fillText('June ' + years[i], 26, 64);
      c.fillStyle = '#999';
      for (let yy = 110; yy < h - 30; yy += 30) c.fillRect(26, yy, 120 + rand() * (w - 180), 8);
      c.strokeStyle = '#e0242b'; c.lineWidth = 8;
      c.beginPath(); c.ellipse(w / 2, 300, 170, 60, -0.05, 0, 7); c.stroke();
      if (latest) { c.strokeStyle = YELLOW; c.lineWidth = 16; c.strokeRect(8, 8, w - 16, h - 16); }
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.27), std(0xffffff, { map: tex }));
    p.position.set(x, y, 0.01 + i * 0.001); p.rotation.z = (rand() - 0.5) * 0.12; g.add(p);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std(0xd42020, { roughness: 0.3 }));
    pin.position.set(x, y + 0.1, 0.06); g.add(pin); pins.push(pin.position);
  });
  const strMat = std(0xd01818, { roughness: 0.5 });
  const pairs = [[0, 1], [1, 2], [0, 4], [3, 4], [4, 5], [2, 5], [1, 4], [0, 5]];
  for (const [a, b] of pairs) {
    const A = pins[a], B = pins[b];
    const len = A.distanceTo(B);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 5), strMat);
    s.position.copy(A).add(B).multiplyScalar(0.5); s.position.z = 0.055;
    s.rotation.z = Math.atan2(B.y - A.y, B.x - A.x) - Math.PI / 2;
    g.add(s);
  }
  g.position.set(-8, 3.2, -HALL.d / 2 + 0.05);
  scene.add(g); return g;
}

// ---------- lighting ----------
const hemi = new THREE.HemisphereLight(0xf2f6ff, 0x8a7a66, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(6, 12, 8); scene.add(sun);
const amb = new THREE.AmbientLight(0xffffff, 0.25); scene.add(amb);
const spot = new THREE.SpotLight(0xffd59a, 0, 6, 0.75, 0.6, 1.2);
spot.position.set(HX + 0.4, deskTopY + 0.9, HZ - 0.4); spot.target.position.set(HX, deskTopY, HZ);
scene.add(spot, spot.target);
const boardSpot = new THREE.SpotLight(0xffc98a, 0, 14, 0.6, 0.5, 1.0);
boardSpot.position.set(-8, 0.6, -27.5); boardSpot.target.position.set(-8, 3.2, -32);
scene.add(boardSpot, boardSpot.target);

function setMode(mode) {
  const night = mode === 'night', dawn = mode === 'dawn';
  scene.background = new THREE.Color(night ? 0x05070c : dawn ? 0xe8d6b8 : 0xcfd6de);
  scene.fog = new THREE.Fog(night ? 0x05070c : dawn ? 0xe2c9a0 : 0xc9d0d8, night ? 4 : 22, night ? 16 : 75);
  hemi.intensity = night ? 0.04 : dawn ? 1.1 : 1.5;
  hemi.color.setHex(dawn ? 0xffe2b8 : 0xf2f6ff);
  sun.intensity = night ? 0.0 : dawn ? 2.0 : 1.3;
  sun.color.setHex(dawn ? 0xffc27a : 0xffffff);
  sun.position.set(dawn ? -18 : 6, dawn ? 5 : 12, dawn ? -4 : 8);
  amb.intensity = night ? 0.03 : 0.25;
  panelMat.color.setHex(night ? 0x111111 : 0xffffff);
  winMat.color.setHex(night ? 0x1b2a4a : dawn ? 0xffe0a8 : 0xcfe6ff);
  spot.intensity = night ? 9 : 0;
  boardSpot.intensity = night ? 60 : 0;
  studentsVisible = !(night || dawn);
  renderer.toneMappingExposure = night ? 1.25 : 1.05;
}

// ---------- camera shots ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (p) => p * p * (3 - 2 * p);
const lerpV = (a, b, p) => a.clone().lerp(b, p);
const SHOTS = {
  hallWide: (p) => ({ pos: lerpV(V(-2, 7.5, 26), V(-0.5, 5.2, 16), p), look: V(0, 0.8, -6), fov: 62 }),
  hallHigh: (p) => ({ pos: lerpV(V(-12, 9.2, 22), V(-8, 8.4, 15), p), look: V(0, 0, -2), fov: 62 }),
  aisle: (p) => ({ pos: lerpV(V(0, 1.55, 15), V(0, 1.45, 7.5), p), look: V(0.2, 1.0, -10), fov: 58 }),
  deskPOV: (p) => ({ pos: lerpV(V(HX, 1.5, HZ + 1.0), V(HX, 1.32, HZ + 0.8), p), look: V(HX, deskTopY, HZ - 0.05), fov: 52 }),
  deskTop: (p) => ({ pos: lerpV(V(HX + 0.02, 2.1, HZ + 0.06), V(HX, 1.55, HZ + 0.02), p), look: V(HX, deskTopY, HZ), fov: 48, up: V(0, 0, -1) }),
  orbit: (p) => {
    const a = 0.5 + p * 0.7, r = 2.3;
    return { pos: V(HX + Math.sin(a) * r, 1.7 - p * 0.2, HZ + Math.cos(a) * r), look: V(HX, deskTopY + 0.1, HZ), fov: 55 };
  },
  twoDesk: (p) => ({ pos: lerpV(V(NX + 2.6, 1.8, HZ + 1.3), V(NX + 2.0, 1.6, HZ + 1.0), p), look: V((HX + NX) / 2, deskTopY, HZ - 0.1), fov: 58 }),
  notesDesk: (p) => ({ pos: lerpV(V(HX - 0.5, 1.5, HZ + 1.0), V(HX - 0.2, 1.3, HZ + 0.75), p), look: V(HX, deskTopY, HZ), fov: 50 }),
  papersDesk: (p) => ({ pos: lerpV(V(NX + 0.5, 1.5, NZ + 1.0), V(NX + 0.2, 1.3, NZ + 0.75), p), look: V(NX, deskTopY, NZ), fov: 50 }),
  envelope: (p) => ({ pos: lerpV(V(HX, 1.35, HZ + 0.6), V(HX, 1.12, HZ + 0.35), p), look: V(HX, deskTopY, HZ - 0.1), fov: 50 }),
  clock: (p) => ({ pos: lerpV(V(0.6, 5.0, -22), V(0.2, 5.8, -26.3), p), look: V(0, 6.1, -32), fov: 50 }),
  invig: (p, t) => ({ pos: V(0.5, 1.25, 9.2 - p * 6), look: V(-0.1, 1.5, 0 - p * 6), fov: 56 }),
  board: (p) => ({ pos: lerpV(V(-7.2, 3.0, -24.5), V(-7.8, 3.15, -26.8), p), look: V(-8, 3.2, -32), fov: 55 }),
  nightDesk: (p) => ({ pos: lerpV(V(HX - 0.9, 1.6, HZ + 1.6), V(HX - 0.3, 1.35, HZ + 0.9), p), look: V(HX + 0.05, deskTopY + 0.05, HZ - 0.1), fov: 50 }),
  emptyWide: (p) => ({ pos: lerpV(V(0, 2.2, 24), V(0, 2.0, 18), p), look: V(0, 1.4, -10), fov: 60 }),
};

// ---------- 2D overlay drawing ----------
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g, text, maxW) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}

// math: tokens are strings or {f:[num,den]}
function mathWidth(g, toks, size) {
  let w = 0;
  for (const tk of toks) {
    if (typeof tk === 'string') { g.font = `600 ${size}px Montserrat`; w += g.measureText(tk).width + size * 0.25; }
    else { g.font = `600 ${size * 0.82}px Montserrat`; w += Math.max(g.measureText(tk.f[0]).width, g.measureText(tk.f[1]).width) + size * 0.5; }
  }
  return w - size * 0.25;
}
function drawMath(g, toks, cx, cy, size, color) {
  let x = cx - mathWidth(g, toks, size) / 2;
  g.fillStyle = color; g.strokeStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left';
  for (const tk of toks) {
    if (typeof tk === 'string') {
      g.font = `600 ${size}px Montserrat`; g.fillText(tk, x, cy); x += g.measureText(tk).width + size * 0.25;
    } else {
      const s = size * 0.82; g.font = `600 ${s}px Montserrat`;
      const fw = Math.max(g.measureText(tk.f[0]).width, g.measureText(tk.f[1]).width) + size * 0.3;
      g.textAlign = 'center';
      g.fillText(tk.f[0], x + fw / 2, cy - s * 0.62); g.fillText(tk.f[1], x + fw / 2, cy + s * 0.68);
      g.lineWidth = Math.max(3, size * 0.06); g.beginPath(); g.moveTo(x, cy); g.lineTo(x + fw, cy); g.stroke();
      g.textAlign = 'left'; x += fw + size * 0.25;
    }
  }
}

function drawCard(card, age) {
  const a = Math.min(1, age / 0.25);
  const sc = 0.92 + 0.08 * (1 - Math.pow(1 - a, 3));
  const x = 60, y = 170, w = W - 120;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.translate(-W / 2, -y);
  // measure
  let h = 0; const pad = 48;
  let lines = [];
  if (card.type === 'text') {
    ctx.font = '600 40px Montserrat';
    lines = card.paras.map((p) => wrap(ctx, p, w - pad * 2));
    h = pad * 2 + lines.reduce((s, l) => s + l.length * 54 + 20, -20);
  } else if (card.type === 'math') {
    h = pad * 1.4 + card.rows.length * 135;
  } else if (card.type === 'list') {
    ctx.font = '700 40px Montserrat';
    lines = card.items.map((p) => wrap(ctx, p, w - pad * 2 - 70));
    h = pad * 2 + (card.title ? 70 : 0) + lines.reduce((s, l) => s + l.length * 52 + 30, -30);
  }
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff'; rr(ctx, x, y, w, h, 34); ctx.fill();
  ctx.shadowColor = 'transparent';
  if (card.type === 'text') {
    let yy = y + pad; ctx.textBaseline = 'top';
    lines.forEach((ls, i) => {
      const hl = card.highlight === i;
      ls.forEach((l) => {
        if (hl) { ctx.fillStyle = 'rgba(255,197,49,0.45)'; ctx.font = '700 40px Montserrat'; ctx.fillRect(x + pad - 8, yy - 4, ctx.measureText(l).width + 16, 52); }
        ctx.fillStyle = NAVY; ctx.font = (hl ? '700' : '600') + ' 40px Montserrat'; ctx.fillText(l, x + pad, yy); yy += 54;
      });
      yy += 20;
    });
  } else if (card.type === 'math') {
    card.rows.forEach((r, i) => {
      const active = i === card.rows.length - 1;
      const rowAge = card.rowAges ? card.rowAges[i] : 1;
      ctx.save(); ctx.globalAlpha = a * Math.min(1, rowAge / 0.25);
      drawMath(ctx, r, W / 2, y + pad * 0.7 + 67 + i * 135, 54, active ? '#1a7fd6' : '#8b94a3');
      ctx.restore();
    });
  } else if (card.type === 'list') {
    let yy = y + pad; ctx.textBaseline = 'top';
    if (card.title) { ctx.fillStyle = '#8b94a3'; ctx.font = '700 34px Montserrat'; ctx.fillText(card.title, x + pad, yy); yy += 70; }
    lines.forEach((ls, i) => {
      const vis = card.shown === undefined || i < card.shown;
      ctx.globalAlpha = a * (vis ? 1 : 0.0);
      ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.arc(x + pad + 20, yy + 26, 18, 0, 7); ctx.fill();
      ctx.fillStyle = NAVY; ctx.font = '800 26px Montserrat'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x + pad + 20, yy + 12); ctx.textAlign = 'left';
      ls.forEach((l) => { ctx.fillStyle = NAVY; ctx.font = '700 40px Montserrat'; ctx.fillText(l, x + pad + 70, yy); yy += 52; });
      yy += 30;
    });
  }
  ctx.restore();
}

function drawMascot(cx, cy, s, t, mood = 'happy', rot = 0) {
  // a little sheet-of-paper character with a folded yellow corner
  ctx.save();
  ctx.translate(cx, cy + Math.sin(t * 3) * 10 * s); ctx.rotate(rot + Math.sin(t * 1.7) * 0.06); ctx.scale(s, s);
  const w = 150, h = 190;
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(-w / 2 + 18, -h / 2); ctx.lineTo(w / 2 - 42, -h / 2); ctx.lineTo(w / 2, -h / 2 + 42);
  ctx.lineTo(w / 2, h / 2 - 18); ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - 18, h / 2);
  ctx.lineTo(-w / 2 + 18, h / 2); ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - 18);
  ctx.lineTo(-w / 2, -h / 2 + 18); ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + 18, -h / 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = YELLOW; ctx.beginPath(); ctx.moveTo(w / 2 - 42, -h / 2); ctx.lineTo(w / 2 - 42, -h / 2 + 34);
  ctx.quadraticCurveTo(w / 2 - 42, -h / 2 + 42, w / 2 - 34, -h / 2 + 42); ctx.lineTo(w / 2, -h / 2 + 42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dfe5ee';
  for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + 26, 38 + i * 20, w - 52 - (i === 2 ? 40 : 0), 7);
  // eyes
  const blink = (t % 3.7) < 0.12;
  ctx.fillStyle = NAVY;
  for (const ex of [-30, 30]) {
    ctx.beginPath();
    if (blink) ctx.ellipse(ex, -22, 17, 3, 0, 0, 7);
    else ctx.ellipse(ex, -22, mood === 'shock' ? 18 : 15, mood === 'shock' ? 24 : 21, 0, 0, 7);
    ctx.fill();
    if (!blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 5, -30, 5.5, 0, 7); ctx.fill(); ctx.fillStyle = NAVY; }
  }
  ctx.strokeStyle = NAVY; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'shock') { ctx.fillStyle = NAVY; ctx.ellipse(0, 14, 9, 12, 0, 0, 7); ctx.fill(); }
  else { ctx.arc(0, 4, 16, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  ctx.beginPath(); ctx.ellipse(-50, 6, 11, 7, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(50, 6, 11, 7, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function drawCaption(words, t) {
  // words: [{w,t0,t1}] for the current beat. Show a chunk of up to ~4 words.
  if (!words || !words.length) return;
  const chunks = []; let cur = [];
  for (const wd of words) {
    cur.push(wd);
    const len = cur.map((c) => c.w).join(' ').length;
    if (cur.length >= 4 || len > 18 || /[.,!?…:]$/.test(wd.w)) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  let chunk = null;
  for (const c of chunks) if (t >= c[0].t0 - 0.05) chunk = c;
  if (!chunk) return;
  const last = chunk[chunk.length - 1];
  if (t > last.t1 + 0.6) return;
  const size = 84;
  ctx.font = `900 ${size}px Montserrat`;
  ctx.textBaseline = 'middle';
  const texts = chunk.map((c) => c.w.toUpperCase());
  const lines = []; let line = [];
  for (let i = 0; i < texts.length; i++) {
    const test = [...line, i].map((k) => texts[k]).join(' ');
    if (ctx.measureText(test).width > W - 140 && line.length) { lines.push(line); line = [i]; } else line.push(i);
  }
  lines.push(line);
  const age = t - chunk[0].t0;
  const pop = age < 0.12 ? 0.85 + (age / 0.12) * 0.15 : 1;
  const baseY = 1330 - (lines.length - 1) * 52;
  lines.forEach((ln, li) => {
    const widths = ln.map((k) => ctx.measureText(texts[k]).width);
    const space = ctx.measureText(' ').width * 1.5;
    const total = widths.reduce((s, v) => s + v, 0) + space * (ln.length - 1);
    let x = W / 2 - total / 2 * pop;
    const y = baseY + li * 104;
    ln.forEach((k, j) => {
      const active = t >= chunk[k].t0 && t < chunk[k].t1 + 0.08;
      ctx.save();
      ctx.translate(x + widths[j] / 2 * pop, y); ctx.scale(pop * (active ? 1.06 : 1), pop * (active ? 1.06 : 1));
      ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = '#000';
      ctx.textAlign = 'center';
      ctx.strokeText(texts[k], 0, 0);
      ctx.fillStyle = active ? YELLOW : '#ffffff';
      ctx.fillText(texts[k], 0, 0);
      ctx.restore();
      x += (widths[j] + space) * pop;
    });
  });
}

function drawHook(text, t, until) {
  const a = Math.min(1, t / 0.2) * Math.min(1, Math.max(0, (until - t) / 0.3));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.font = '800 64px Montserrat'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, W - 160);
  lines.forEach((l, i) => {
    const y = 250 + i * 82;
    const tw = ctx.measureText(l).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(ctx, W / 2 - tw / 2 - 30, y - 44, tw + 60, 88, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(l, W / 2, y + 2);
  });
  ctx.restore();
}

function drawHandle() {
  ctx.save();
  ctx.font = '700 30px Montserrat'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
  ctx.fillText('@papersbytrey', W - 50, 100);
  ctx.restore();
}

function drawEnd(t, age, end) {
  const a = Math.min(1, age / 0.3);
  ctx.save(); ctx.globalAlpha = a;
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#f3f5f9');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  const s = 2.0 * (0.8 + 0.2 * Math.min(1, age / 0.35));
  drawMascot(W / 2, 640, s, t, 'happy');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 104px Montserrat';
  const p1 = 'papers', p2 = 'bytrey';
  const w1 = ctx.measureText(p1).width, w2 = ctx.measureText(p2).width;
  ctx.textAlign = 'left';
  ctx.fillStyle = NAVY; ctx.fillText(p1, W / 2 - (w1 + w2) / 2, 1000);
  ctx.fillStyle = '#f0a800'; ctx.fillText(p2, W / 2 - (w1 + w2) / 2 + w1, 1000);
  ctx.textAlign = 'center';
  ctx.font = '600 40px Montserrat'; ctx.fillStyle = '#5b6576';
  ctx.fillText(end.sub || 'The full 2026 past paper set', W / 2, 1090);
  // pill
  const pulse = 1 + Math.sin(t * 6) * 0.025;
  ctx.save(); ctx.translate(W / 2, 1250); ctx.scale(pulse, pulse);
  ctx.font = '800 58px Montserrat';
  const label = end.cta || 'Comment “2026”';
  const lw = ctx.measureText(label).width + 140;
  ctx.shadowColor = 'rgba(240,168,0,0.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  ctx.fillStyle = YELLOW; rr(ctx, -lw / 2, -62, lw, 124, 62); ctx.fill();
  ctx.shadowColor = 'transparent';
  // chat bubble icon
  ctx.fillStyle = NAVY; ctx.beginPath(); ctx.ellipse(-lw / 2 + 62, -4, 24, 20, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-lw / 2 + 48, 10); ctx.lineTo(-lw / 2 + 42, 28); ctx.lineTo(-lw / 2 + 62, 14); ctx.fill();
  ctx.fillStyle = NAVY; ctx.textAlign = 'left'; ctx.fillText(label, -lw / 2 + 102, 4);
  ctx.restore();
  ctx.font = '700 36px Montserrat'; ctx.fillStyle = NAVY; ctx.textAlign = 'center';
  ctx.fillText(end.handle || '@papersbytrey', W / 2, 1400);
  ctx.restore();
}

function vignette(strength) {
  const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}

// ---------- timeline driver ----------
let TL = null;
let heroPaper = null, stationery = null, notes = null, paperStack = null, envelope = null, lamp = null, board = null;
let lastShotKey = null, shotChangeT = -10;
const cardFirstSeen = {};

const photos = {};
function loadPhoto(name) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { photos[name] = im; res(); };
    im.onerror = () => rej(new Error('missing photo ' + name));
    im.src = `photos/${name}.jpg`;
  });
}
// Ken Burns move over a still photo: kb = {z:[from,to], x:[from,to], y:[from,to]} (focus point 0..1)
function drawPhoto(g, name, p, t, kb, since) {
  const im = photos[name];
  const lerp = (r, d) => (r ? r[0] + (r[1] - r[0]) * p : d);
  const z = lerp(kb.z, 1.08) * (1 + 0.035 * Math.pow(Math.max(0, 1 - since / 0.4), 2));
  const base = Math.max(W / im.width, H / im.height) * z;
  const dw = im.width * base, dh = im.height * base;
  const fx = lerp(kb.x, 0.5), fy = lerp(kb.y, 0.5);
  let x = W / 2 - fx * dw + Math.sin(t * 0.8) * 3, y = H / 2 - fy * dh + Math.sin(t * 1.1) * 3;
  x = Math.min(0, Math.max(W - dw, x)); y = Math.min(0, Math.max(H - dh, y));
  g.drawImage(im, x, y, dw, dh);
}

window.init = async (timeline) => {
  TL = timeline;
  await Promise.all((TL.photos || []).map(loadPhoto));
  heroPaper = makeHeroPaper(TL.paper || {});
  stationery = makeStationery(HX, HZ);
  notes = makeNotesStack(HX, HZ); notes.visible = false;
  paperStack = makePaperStack(NX, NZ); paperStack.visible = false;
  envelope = makeEnvelope(HX, HZ - 0.05, TL.grade || 8); envelope.visible = false;
  lamp = makeLamp(HX, HZ); lamp.visible = false;
  board = makeBoard(); board.visible = false;
  return true;
};

window.renderFrame = (t) => {
  const beats = TL.beats;
  let bi = beats.findIndex((b) => t >= b.start && t < b.end);
  if (bi < 0) bi = t < beats[0].start ? 0 : beats.length - 1;
  const b = beats[bi];
  // a shot can span several consecutive beats with the same shot key
  let s0 = bi, s1 = bi;
  while (s0 > 0 && beats[s0 - 1].shotKey === b.shotKey) s0--;
  while (s1 < beats.length - 1 && beats[s1 + 1].shotKey === b.shotKey) s1++;
  const shotStart = beats[s0].start, shotEnd = beats[s1].end;
  const p = Math.min(1, Math.max(0, (t - shotStart) / (shotEnd - shotStart)));

  if (b.shot === 'end') {
    // freeze last 3D frame underneath, draw end card on top
    if (lastShotKey !== b.shotKey) { pctx.drawImage(clean, 0, 0); lastShotKey = b.shotKey; shotChangeT = t; }
    ctx.drawImage(prevBuf, 0, 0);
    drawEnd(t, t - shotStart, TL.end || {});
    return out.toDataURL('image/jpeg', 0.92);
  }

  if (lastShotKey !== b.shotKey) { if (lastShotKey !== null) { pctx.drawImage(clean, 0, 0); shotChangeT = t; } lastShotKey = b.shotKey; }
  if (b.img) {
    drawPhoto(cctx, b.img, ease(p), t, b.kb || {}, t - shotStart);
  } else {
  setMode(b.mode || 'day');
  const st = b.state || {};
  hiddenStudents = new Set(st.hide || []);
  notes.visible = !!st.notes; paperStack.visible = !!st.papers;
  envelope.visible = !!st.envelope; lamp.visible = (b.mode === 'night') && !st.noLamp;
  board.visible = !!st.board;
  stationery.visible = !st.envelope && !st.notes;
  heroPaper.visible = !st.envelope && !st.notes && !st.noPaper;
  // paper flip: st.flip = [t0, t1] absolute times, or 'up'
  let f = 0;
  if (st.flip === 'up') f = 1;
  else if (Array.isArray(st.flip)) f = Math.min(1, Math.max(0, (t - st.flip[0]) / (st.flip[1] - st.flip[0])));
  setFlip(heroPaper, f);
  if (st.envelope) setEnvelope(envelope, Array.isArray(st.envelope) ? (t - st.envelope[0]) / (st.envelope[1] - st.envelope[0]) : 1);
  invig.visible = b.shot === 'invig';
  if (invig.visible) poseInvig(t, 5.5 - p * 6);
  setClock(9 * 3600 + 58 * 60 + 10 + t * (b.shot === 'clock' ? 12 : 1));
  updateStudents(t);

  const sh = SHOTS[b.shot](ease(p), t);
  camera.fov = sh.fov; camera.up.copy(sh.up || V(0, 1, 0));
  // subtle handheld drift
  const drift = V(Math.sin(t * 0.9) * 0.01, Math.sin(t * 1.3) * 0.008, 0);
  camera.position.copy(sh.pos).add(drift);
  camera.lookAt(sh.look);
  // punch-in on shot change
  const since = t - shotStart;
  if (since < 0.35) camera.fov *= 1 + 0.06 * Math.pow(1 - since / 0.35, 2);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  cctx.drawImage(renderer.domElement, 0, 0);
  }

  ctx.globalAlpha = 1;
  ctx.drawImage(clean, 0, 0);
  const fade = window.noFade ? 1 : (t - shotChangeT) / 0.1;
  if (fade < 1) { ctx.globalAlpha = 1 - fade; ctx.drawImage(prevBuf, 0, 0); ctx.globalAlpha = 1; }
  vignette(b.mode === 'night' ? 0.55 : 0.35);
  // overlays
  if (b.card) {
    const id = b.card.id;
    if (cardFirstSeen[id] === undefined) cardFirstSeen[id] = t;
    const c = { ...b.card };
    if (c.type === 'math') {
      // rows appear progressively; track per-row first-seen times
      c.rowAges = c.rows.map((_, i) => {
        const k = id + ':' + i;
        if (cardFirstSeen[k] === undefined) cardFirstSeen[k] = t;
        return t - cardFirstSeen[k];
      });
    }
    if (window.noFade && c.rowAges) c.rowAges = c.rowAges.map(() => 1);
    drawCard(c, window.noFade ? 1 : t - cardFirstSeen[id]);
  }
  if (b.mascot) {
    const m = b.mascot;
    const age = t - (m.t0 ?? b.start);
    const s = (m.s || 0.9) * Math.min(1, 0.6 + age / 0.25 * 0.4);
    drawMascot(m.x, m.y, s, t, m.mood || 'happy', m.rot || 0);
  }
  if (TL.hook && t < TL.hook.until) drawHook(TL.hook.text, t, TL.hook.until);
  drawCaption(b.words, t);
  drawHandle();
  return out.toDataURL('image/jpeg', 0.92);
};
window.ready = true;
