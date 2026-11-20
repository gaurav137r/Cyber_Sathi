/**
 * Bland agent configuration shared by the API and the operator script.
 *
 * Default voice for Saathi: the stable female Indian Hindi-accent BTTS_V3
 * voice "Natasha" (UUID: f5cf1741-eb17-45fd-957d-30a2b9a9ed3b). The voice is
 * an agent-level setting so it never changes between calls or reconnects.
 * Alternative calm Indian female voice: "Vibha"
 * (UUID: 791bba5c-f36d-4f15-8b63-ceffffc19fea).
 * Override with BLAND_VOICE using the exact voice ID from Bland.
 */
export const SAATHI_AGENT_ID = "209a8a84-d772-401f-9b33-6930cf55c939"

/** Stable female Indian Hindi-accent voice (Bland "Natasha", BTTS_V3). */
export const DEFAULT_BLAND_VOICE_ID = "f5cf1741-eb17-45fd-957d-30a2b9a9ed3b"

/** Bland API root. Session authorization lives under /v1, agent config under /v2. */
export const BLAND_API_BASE = "https://api.bland.ai"
