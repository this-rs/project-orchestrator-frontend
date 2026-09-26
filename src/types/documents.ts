// ============================================================================
// DOCUMENTS
// ============================================================================
//
// Mirrors the API contract frozen in plan 8b0fdd73 ("Pièces jointes de bout en
// bout"). The backend is being built in parallel against the same contract, so
// these shapes are the agreement — not a description of an implementation.
//
//   POST   /api/documents            multipart: file, project_id?, session_id?
//          → 201 DocumentDetail
//          → 413 too large, 415 unsupported format, 422 malformed
//   GET    /api/documents?project_id=&session_id=&limit=&offset=
//          → DocumentListResponse
//   GET    /api/documents/:id        → DocumentDetail (without the text)
//   GET    /api/documents/:id/chunks → DocumentChunkListResponse
//   GET    /api/documents/:id/raw    → the original file
//   DELETE /api/documents/:id        → 204
//
// Deliberately NOT named `Document`: that collides with the DOM's global
// `Document` type, and a shadowed global in a component file is a nasty way to
// spend an afternoon.

/** A document as returned by the list endpoint. */
export interface DocumentSummary {
  id: string
  filename: string
  /** Server-detected format ("pdf", "markdown", …) — an open set, not an enum. */
  format: string
  size_bytes: number
  /** Content address of the stored blob; identical uploads share one. */
  sha256: string
  page_count: number
  chunk_count: number
  created_at?: string
  project_id?: string | null
  session_id?: string | null
}

/**
 * A document as returned by the upload and detail endpoints.
 *
 * `warnings` carries what extraction could not do — a PDF with 3 text-less
 * pages out of 40 says so here. Surfacing it is the whole point: the uploader
 * is the only person who can still fix the source file.
 */
export interface DocumentDetail extends DocumentSummary {
  warnings: string[]
}

export interface DocumentListResponse {
  items: DocumentSummary[]
  total: number
}

/** One chunk of extracted text, with its byte interval in the source. */
export interface DocumentChunk {
  id: string
  text: string
  start: number
  end: number
  page?: number | null
}

export interface DocumentChunkListResponse {
  items: DocumentChunk[]
}
