/**
 * Shared mutable chaos state.
 * Kept in a single module so the /ready endpoint and admin routes
 * read/write the same flags without circular dependencies.
 */

// Readiness flag — toggled by POST /api/v1/admin/toggle-ready
let _isReady = false;

// Buffers allocated by GET /api/v1/admin/leak — held to simulate a memory leak
const _leakedBuffers: Buffer[] = [];

export function getReadiness(): boolean {
  return _isReady;
}

export function setReadiness(value: boolean): void {
  _isReady = value;
}

export function activateReadiness(): void {
  _isReady = true;
}

export function toggleReadiness(): boolean {
  _isReady = !_isReady;
  return _isReady;
}

export function addLeakedBuffer(buf: Buffer): void {
  _leakedBuffers.push(buf);
}

export function getLeakedBufferCount(): number {
  return _leakedBuffers.length;
}

export function getLeakedMemoryMb(): number {
  return _leakedBuffers.reduce((acc, b) => acc + b.byteLength, 0) / (1024 * 1024);
}

export function resetChaosState(): void {
  _isReady = true;           // restore readiness
  _leakedBuffers.length = 0; // release all leaked buffers
}
