import * as THREE from './vendor/three/three.module.min.js';
import { BODY_DEFS, ARENA } from './ringout-data.mjs';

// Original procedural toy meshes, surface maps and scenery. Only the portrait is a photo.
const FACE_FIT = Object.freeze({
  tomato: Object.freeze({ x: 0, y: .87, z: .65, width: .435, height: .445, tilt: -.19 }),
  'sweet-potato': Object.freeze({ x: -.025, y: .99, z: .56, width: .365, height: .485, tilt: -.18 }),
});
function random(seed) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}
function surfaceCanvas(kind, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const c = canvas.getContext('2d'), pixels = c.createImageData(size, size), rnd = random(kind === 'wood' ? 151 : kind === 'potato' ? 393 : 57);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = rnd() - .5, i = (y * size + x) * 4, broad = Math.sin(x * .047 + Math.sin(y * .032) * 2) * Math.cos(y * .061);
    let r, g, b;
    if (kind === 'tomato') {
      const speck = noise * 13 + broad * 4; r = 228 + speck; g = 44 + speck * .65; b = 27 + speck * .42;
    } else if (kind === 'potato') {
      const speck = noise * 23 + broad * 11; r = 134 + speck; g = 69 + speck * .53; b = 80 + speck * .78;
    } else if (kind === 'wood') {
      const bend = Math.sin(y / size * Math.PI * 4) * 9 + Math.sin(y * .033) * 2;
      const grain = Math.sin((x + bend) * .51) * 7 + Math.sin((x + bend) * .097) * 9, seam = x % (size / 4) < 2 ? -19 : 0;
      r = 195 + grain + noise * 10 + seam; g = 141 + grain * .83 + noise * 9 + seam; b = 86 + grain * .67 + noise * 7 + seam;
    } else if (kind === 'leaf') {
      r = 73 + noise * 18 + broad * 9; g = 111 + noise * 18 + broad * 10; b = 36 + noise * 13;
    } else {
      const speck = noise * 15 + broad * 2; r = 185 + speck; g = 216 + speck; b = 198 + speck;
    }
    pixels.data[i] = r; pixels.data[i + 1] = g; pixels.data[i + 2] = b; pixels.data[i + 3] = 255;
  }
  c.putImageData(pixels, 0, 0);
  if (kind === 'potato') {
    for (let i = 0; i < 190; i++) {
      const x = rnd() * size, y = rnd() * size, length = 1.5 + rnd() * 6;
      c.strokeStyle = i % 3 ? '#d3a56f70' : '#552f4560'; c.lineWidth = .7 + rnd();
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + length * .4, y - 1.5, x + length, y + .8); c.stroke();
    }
  }
  return canvas;
}
function leafGeometry() {
  const vertices = [], uv = [], indices = [], rows = 10, cols = 4;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const t = row / rows, across = col / cols * 2 - 1, width = Math.pow(Math.sin(Math.PI * t), .7);
    vertices.push(across * width, Math.sin(Math.PI * t) * .36 - Math.abs(across) * width * .12, t); uv.push(col / cols, t);
    if (row < rows && col < cols) {
      const a = row * (cols + 1) + col, b = a + cols + 1; indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export class RingoutRenderer {
  constructor(canvas, onLost) {
    this.canvas = canvas; this.resources = new Set(); this.actors = []; this.textures = new Set(); this.templates = new Map(); this.preview = true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.16;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0xe7c9a4); this.scene.fog = new THREE.Fog(0xe7c9a4, 20, 43);
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 80);
    this.scene.add(new THREE.HemisphereLight(0xfff5de, 0x79735f, 2.3));
    this.sun = new THREE.DirectionalLight(0xffd9a7, 3.5);
    this.sun.position.set(-5, 9, 4); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, far: 26 });
    this.sun.shadow.bias = -.0007; this.sun.shadow.normalBias = .022; this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xf5f5e2, .8); fill.position.set(5, 4, -5); this.scene.add(fill);
    this.sphere = this.keep(new THREE.SphereGeometry(1, 40, 28)); this.circle = this.keep(new THREE.CircleGeometry(1, 64)); this.leafShape = this.keep(leafGeometry());
    this.bezelGeometry = this.keep(new THREE.TorusGeometry(1, .047, 12, 64)); this.innerLipGeometry = this.keep(new THREE.TorusGeometry(1, .03, 10, 64));
    this.ringGeometry = this.keep(new THREE.RingGeometry(.75, .778, 48));
    const tomatoMap = this.map('tomato'), potatoMap = this.map('potato'), leafMap = this.map('leaf');
    this.red = this.material(0xffffff, .35, { map: tomatoMap, bumpMap: tomatoMap, bumpScale: .012 });
    this.rootMat = this.material(0xffffff, .77, { map: potatoMap, bumpMap: potatoMap, bumpScale: .025 });
    this.green = this.material(0xffffff, .62, { map: leafMap, side: THREE.DoubleSide });
    this.vein = this.material(0x78983b, .65); this.darkRed = this.material(0x8c211c, .7); this.darkRoot = this.material(0x593441, .8);
    this.makeTable(); this.makeKitchen(); this.makeContactMap();
    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, .065, 0), 2, 0xfff9d9, .45, .3);
    this.arrow.visible = false; this.scene.add(this.arrow);
    this.ray = new THREE.Raycaster(); this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    this.lostHandler = event => { event.preventDefault(); onLost(); }; canvas.addEventListener('webglcontextlost', this.lostHandler); this.resize();
  }
  keep(resource) { this.resources.add(resource); return resource; }
  material(color, roughness = .65, options = {}) { return this.keep(new THREE.MeshStandardMaterial({ color, roughness, ...options })); }
  map(kind) {
    const texture = this.keep(new THREE.CanvasTexture(surfaceCanvas(kind, kind === 'wood' ? 512 : 256)));
    texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy()); return texture;
  }
  mesh(geometry, material) {
    this.keep(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }
  ball(parent, material, position, scale) {
    const mesh = this.mesh(this.sphere, material); mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  }
  tube(parent, points, radius, material, segments = 14) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const mesh = this.mesh(new THREE.TubeGeometry(curve, segments, radius, 7, false), material); parent.add(mesh); return mesh;
  }
  leaf(parent, position, scale, angle = 0, material = this.green) {
    const mesh = this.mesh(this.leafShape, material); mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.y = angle; parent.add(mesh); return mesh;
  }
  box(parent, material, position, size) {
    const mesh = this.mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position); parent.add(mesh); return mesh;
  }
  makeTable() {
    const mint = this.map('mint'); this.plateMaterial = this.material(0xffffff, .66, { map: mint, bumpMap: mint, bumpScale: .012 });
    this.platform = this.mesh(new THREE.CylinderGeometry(ARENA.radius, ARENA.radius, .3, 96), this.plateMaterial); this.platform.position.y = -.16; this.scene.add(this.platform);
    const rim = this.mesh(new THREE.TorusGeometry(ARENA.radius - .025, .024, 8, 96), this.material(0xc4e0c8, .5));
    rim.rotation.x = -Math.PI / 2; rim.position.y = -.008; this.scene.add(rim);
    for (const x of [-2.6, 2.6]) for (const z of [-2.1, 2.1]) {
      const foot = this.mesh(new THREE.CylinderGeometry(.28, .33, .43, 20), this.plateMaterial); foot.position.set(x, -.51, z); this.scene.add(foot);
    }
    const wood = this.map('wood'); wood.repeat.set(4, 4); wood.rotation = .12;
    const floor = this.mesh(new THREE.PlaneGeometry(50, 50), this.material(0xffffff, .75, { map: wood, bumpMap: wood, bumpScale: .018 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.74; floor.castShadow = false; this.scene.add(floor);
  }
  makeKitchen() {
    const ceramic = this.material(0xf2e6ce, .48), frame = this.material(0xd0a779, .7), wall = this.material(0xe8ca9f, .92);
    this.box(this.scene, wall, [0, 4, -12], [40, 12, .2]);
    const pane = this.material(0xe3ecd9, .95, { emissive: 0xc5c5a8, emissiveIntensity: .25 });
    this.box(this.scene, pane, [-2.8, 3.2, -11.8], [7, 5, .08]);
    for (const x of [-6.4, -2.8, .8]) this.box(this.scene, frame, [x, 3.2, -11.67], [.13, 5.25, .2]);
    for (const y of [.55, 3.2, 5.85]) this.box(this.scene, frame, [-2.8, y, -11.67], [7.3, .12, .2]);
    this.box(this.scene, ceramic, [-2.8, .5, -11.25], [7.7, .2, 1]);
    const pot = this.mesh(new THREE.CylinderGeometry(.65, .48, 1.15, 28), ceramic); pot.position.set(-5.8, -.17, -5.1); this.scene.add(pot);
    const soil = this.mesh(new THREE.CircleGeometry(.57, 24), this.material(0x61523b)); soil.rotation.x = -Math.PI / 2; soil.position.set(-5.8, .415, -5.1); this.scene.add(soil);
    const plant = new THREE.Group(); plant.position.set(-5.8, .4, -5.1); this.scene.add(plant);
    const plantGreen = this.material(0x6e8c42, .85, { side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4, height = .6 + i % 3 * .35, x = Math.sin(angle) * .45, z = Math.cos(angle) * .4;
      this.tube(plant, [[0, 0, 0], [x * .6, height * .7, z * .6], [x, height, z]], .028, this.green, 8);
      const leaf = this.leaf(plant, [x, height, z], [.31, .6, .95], angle, plantGreen); leaf.rotation.x = -.7 + i % 3 * .2;
    }
    const mug = this.mesh(new THREE.CylinderGeometry(.69, .6, 1.35, 32), ceramic); mug.position.set(5.6, -.04, -5.8); this.scene.add(mug);
    const drink = this.mesh(new THREE.CircleGeometry(.59, 32), this.material(0x816348)); drink.rotation.x = -Math.PI / 2; drink.position.set(5.6, .64, -5.8); this.scene.add(drink);
    const mugRim = this.mesh(new THREE.TorusGeometry(.65, .054, 10, 32), ceramic); mugRim.rotation.x = -Math.PI / 2; mugRim.position.set(5.6, .65, -5.8); this.scene.add(mugRim);
    const handle = this.mesh(new THREE.TorusGeometry(.45, .105, 10, 28), ceramic); handle.position.set(6.32, -.02, -5.8); this.scene.add(handle);
    const mark = this.leaf(this.scene, [5.6, -.32, -5.13], [.19, .07, .56], 0, plantGreen); mark.rotation.x = -Math.PI / 2;
  }
  makeContactMap() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const c = canvas.getContext('2d');
    const gradient = c.createRadialGradient(64, 64, 8, 64, 64, 62);
    gradient.addColorStop(0, '#25362bed'); gradient.addColorStop(.45, '#25362b70'); gradient.addColorStop(1, '#25362b00');
    c.fillStyle = gradient; c.fillRect(0, 0, 128, 128);
    this.contactMap = this.keep(new THREE.CanvasTexture(canvas)); this.contactGeometry = this.keep(new THREE.PlaneGeometry(2, 2));
  }
  makeTomato() {
    const toy = new THREE.Group(), shape = this.sphere.clone(), p = shape.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), angle = Math.atan2(z, x), lobe = 1 + Math.cos(angle * 6) * .033 * (1 - Math.abs(y));
      p.setXYZ(i, x * .72 * lobe, .83 + y * .68 - (y > .65 ? (y - .65) * .08 : 0), z * .62 * lobe);
    }
    shape.computeVertexNormals(); toy.add(this.mesh(shape, this.red));
    for (let i = 0; i < 6; i++) {
      const leaf = this.leaf(toy, [0, 1.47, 0], [.165, .22, .52], i * Math.PI / 3 + .3); leaf.rotation.x = -.1;
    }
    this.ball(toy, this.green, [0, 1.47, 0], [.15, .07, .15]);
    this.tube(toy, [[0, 1.47, 0], [.01, 1.66, -.035], [.12, 1.83, -.04]], .073, this.green);
    this.ball(toy, this.vein, [.12, 1.83, -.04], [.069, .035, .069]);
    for (const s of [-1, 1]) {
      this.tube(toy, [[s * .58, .83, .04], [s * .78, .70, .15], [s * .95, .84, .19]], .07, this.green);
      this.ball(toy, this.red, [s * .97, .91, .2], [.23, .215, .215]);
      for (let n = 0; n < 4; n++) this.leaf(toy, [s * .97, 1.105, .2], [.055, .06, .16], n * Math.PI / 2);
      this.tube(toy, [[s * .97, 1.1, .2], [s * .94, 1.17, .19]], .022, this.green, 4);
      this.tube(toy, [[s * .28, .25, .01], [s * .3, .13, .09]], .066, this.green, 5);
      this.ball(toy, this.red, [s * .31, .13, .16], [.18, .13, .235]);
    }
    return toy;
  }
  makePotato() {
    const toy = new THREE.Group(), shape = this.sphere.clone(), p = shape.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), tapered = 1 - y * .24;
      p.setXYZ(i, x * .58 * tapered + .21 * y + .15 * y * y - .045, .98 + y * .87, z * .50 * (1 - y * .15));
    }
    shape.computeVertexNormals(); toy.add(this.mesh(shape, this.rootMat));
    this.tube(toy, [[.30, 1.78, 0], [.41, 1.88, -.02], [.44, 1.94, .02]], .036, this.rootMat, 8);
    for (const s of [-1, 1]) {
      this.tube(toy, [[s * .46, .92, .02], [s * .71, .87, .09], [s * .83, 1.06, .13]], .052, this.rootMat);
      this.tube(toy, [[s * .81, 1.03, .13], [s * .93, 1.22, .12], [s * .91, 1.32, .16]], .027, this.rootMat, 9);
      this.tube(toy, [[s * .85, 1.12, .13], [s * 1.01, 1.18, .11], [s * 1.05, 1.27, .15]], .025, this.rootMat, 8);
      this.tube(toy, [[s * .80, 1.04, .13], [s * .69, 1.17, .15], [s * .69, 1.25, .18]], .024, this.rootMat, 8);
      const leaf = this.leaf(toy, [s * .66, .91, .18], [.115, .17, .31], s * .8); leaf.rotation.x = 1.5;
      const otherLeaf = this.leaf(toy, [s * .64, .90, .16], [.11, .15, .27], -s * .55); otherLeaf.rotation.x = 1.2;
      this.tube(toy, [[s * .25, .29, .015], [s * .3, .13, .09]], .075, this.rootMat, 6);
      this.ball(toy, this.rootMat, [s * .3, .135, .17], [.17, .13, .23]);
    }
    return toy;
  }
  makeBody(bodyId) { return bodyId === 'sweet-potato' ? this.makePotato() : this.makeTomato(); }
  makeActor(bodyId, image, index) {
    const group = new THREE.Group();
    if (!this.templates.has(bodyId)) this.templates.set(bodyId, this.makeBody(bodyId));
    const toy = this.templates.get(bodyId).clone(); group.add(toy);
    const potato = bodyId === 'sweet-potato', fit = FACE_FIT[bodyId] || FACE_FIT.tomato, skin = potato ? this.rootMat : this.red, dark = potato ? this.darkRoot : this.darkRed;
    const face = new THREE.Group(); face.position.set(fit.x, fit.y, fit.z); face.rotation.x = fit.tilt; toy.add(face);
    // Layered produce-colored lip: photo stays ahead of the body and behind the lip.
    const back = this.mesh(this.circle, dark); back.scale.set(fit.width * 1.015, fit.height * 1.015, 1); back.position.z = -.012; back.castShadow = false; face.add(back);
    const bezel = this.mesh(this.bezelGeometry, skin); bezel.scale.set(fit.width * 1.05, fit.height * 1.05, .50); bezel.position.z = .013; face.add(bezel);
    const inner = this.mesh(this.innerLipGeometry, dark); inner.scale.set(fit.width, fit.height, .35); inner.position.z = .004; face.add(inner);
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2; this.textures.add(texture);
    const portraitMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: true, side: THREE.FrontSide, toneMapped: false });
    const portrait = new THREE.Mesh(this.circle, portraitMaterial); portrait.scale.set(fit.width * .984, fit.height * .984, 1); portrait.position.z = .009; face.add(portrait);
    const ringMat = new THREE.MeshBasicMaterial({ color: index ? 0xb97442 : 0x2c7965, transparent: true, opacity: .6, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeometry, ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = .015; group.add(ring);
    const contactMat = new THREE.MeshBasicMaterial({ map: this.contactMap, transparent: true, opacity: .48, depthWrite: false });
    const contact = new THREE.Mesh(this.contactGeometry, contactMat); contact.rotation.x = -Math.PI / 2; contact.position.y = .012; contact.scale.set(.86, .69, 1); group.add(contact);
    this.scene.add(group);
    return { group, toy, bodyId, face, portrait, texture, portraitMaterial, ring, ringMat, contact, contactMat, image };
  }
  clearActors() {
    for (const actor of this.actors) {
      this.scene.remove(actor.group); actor.texture.dispose(); this.textures.delete(actor.texture);
      actor.portraitMaterial.dispose(); actor.ringMat.dispose(); actor.contactMat.dispose();
    }
    this.actors = [];
  }
  setActors(specs) {
    if (specs.length === this.actors.length && specs.every((spec, i) => spec.bodyId === this.actors[i].bodyId)) {
      specs.forEach((spec, i) => { if (spec.face !== this.actors[i].image) this.setFace(i, spec.face); }); return;
    }
    this.clearActors(); this.actors = specs.map((spec, i) => this.makeActor(spec.bodyId, spec.face, i));
  }
  setFace(index, image) {
    const actor = this.actors[index]; if (!actor) return;
    actor.texture.image = image; actor.texture.needsUpdate = true; actor.image = image;
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height); this.updateCamera();
  }
  updateCamera() {
    if (this.preview) {
      // Selection gets a closer toy portrait. Play always includes the full legal edge.
      this.camera.position.set(0, 4.7, 8.5); this.camera.lookAt(0, .72, 0);
      this.camera.fov = Math.max(37, 2 * Math.atan(3.1 / (9.4 * this.camera.aspect)) * 180 / Math.PI);
    } else {
      this.camera.position.set(0, 9.4, 11); this.camera.lookAt(0, .16, 0); this.camera.updateMatrixWorld();
      let tangent = 0;
      for (let i = 0; i < 64; i++) {
        const angle = i * Math.PI / 32;
        const point = new THREE.Vector3(Math.sin(angle) * ARENA.radius, 0, Math.cos(angle) * ARENA.radius).applyMatrix4(this.camera.matrixWorldInverse);
        tangent = Math.max(tangent, Math.abs(point.y / point.z), Math.abs(point.x / (point.z * this.camera.aspect)));
      }
      this.camera.fov = Math.max(36, Math.atan(tangent * 1.16) * 360 / Math.PI);
    }
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  groundPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3()); return hit ? { x: hit.x, z: hit.z } : null;
  }
  actorScreen(index) {
    const rect = this.canvas.getBoundingClientRect(), actor = this.actors[index]; if (!actor) return null;
    const point = new THREE.Vector3(actor.group.position.x, .65, actor.group.position.z).project(this.camera);
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  }
  aim(actor, dx, dz, power) {
    this.arrow.visible = !!actor && power > 0; if (!this.arrow.visible) return;
    this.arrow.position.set(actor.x, .065, actor.z); this.arrow.setDirection(new THREE.Vector3(dx, 0, dz).normalize());
    this.arrow.setLength(.6 + 2.3 * power, .38, .27); this.arrow.setColor(power > .8 ? 0xf5b548 : 0xfff9d9);
  }
  render(actors, time = 0, { reduced = false, winner = null, preview = false, cosmetic = false, entrance = 1, aiming = false } = {}) {
    if (this.preview !== preview) { this.preview = preview; this.updateCamera(); }
    this.platform.material.color.set(cosmetic ? 0xf8e7bd : 0xffffff);
    this.actors.forEach((actor, i) => {
      const p = actors[i] || { x: i ? 1.4 : -1.4, z: 0 }, speed = Math.hypot(p.vx || 0, p.vz || 0), fall = p.out ? (p.fallTime || 0) : 0;
      actor.group.position.set(p.x, p.out ? -5 * fall * fall : 0, p.z);
      actor.toy.rotation.z = p.out ? fall * (i ? -2 : 2) : reduced ? 0 : Math.sin(time * 18) * Math.min(.14, speed * .03) + (preview ? Math.sin(time * 1.7 + i) * .012 : 0);
      actor.toy.rotation.x = p.out ? fall * .8 : aiming && i === 0 && !reduced ? -.045 : 0;
      actor.toy.position.y = reduced || p.out ? 0 : Math.sin(time * 3 + i) * .022 + (winner === i ? Math.abs(Math.sin(time * 6)) * .2 : 0);
      const anticipate = aiming && i === 0 && !reduced ? .975 : 1; actor.toy.scale.set(1 / Math.sqrt(anticipate), anticipate, 1 / Math.sqrt(anticipate));
      actor.group.scale.setScalar((preview ? 1.3 : 1) * (BODY_DEFS[actor.bodyId]?.visualScale || 1) * (reduced ? 1 : Math.min(1, .05 + entrance * 1.6)));
      actor.ring.visible = !p.out && !preview; actor.contact.visible = !p.out; actor.contactMat.opacity = preview ? .5 : .42;
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.clearActors(); this.observer.disconnect(); this.canvas.removeEventListener('webglcontextlost', this.lostHandler);
    this.arrow.dispose(); this.sun.shadow.dispose();
    this.resources.forEach(resource => resource.dispose()); this.resources.clear(); this.templates.clear(); this.renderer.dispose();
  }
}

export async function demoPortrait() {
  const image = new Image(); image.src = new URL('./art/tomato-subject.webp', import.meta.url).href; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d'); c.beginPath(); c.arc(256, 256, 255, 0, Math.PI * 2); c.clip();
  // 1279×1214 complete cutout: measured face window, not the full character.
  c.drawImage(image, 436, 350, 435, 435, 0, 0, 512, 512); return canvas;
}
