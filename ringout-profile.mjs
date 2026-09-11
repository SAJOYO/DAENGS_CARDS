// One local identity slot. Body choice and runtime Three.js objects are deliberately absent.
export const PROFILE_DATABASE = 'daengs-ringout';
export const PROFILE_STORE = 'profiles';
export const PROFILE_KEY = 'active';
const BODY_IDS = ['tomato', 'sweet-potato'];
const MAX_FACE_BYTES = 4 * 1024 * 1024;

export function normalizeDisplayName(value) {
  const name = String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return Array.from(name).slice(0, 24).join('') || '네오';
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function freshProfile(idFactory) {
  return {
    schemaVersion: 1, id: idFactory(), faceRevision: 0, displayName: '네오',
    faceBlob: null, faceBytes: 0, wins: { tomato: 0, 'sweet-potato': 0 }, awardedMatches: [],
  };
}

function snapshot(profile) {
  return Object.freeze({ ...profile, wins: Object.freeze({ ...profile.wins }), awardedMatches: Object.freeze([...profile.awardedMatches]) });
}

function isFace(blob) {
  return blob instanceof Blob && blob.size > 0 && blob.size <= MAX_FACE_BYTES && /^(image\/png|image\/webp)$/.test(blob.type);
}

function restore(value, idFactory) {
  if (!value || value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id || value.id.length > 150) return freshProfile(idFactory);
  const profile = freshProfile(() => value.id);
  profile.faceBlob = isFace(value.faceBlob) ? value.faceBlob : null;
  profile.faceBytes = profile.faceBlob?.size ?? 0;
  profile.faceRevision = Number.isSafeInteger(value.faceRevision) && value.faceRevision >= 0 ? value.faceRevision : 0;
  profile.displayName = normalizeDisplayName(value.displayName);
  for (const body of BODY_IDS) profile.wins[body] = Number.isSafeInteger(value.wins?.[body]) && value.wins[body] >= 0 ? value.wins[body] : 0;
  // Keep all awarded match IDs for this one local profile: truncating would permit duplicate awards.
  profile.awardedMatches = [...new Set(Array.isArray(value.awardedMatches) ? value.awardedMatches.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 150) : [])];
  return profile;
}

export function createIndexedDBStorage(indexedDB = globalThis.indexedDB) {
  let opening;
  const open = () => {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!indexedDB) { reject(new Error('Local photo storage is unavailable')); return; }
      let finished = false;
      let request;
      const fail = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error ?? new Error('Local photo storage is unavailable'));
      };
      const timer = setTimeout(() => fail(new Error('Local photo storage did not open')), 3000);
      try { request = indexedDB.open(PROFILE_DATABASE, 1); } catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PROFILE_STORE)) request.result.createObjectStore(PROFILE_STORE);
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(new Error('Local photo storage is blocked'));
      request.onsuccess = () => {
        if (finished) { request.result.close(); return; }
        finished = true;
        clearTimeout(timer);
        const database = request.result;
        database.onversionchange = () => { database.close(); opening = undefined; };
        resolve(database);
      };
    });
    return opening;
  };
  return {
    async read() {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(PROFILE_STORE, 'readonly');
        const request = transaction.objectStore(PROFILE_STORE).get(PROFILE_KEY);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Profile read aborted'));
        transaction.oncomplete = () => resolve(request.result ?? null);
      });
    },
    async write(profile) {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(PROFILE_STORE, 'readwrite');
        transaction.objectStore(PROFILE_STORE).put(profile, PROFILE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Profile write failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('Profile write aborted'));
      });
    },
  };
}

export class ProfileStore {
  constructor({ storage = createIndexedDBStorage(), idFactory = newId } = {}) {
    this.storage = storage;
    this.idFactory = idFactory;
    this._current = snapshot(freshProfile(idFactory));
    this.sessionOnly = false;
    this.loaded = false;
    this._version = 0;
    this._writes = Promise.resolve();
    this._loadPromise = null;
    this._listeners = new Set();
  }

  get current() { return this._current; }

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notify() {
    for (const callback of this._listeners) {
      // A presentation subscriber must not prevent a committed local data update.
      try { callback(this._current, { sessionOnly: this.sessionOnly, loaded: this.loaded }); } catch { /* subscriber owns its errors */ }
    }
  }

  _commit(profile) {
    this._version += 1;
    this._current = snapshot(profile);
    this._notify();
    return this._persist(this._current);
  }

  _persist(profile) {
    this._writes = this._writes.then(async () => {
      if (this.sessionOnly) return;
      try { await this.storage.write(profile); } catch {
        this.sessionOnly = true;
        this._notify();
      }
    });
    // Return the latest state, never the snapshot of a completed obsolete write.
    return this._writes.then(() => this._current);
  }

  load() {
    if (this._loadPromise) return this._loadPromise;
    const version = this._version;
    this._loadPromise = (async () => {
      try {
        // A user may act before initialization finishes (or even before load is called).
        // Such a choice owns the session and must not be replaced by the disk snapshot.
        if (version === 0) {
          const stored = await this.storage.read();
          if (this._version === version) {
            this._current = snapshot(restore(stored, () => this._current.id));
            this._version += 1;
            // Save the first demo ID and repair invalid identity records for stable reloads.
            if (!stored || stored.id !== this._current.id || stored.schemaVersion !== 1) await this._persist(this._current);
          }
        } else {
          await this._writes;
        }
      } catch {
        this.sessionOnly = true;
      }
      this.loaded = true;
      this._notify();
      return this._current;
    })();
    return this._loadPromise;
  }

  setDisplayName(name) {
    const displayName = normalizeDisplayName(name);
    if (displayName === this._current.displayName) return Promise.resolve(this._current);
    return this._commit({ ...this._current, displayName });
  }

  replaceFace(faceBlob) {
    if (!isFace(faceBlob)) return Promise.reject(new Error('A processed PNG or WebP portrait under 4 MB is required'));
    return this._commit({ ...this._current, faceBlob, faceBytes: faceBlob.size, faceRevision: this._current.faceRevision + 1 });
  }

  clear() {
    // New identity also invalidates pending old-match reward callbacks.
    return this._commit(freshProfile(this.idFactory));
  }

  async awardWin(matchId, bodyId, expectedProfileId) {
    if (expectedProfileId !== this._current.id || !BODY_IDS.includes(bodyId) || typeof matchId !== 'string' || !matchId || matchId.length > 150) return false;
    if (this._current.awardedMatches.includes(matchId)) return false;
    await this._commit({
      ...this._current,
      wins: { ...this._current.wins, [bodyId]: this._current.wins[bodyId] + 1 },
      awardedMatches: [...this._current.awardedMatches, matchId],
    });
    return true;
  }

  async flush() { await this._writes; return this._current; }
}

export const createProfileStore = options => new ProfileStore(options);
