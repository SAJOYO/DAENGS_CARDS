import { createProfileStore, createIndexedDBStorage } from '../ringout-profile.mjs';
import { CropEditor, decodePhoto } from '../ringout-photo.mjs';

const output = document.querySelector('#results');
const report = { status: 'RUNNING', fixtureKind: 'synthetic functional fixtures only; not dog-visual coverage', tests: [], measurements: {} };
const testDatabaseName = `daengs-ringout-functional-${crypto.randomUUID()}`;
const connections = new Set();
const editors = new Set();
const decodedImages = new Set();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const defer = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve }; };
const canvas = (width = 512, height = 512) => Object.assign(document.createElement('canvas'), { width, height });
const encode = (image, type = 'image/png', quality = .95) => new Promise((resolve, reject) => image.toBlob(blob => blob ? resolve(blob) : reject(new Error(`Could not encode ${type}`)), type, quality));
const decode = async blob => { const image = await decodePhoto(blob); decodedImages.add(image); return image; };
const editor = options => { const value = new CropEditor(canvas(), options); editors.add(value); return value; };
const display = () => { output.textContent = JSON.stringify(report, null, 2); };

async function test(name, run) {
  try {
    const detail = await run();
    report.tests.push({ name, status: 'PASS', ...(detail === undefined ? {} : { detail }) });
  } catch (error) {
    report.tests.push({ name, status: 'FAIL', error: String(error?.message ?? error) });
  }
  display();
}

async function transparentPng() {
  const source = canvas();
  const context = source.getContext('2d');
  context.fillStyle = 'rgba(255,64,32,0.6)';
  context.fillRect(128, 128, 256, 256);
  return encode(source);
}

function pixels(image) {
  const target = canvas(image.width, image.height);
  const context = target.getContext('2d');
  context.drawImage(image.image, 0, 0);
  return (x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
}

async function exifJpeg() {
  const source = canvas(80, 40);
  const context = source.getContext('2d');
  context.fillStyle = '#ff0000'; context.fillRect(0, 0, 40, 40);
  context.fillStyle = '#0000ff'; context.fillRect(40, 0, 40, 40);
  const original = new Uint8Array(await (await encode(source, 'image/jpeg', 1)).arrayBuffer());
  assert(original[0] === 0xff && original[1] === 0xd8, 'Browser did not encode a JPEG');
  // EXIF little-endian TIFF: orientation tag 0x0112, SHORT, value 6 (90° clockwise).
  const app1 = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([original.slice(0, 2), app1, original.slice(2)], { type: 'image/jpeg' });
}

function checkOrientation(image) {
  assert(image.width === 40 && image.height === 80, `EXIF dimensions were ${image.width}×${image.height}, expected 40×80`);
  const read = pixels(image);
  const top = read(20, 15), bottom = read(20, 65);
  assert(top[0] > 220 && top[2] < 35, `Rotated top was not red: ${top}`);
  assert(bottom[2] > 220 && bottom[0] < 35, `Rotated bottom was not blue: ${bottom}`);
  return { width: image.width, height: image.height, top, bottom };
}

const storage = createIndexedDBStorage({
  open(_originalName, version) {
    const request = indexedDB.open(testDatabaseName, version);
    request.addEventListener('success', () => connections.add(request.result));
    return request;
  },
});

await test('Actual PNG crop preserves source alpha and transparent circular corners', async () => {
  const fixture = await transparentPng();
  const crop = editor();
  await crop.setFile(fixture);
  crop.setZoom(.5);
  const portrait = await crop.encode();
  const result = await decode(portrait);
  const read = pixels(result);
  assert(portrait.type === 'image/png', 'Portrait did not encode PNG');
  assert(result.width === 512 && result.height === 512, 'Portrait dimensions differ from 512×512');
  assert(read(0, 0)[3] === 0, 'Circular corner lost transparency');
  assert(read(170, 256)[3] === 0, 'Source transparent pixels became opaque');
  assert(Math.abs(read(256, 256)[3] - 153) <= 1, 'Partial source alpha was not preserved');
  report.measurements.syntheticPngSourceBytes = fixture.size;
  report.measurements.syntheticPngPortraitBytes = portrait.size;
  return { width: result.width, height: result.height, cornerAlpha: read(0, 0)[3], innerTransparentAlpha: read(170, 256)[3], centerAlpha: read(256, 256)[3] };
});

await test('Actual WebP decodes through photo module', async () => {
  const source = canvas(80, 40);
  source.getContext('2d').fillRect(10, 10, 40, 20);
  const blob = await encode(source, 'image/webp', 1);
  assert(blob.type === 'image/webp', 'This browser did not encode a WebP fixture');
  const image = await decode(blob);
  assert(image.width === 80 && image.height === 40, 'WebP dimensions changed');
  report.measurements.syntheticWebpBytes = blob.size;
  return { type: blob.type, width: image.width, height: image.height };
});

await test('JPEG EXIF orientation 6 works through createImageBitmap', async () => {
  assert(typeof createImageBitmap === 'function', 'createImageBitmap is unavailable');
  const blob = await exifJpeg();
  report.measurements.syntheticOrientedJpegBytes = blob.size;
  return checkOrientation(await decode(blob));
});

await test('JPEG EXIF orientation 6 works through HTMLImageElement fallback', async () => {
  const original = globalThis.createImageBitmap;
  try {
    globalThis.createImageBitmap = undefined;
    return checkOrientation(await decode(await exifJpeg()));
  } finally { globalThis.createImageBitmap = original; }
});

await test('Actual IndexedDB reload keeps identity, portrait, revision and exactly-once body wins', async () => {
  const profile = createProfileStore({ storage, idFactory: () => 'fixture-profile' });
  await profile.load();
  await profile.replaceFace(await transparentPng());
  await profile.setDisplayName('Functional fixture');
  assert(await profile.awardWin('fixture-match', 'tomato', profile.current.id), 'First win was not awarded');
  const restored = createProfileStore({ storage, idFactory: () => 'unused-id' });
  await restored.load();
  assert(restored.current.id === 'fixture-profile', 'Profile ID changed after reload');
  assert(restored.current.faceRevision === 1, 'Face revision changed after reload');
  assert(restored.current.faceBlob instanceof Blob, 'IndexedDB did not return a Blob');
  assert(restored.current.faceBytes === restored.current.faceBlob.size, 'Encoded size differs from stored Blob');
  assert(restored.current.displayName === 'Functional fixture', 'Display name changed after reload');
  assert(restored.current.wins.tomato === 1 && restored.current.wins['sweet-potato'] === 0, 'Wins were not scoped to body');
  assert(!await restored.awardWin('fixture-match', 'tomato', restored.current.id), 'Duplicate win was awarded after reload');
  return { databaseIsTestOnly: testDatabaseName.startsWith('daengs-ringout-functional-'), faceRevision: restored.current.faceRevision, portraitBytes: restored.current.faceBytes, wins: restored.current.wins };
});

await test('Clear invalidates a delayed real IndexedDB load and old-profile awards', async () => {
  const gate = defer();
  const reading = defer();
  const delayed = {
    async read() { const value = await storage.read(); reading.resolve(); await gate.promise; return value; },
    write: profile => storage.write(profile),
  };
  let nextId = 0;
  const profile = createProfileStore({ storage: delayed, idFactory: () => `fixture-clear-${++nextId}` });
  const loading = profile.load();
  await reading.promise;
  await profile.clear();
  const wantedId = profile.current.id;
  gate.resolve();
  await loading;
  assert(profile.current.id === wantedId && profile.current.faceBlob === null, 'Old load restored a cleared photo');
  assert(!await profile.awardWin('old-callback', 'tomato', 'fixture-profile'), 'Old-profile callback was awarded');
  const disk = await storage.read();
  assert(disk.id === wantedId && disk.faceBlob === null && disk.wins.tomato === 0, 'Clear was not persisted to actual IndexedDB');
  return { faceCleared: true, oldAwardRejected: true };
});

await test('Replacing a photo invalidates delayed profile hydration', async () => {
  const gate = defer(), reading = defer();
  const delayed = {
    async read() { const value = await storage.read(); reading.resolve(); await gate.promise; return value; },
    write: profile => storage.write(profile),
  };
  const profile = createProfileStore({ storage: delayed, idFactory: () => 'fixture-replacement' });
  const loading = profile.load();
  await reading.promise;
  const replacement = await transparentPng();
  await profile.replaceFace(replacement);
  gate.resolve();
  await loading;
  assert(profile.current.id === 'fixture-replacement' && profile.current.faceBlob === replacement, 'Delayed hydration overwrote newer replacement');
  return { staleReadIgnored: true, revision: profile.current.faceRevision };
});

await test('Newer decoding wins; obsolete bitmap and cleared preview are released', async () => {
  const fixture = await transparentPng();
  const gate = defer();
  let decodingCount = 0, obsoleteDisposals = 0;
  const crop = editor({
    async decode(blob) {
      const isFirst = ++decodingCount === 1;
      if (isFirst) await gate.promise;
      const decoded = await decode(blob);
      if (isFirst) {
        const dispose = decoded.dispose.bind(decoded);
        decoded.dispose = () => { obsoleteDisposals += 1; dispose(); };
      }
      return decoded;
    },
  });
  const previous = crop.setFile(fixture);
  assert(await crop.setFile(fixture), 'Latest image did not load');
  const latest = crop.source;
  gate.resolve();
  assert(await previous === false, 'Older decode was not rejected');
  assert(crop.source === latest && obsoleteDisposals === 1, 'Older decoded resource was not released');
  crop.setImage(null);
  assert(crop.source === null, 'Clear retained crop source');
  assert(latest.image.width === 0, 'Cleared ImageBitmap is still open');
  return { obsoleteDisposals, clearReleasesBitmap: true };
});

await test('Replacing photo during actual asynchronous PNG encoding rejects obsolete output', async () => {
  const crop = editor();
  await crop.setFile(await transparentPng());
  const encoding = crop.encode();
  crop.setImage(null);
  let rejected = false;
  try { await encoding; } catch { rejected = true; }
  assert(rejected, 'A cleared crop was confirmed by an old encoding');
  return { staleEncodingRejected: true };
});

await test('Denied storage keeps photo/name/wins usable for the session', async () => {
  const denied = { async read() { throw new DOMException('Synthetic storage denial', 'SecurityError'); }, async write() { throw new DOMException('Synthetic storage denial', 'SecurityError'); } };
  const profile = createProfileStore({ storage: denied });
  await profile.load();
  await profile.replaceFace(await transparentPng());
  await profile.setDisplayName('Session fixture');
  await profile.awardWin('session-match', 'sweet-potato', profile.current.id);
  assert(profile.sessionOnly, 'Unavailable storage did not expose session status');
  assert(profile.current.faceBlob instanceof Blob && profile.current.displayName === 'Session fixture', 'Session photo or name was lost');
  assert(profile.current.wins['sweet-potato'] === 1, 'Session win was lost');
  return { sessionOnly: true, oldPersistedProfileMayRemainOnWriteFailure: true };
});

await test('Test resources and isolated database are cleaned up', async () => {
  for (const crop of editors) crop.dispose();
  for (const image of decodedImages) image.dispose();
  for (const connection of connections) connection.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(testDatabaseName);
    const timer = setTimeout(() => reject(new Error('Test database cleanup timed out')), 3000);
    request.onsuccess = () => { clearTimeout(timer); resolve(); };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); reject(new Error('Test database cleanup blocked')); };
  });
  return { testDatabaseDeleted: true, realActiveProfileUntouched: true };
});

report.status = report.tests.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL';
report.passed = report.tests.filter(result => result.status === 'PASS').length;
report.total = report.tests.length;
display();
window.__ringoutFunctionalChecks = report;
