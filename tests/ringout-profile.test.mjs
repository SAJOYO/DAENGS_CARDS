import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore, normalizeDisplayName } from '../ringout-profile.mjs';
import { CropEditor, MAX_PHOTO_BYTES, validatePhoto, decodePhoto } from '../ringout-photo.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function memoryStorage(value = null) {
  return {
    value,
    writes: [],
    async read() { return structuredClone(this.value); },
    async write(profile) { this.value = structuredClone(profile); this.writes.push(this.value); },
  };
}
const face = (contents = 'processed portrait') => new Blob([contents], { type: 'image/png' });
const sequentialIds = () => { let count = 0; return () => `profile-${++count}`; };

test('demo identity, photo bytes, edited name and per-body wins survive reload', async () => {
  const storage = memoryStorage();
  const store = createProfileStore({ storage, idFactory: sequentialIds() });
  await store.load();
  const id = store.current.id;
  assert.equal(store.current.faceBlob, null);
  assert.equal(store.current.displayName, '네오');
  const blob = face();
  await store.replaceFace(blob);
  await store.setDisplayName('  보리 🍅  ');
  assert.equal(await store.awardWin('first-match', 'tomato', id), true);
  const reloaded = createProfileStore({ storage, idFactory: () => 'unused-new-id' });
  await reloaded.load();
  assert.equal(reloaded.current.id, id);
  assert.equal(reloaded.current.faceRevision, 1);
  assert.equal(reloaded.current.faceBytes, blob.size);
  assert.equal(await reloaded.current.faceBlob.text(), await blob.text());
  assert.equal(reloaded.current.displayName, '보리 🍅');
  assert.deepEqual(reloaded.current.wins, { tomato: 1, 'sweet-potato': 0 });
  assert.equal(await reloaded.awardWin('first-match', 'tomato', id), false);
  assert.equal('bodyId' in reloaded.current, false, 'body choice never duplicates identity or face');
});

test('overlapping writes serialize and keep the most recent portrait/name', async () => {
  const gate = deferred();
  const storage = memoryStorage();
  let active = 0, maxActive = 0;
  storage.write = async function (profile) {
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (profile.faceRevision === 1) await gate.promise;
    this.value = structuredClone(profile);
    this.writes.push(this.value);
    active -= 1;
  };
  const store = createProfileStore({ storage });
  const first = store.replaceFace(face('first'));
  const second = store.replaceFace(face('second'));
  const name = store.setDisplayName('두 번째');
  await Promise.resolve();
  assert.equal(active, 1);
  assert.equal(store.current.faceRevision, 2);
  assert.equal(store.current.displayName, '두 번째');
  gate.resolve();
  const result = await first;
  await Promise.all([second, name]);
  assert.equal(result.faceRevision, 2, 'old completion returns current state, not its stale snapshot');
  assert.equal(maxActive, 1);
  assert.equal(storage.value.faceRevision, 2);
  assert.equal(storage.value.displayName, '두 번째');
  assert.equal(await storage.value.faceBlob.text(), 'second');
});

test('a pending load cannot overwrite a selected photo or a cleared identity', async () => {
  for (const change of ['replace', 'clear']) {
    const gate = deferred();
    const storage = memoryStorage();
    const seed = createProfileStore({ storage, idFactory: () => 'old-profile' });
    await seed.replaceFace(face('old-photo'));
    const previous = storage.value;
    storage.read = () => gate.promise;
    const store = createProfileStore({ storage, idFactory: sequentialIds() });
    const loading = store.load();
    if (change === 'replace') await store.replaceFace(face('new-photo'));
    else await store.clear();
    const wanted = store.current;
    gate.resolve(previous);
    await loading;
    assert.equal(store.current, wanted);
    assert.equal(store.current.id, wanted.id);
    assert.equal(store.current.faceBlob, wanted.faceBlob);
    assert.notEqual(store.current.id, 'old-profile');
  }
});

test('clear follows an in-flight old write and invalidates old-profile rewards', async () => {
  const gate = deferred();
  const storage = memoryStorage();
  storage.write = async function (profile) {
    if (profile.faceRevision === 1) await gate.promise;
    this.value = structuredClone(profile);
  };
  const store = createProfileStore({ storage, idFactory: sequentialIds() });
  const oldId = store.current.id;
  const photo = store.replaceFace(face('old'));
  const clear = store.clear();
  const newId = store.current.id;
  assert.notEqual(newId, oldId);
  assert.equal(await store.awardWin('late-match', 'tomato', oldId), false);
  gate.resolve();
  await Promise.all([photo, clear]);
  assert.equal(storage.value.id, newId);
  assert.equal(storage.value.faceBlob, null);
  assert.deepEqual(storage.value.wins, { tomato: 0, 'sweet-potato': 0 });
});

test('initialization requested after a photo edit cannot reload old disk state', async () => {
  const gate = deferred();
  const storage = memoryStorage({ schemaVersion: 1, id: 'old-profile', displayName: 'old' });
  storage.write = async function (profile) { await gate.promise; this.value = structuredClone(profile); };
  const store = createProfileStore({ storage, idFactory: () => 'new-profile' });
  const selected = store.replaceFace(face('new-selection'));
  const loading = store.load();
  gate.resolve();
  await Promise.all([selected, loading]);
  assert.equal(store.current.id, 'new-profile');
  assert.equal(await store.current.faceBlob.text(), 'new-selection');
});

test('concurrent callbacks award each match exactly once and cosmetics count the right body', async () => {
  const storage = memoryStorage();
  const store = createProfileStore({ storage });
  const id = store.current.id;
  const results = await Promise.all(Array.from({ length: 8 }, () => store.awardWin('same-match', 'tomato', id)));
  assert.equal(results.filter(Boolean).length, 1);
  await store.awardWin('match-2', 'tomato', id);
  await store.awardWin('match-3', 'tomato', id);
  await store.awardWin('match-4', 'sweet-potato', id);
  await store.setDisplayName('새 이름');
  await store.replaceFace(face());
  assert.equal(store.current.id, id);
  assert.deepEqual(store.current.wins, { tomato: 3, 'sweet-potato': 1 });
  assert.equal(await store.awardWin('bad-body', 'cabbage', id), false);
  assert.equal(await store.awardWin('missing-owner', 'tomato'), false);
  const reloaded = createProfileStore({ storage });
  await reloaded.load();
  assert.equal(await reloaded.awardWin('match-3', 'sweet-potato', id), false);
  assert.deepEqual(reloaded.current.wins, { tomato: 3, 'sweet-potato': 1 });
});

test('denied reads and quota writes preserve fully usable session state', async () => {
  for (const failingMethod of ['read', 'write']) {
    const storage = memoryStorage();
    storage[failingMethod] = async () => { throw new Error('storage unavailable'); };
    const store = createProfileStore({ storage });
    await store.load();
    await store.replaceFace(face('session photo'));
    await store.setDisplayName('세션 강아지');
    await store.awardWin('session-match', 'sweet-potato', store.current.id);
    assert.equal(store.sessionOnly, true);
    assert.equal(store.current.displayName, '세션 강아지');
    assert.equal(await store.current.faceBlob.text(), 'session photo');
    assert.equal(store.current.wins['sweet-potato'], 1);
  }
});

test('public snapshots cannot corrupt wins; names and persisted data are normalized', async () => {
  assert.equal(normalizeDisplayName('\u0000  네오\n  '), '네오');
  assert.equal(normalizeDisplayName('   '), '네오');
  assert.equal(normalizeDisplayName('\u0085네오\u009c'), '네오');
  assert.equal(normalizeDisplayName('\u0080\u009f'), '네오');
  assert.equal(Array.from(normalizeDisplayName('🐕'.repeat(30))).length, 24);
  const storage = memoryStorage({ schemaVersion: 1, id: 'known', displayName: '이름', faceRevision: -5, faceBlob: face(), faceBytes: 123456, wins: { tomato: -2, 'sweet-potato': 2.5 }, awardedMatches: ['same', 'same', null] });
  const store = createProfileStore({ storage });
  await store.load();
  assert.equal(store.current.faceBytes, store.current.faceBlob.size);
  assert.equal(store.current.faceRevision, 0);
  assert.deepEqual(store.current.wins, { tomato: 0, 'sweet-potato': 0 });
  assert.deepEqual(store.current.awardedMatches, ['same']);
  assert.throws(() => { store.current.wins.tomato = 9000; }, TypeError);
  await assert.rejects(store.replaceFace(new Blob(['full-upload'], { type: 'image/jpeg' })));
});

function mockCanvas() {
  const context = { clearRect() {}, save() {}, beginPath() {}, ellipse() {}, clip() {}, drawImage() {}, restore() {} };
  return { width: 512, height: 512, getContext: () => context, toBlob: callback => callback(face('encoded')) };
}
function decoded(width = 1000, height = 1000) {
  return { image: {}, width, height, disposals: 0, dispose() { this.disposals += 1; } };
}

test('new crop selection wins decode races and releases obsolete decoded resources', async () => {
  const first = deferred(), second = deferred();
  const editor = new CropEditor(mockCanvas(), { decode: value => value === 1 ? first.promise : second.promise });
  const a = decoded(), b = decoded();
  const uploadA = editor.setFile(1);
  const uploadB = editor.setFile(2);
  second.resolve(b);
  assert.equal(await uploadB, true);
  first.resolve(a);
  assert.equal(await uploadA, false);
  assert.equal(editor.source, b);
  assert.equal(a.disposals, 1);
  editor.dispose();
  assert.equal(b.disposals, 1);
});

test('clearing the editor invalidates pending decode and encoding', async () => {
  const gate = deferred();
  const editor = new CropEditor(mockCanvas(), { decode: () => gate.promise });
  const upload = editor.setFile({});
  editor.setImage(null);
  const unused = decoded();
  gate.resolve(unused);
  assert.equal(await upload, false);
  assert.equal(unused.disposals, 1);
  const old = decoded();
  editor.setImage(old);
  let encodedCallback;
  editor.canvas.toBlob = callback => { encodedCallback = callback; };
  const encoding = editor.encode();
  editor.setImage(null);
  encodedCallback(face());
  await assert.rejects(encoding, /사진이 바뀌었습니다/);
  assert.equal(old.disposals, 1);
});

test('crop panning and zoom remain bounded for wide and tall images', () => {
  for (const dimensions of [[3000, 1000], [1000, 3000]]) {
    const editor = new CropEditor(mockCanvas());
    editor.setImage(decoded(...dimensions));
    editor.setZoom(100);
    assert.equal(editor.zoom, 6);
    editor.move(1000, -1000);
    assert.ok(editor.x > 0 && editor.x < .5);
    assert.ok(editor.y > .5 && editor.y < 1);
    editor.setZoom(1);
    if (dimensions[0] < dimensions[1]) assert.equal(editor.x, .5);
    else assert.equal(editor.y, .5);
    editor.dispose();
  }
});

test('zooming out fits tall or wide portraits without moving smaller dimensions off center', () => {
  for (const dimensions of [[1000, 1800], [1800, 1000], [1000, 1000]]) {
    const canvas = mockCanvas();
    let drawn;
    canvas.getContext().drawImage = (...args) => { drawn = args; };
    const editor = new CropEditor(canvas);
    editor.setImage(decoded(...dimensions));
    editor.setZoom(2);
    editor.move(.4, -.4);
    editor.setZoom(-10);
    assert.equal(editor.zoom, .5);
    assert.equal(editor.x, .5);
    assert.equal(editor.y, .5);
    editor.move(20, -20);
    assert.equal(editor.x, .5);
    assert.equal(editor.y, .5);
    assert.ok(drawn[1] >= 0 && drawn[2] >= 0, 'entire downscaled image starts inside the portrait canvas');
    assert.ok(drawn[1] + drawn[3] <= 512 && drawn[2] + drawn[4] <= 512, 'entire downscaled image fits inside the portrait canvas');
    editor.dispose();
  }
});

test('an edited crop invalidates the previous pending encoding', async () => {
  const editor = new CropEditor(mockCanvas());
  editor.setImage(decoded());
  let callback;
  editor.canvas.toBlob = value => { callback = value; };
  const encoding = editor.encode();
  editor.setZoom(2);
  callback(face());
  await assert.rejects(encoding, /사진이 바뀌었습니다/);
  editor.dispose();
});

test('photo validation accepts supported inputs and rejects oversized, mislabeled or empty files', async () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(validatePhoto({ size: 100, type }), true);
  assert.equal(validatePhoto({ size: 100, type: '', name: 'portrait.JPG' }), true);
  assert.throws(() => validatePhoto({ size: MAX_PHOTO_BYTES + 1, type: 'image/png' }), /12 MB/);
  assert.throws(() => validatePhoto({ size: 1, type: 'image/svg+xml' }), /JPEG/);
  assert.throws(() => validatePhoto({ size: 0, type: 'image/jpeg' }), /비어/);
  await assert.rejects(decodePhoto(new Blob(['not really an image'], { type: 'image/png' })), /읽을 수 없습니다/);
});
