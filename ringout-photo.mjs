export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const FACE_SIZE = 512;
const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function validatePhoto(file) {
  if (!file || typeof file.size !== 'number' || file.size <= 0) throw new Error('비어 있는 사진입니다. 다른 사진을 골라 주세요.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('12 MB 이하의 사진을 골라 주세요.');
  if (!PHOTO_MIMES.has(file.type) && !(file.type === '' && /\.(jpe?g|png|webp)$/i.test(file.name ?? ''))) {
    throw new Error('JPEG, PNG, WebP 사진을 골라 주세요.');
  }
  return true;
}

function validHeader(bytes) {
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    || (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP');
}

export async function decodePhoto(file) {
  validatePhoto(file);
  if (!validHeader(new Uint8Array(await file.slice(0, 16).arrayBuffer()))) throw new Error('사진 파일을 읽을 수 없습니다. JPEG, PNG, WebP 사진을 다시 골라 주세요.');
  let image;
  let objectURL;
  try {
    if (globalThis.createImageBitmap) {
      try { image = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'default' }); } catch { /* img fallback below */ }
    }
    if (!image) {
      image = new Image();
      image.decoding = 'async';
      // HTML images follow EXIF orientation in supported current browsers too.
      image.style.imageOrientation = 'from-image';
      objectURL = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('decode failed'));
        image.src = objectURL;
      });
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height || width * height > 50_000_000) throw new Error('dimensions exceed limit');
    let disposed = false;
    return {
      image, width, height,
      dispose() {
        if (disposed) return;
        disposed = true;
        image.close?.();
        if (objectURL) { image.src = ''; URL.revokeObjectURL(objectURL); objectURL = undefined; }
      },
    };
  } catch {
    image?.close?.();
    if (objectURL) { image.src = ''; URL.revokeObjectURL(objectURL); }
    throw new Error('사진을 읽을 수 없거나 너무 큽니다. 5천만 화소 이하의 다른 사진을 골라 주세요.');
  }
}

export class CropEditor {
  constructor(canvas, { size = FACE_SIZE, shape = 'circle', decode = decodePhoto } = {}) {
    this.canvas = canvas;
    this.canvas.width = size;
    this.canvas.height = size;
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('사진 미리보기를 열 수 없습니다.');
    this.shape = shape;
    this.decode = decode;
    this.source = null;
    this.x = .5;
    this.y = .5;
    this.zoom = 1;
    this._generation = 0;
    this._editVersion = 0;
    this._disposed = false;
  }

  get current() { return { x: this.x, y: this.y, zoom: this.zoom, width: this.source?.width ?? 0, height: this.source?.height ?? 0 }; }

  async setFile(file) {
    if (this._disposed) throw new Error('사진 편집기가 닫혔습니다.');
    const generation = ++this._generation;
    let decoded;
    try { decoded = await this.decode(file); } catch (error) {
      if (generation !== this._generation || this._disposed) return false;
      throw error;
    }
    if (generation !== this._generation || this._disposed) { decoded.dispose?.(); return false; }
    this._install(decoded);
    return true;
  }

  setImage(decoded) {
    ++this._generation;
    if (this._disposed) { decoded?.dispose?.(); return; }
    this._install(decoded);
  }

  _install(decoded) {
    if (this.source !== decoded) this.source?.dispose?.();
    this.source = decoded;
    this.reset();
  }

  reset() {
    this._editVersion += 1;
    this.x = .5;
    this.y = .5;
    this.zoom = 1;
    this.draw();
  }

  setZoom(zoom) {
    this._editVersion += 1;
    this.zoom = clamp(Number.isFinite(Number(zoom)) ? Number(zoom) : 1, .5, 6);
    this._constrain();
    this.draw();
  }

  move(dx, dy) {
    if (!this.source || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this._editVersion += 1;
    const scale = this._scale();
    this.x -= dx * this.canvas.width / (this.source.width * scale);
    this.y -= dy * this.canvas.height / (this.source.height * scale);
    this._constrain();
    this.draw();
  }

  _scale() { return Math.max(this.canvas.width / this.source.width, this.canvas.height / this.source.height) * this.zoom; }

  _constrain() {
    if (!this.source) return;
    const scale = this._scale();
    // Zooming out can leave intentional transparent space around tall ears or a
    // wide muzzle. Keep a smaller image centered instead of inverting the bounds.
    const halfX = Math.min(.5, this.canvas.width / (2 * this.source.width * scale));
    const halfY = Math.min(.5, this.canvas.height / (2 * this.source.height * scale));
    this.x = clamp(this.x, halfX, 1 - halfX);
    this.y = clamp(this.y, halfY, 1 - halfY);
  }

  draw() {
    const context = this.context;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    if (!this.source) return;
    context.save();
    context.beginPath();
    context.ellipse(width / 2, height / 2, width * (this.shape === 'oval' ? .43 : .49), height * .49, 0, 0, Math.PI * 2);
    context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const scale = this._scale();
    context.drawImage(this.source.image, width / 2 - this.x * this.source.width * scale, height / 2 - this.y * this.source.height * scale, this.source.width * scale, this.source.height * scale);
    context.restore();
  }

  async encode() {
    if (!this.source || this._disposed) throw new Error('먼저 사진을 골라 주세요.');
    const generation = this._generation;
    const editVersion = this._editVersion;
    this.draw();
    const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
    if (generation !== this._generation || editVersion !== this._editVersion || this._disposed) throw new Error('사진이 바뀌었습니다. 새 사진을 확인해 주세요.');
    if (!blob) throw new Error('사진을 저장하지 못했습니다. 다시 시도해 주세요.');
    // PNG keeps existing transparency and the intentional portrait mask. No background removal.
    return blob;
  }

  dispose() {
    ++this._generation;
    this._disposed = true;
    this.source?.dispose?.();
    this.source = null;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
