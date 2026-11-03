/**
 * Full vs ranged GPU uploads of a BufferAttribute, made safe to mix.
 *
 * three r183 `WebGLAttributes.updateBuffer`: when `updateRanges` is NOT empty,
 * ONLY those ranges are uploaded — the rest of the array is ignored, even if a
 * full rewrite flagged `needsUpdate` earlier in the same frame. So a full
 * restyle (selection dims every node) followed by a single-vertex update (the
 * clicked node, a pulse) uploaded one vertex and lost the restyle.
 *
 * The rule here: a full upload, once requested, wins until the renderer has
 * actually performed it (`onUpload` fires after every upload). Until then a
 * ranged request only flags `needsUpdate` — its bytes ride on the full upload.
 */
import type * as THREE from 'three'

const fullUploadPending = new WeakSet<THREE.BufferAttribute>()

/** The whole array changed: upload all of it, whatever ranges were queued. */
export function markFullUpload(attr: THREE.BufferAttribute): void {
  attr.clearUpdateRanges()
  attr.needsUpdate = true
  if (fullUploadPending.has(attr)) return
  fullUploadPending.add(attr)
  attr.onUpload(() => {
    fullUploadPending.delete(attr)
  })
}

/** Only `[start, start + count)` (in elements) changed. */
export function markRangeUpload(attr: THREE.BufferAttribute, start: number, count: number): void {
  if (!fullUploadPending.has(attr)) attr.addUpdateRange(start, count)
  attr.needsUpdate = true
}
