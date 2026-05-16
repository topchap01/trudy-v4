// apps/frontend/src/warroom/WarRoomContext.jsx
// Shared context for the War Room page — holds campaign state, phase outputs,
// loading flags, timestamps, and helper utilities.
import { createContext } from 'react'

/**
 * Default shape for documentation and safe destructuring.
 * Actual values are supplied by the provider in WarRoom.jsx.
 */
const defaultValue = {
  // ── Core campaign state ──────────────────────────────────────────────
  campaign: null,
  setCampaign: () => {},
  brief: null,
  setBrief: () => {},
  classification: null,
  setClassification: () => {},

  // ── Phase outputs ────────────────────────────────────────────────────
  framing: '',
  setFraming: () => {},
  framingMeta: null,
  setFramingMeta: () => {},
  evaluation: '',
  setEvaluation: () => {},
  evalMeta: null,
  setEvalMeta: () => {},
  ideas: '',
  setIdeas: () => {},
  synthesis: '',
  setSynthesis: () => {},
  opinion: '',
  setOpinion: () => {},
  strategist: '',
  setStrategist: () => {},
  ideationHarness: null,
  setIdeationHarness: () => {},
  ideationUnboxed: [],
  setIdeationUnboxed: () => {},

  // ── Loading / busy flags ─────────────────────────────────────────────
  loadingFraming: false,
  setLoadingFraming: () => {},
  loadingEvaluate: false,
  setLoadingEvaluate: () => {},
  loadingCreate: null,
  setLoadingCreate: () => {},
  loadingSyn: false,
  setLoadingSyn: () => {},
  loadingOpinion: false,
  setLoadingOpinion: () => {},
  loadingStrategist: false,
  setLoadingStrategist: () => {},
  loadingJudge: false,
  setLoadingJudge: () => {},
  loadingIdeation: false,
  setLoadingIdeation: () => {},
  runningAll: false,
  setRunningAll: () => {},
  runAllStep: '',
  setRunAllStep: () => {},

  // ── Timestamps ───────────────────────────────────────────────────────
  lastRun: {
    framing: null,
    evaluation: null,
    create: null,
    synthesis: null,
    opinion: null,
    strategist: null,
    ideation: null,
    judge: null,
  },
  setLastRun: () => {},

  // ── Helpers ──────────────────────────────────────────────────────────
  reload: async () => {},
  fmtTime: (iso) => (iso ? new Date(iso).toLocaleString() : '—'),
}

export const WarRoomContext = createContext(defaultValue)
WarRoomContext.displayName = 'WarRoomContext'

/**
 * Provider component — wrap the War Room page tree with this.
 *
 * Usage:
 *   <WarRoomProvider value={contextValue}>
 *     <WarRoomContent />
 *   </WarRoomProvider>
 *
 * The `value` prop should be an object matching the shape above,
 * assembled from the useState calls that remain in WarRoom.jsx.
 */
export function WarRoomProvider({ value, children }) {
  return (
    <WarRoomContext.Provider value={value}>
      {children}
    </WarRoomContext.Provider>
  )
}
