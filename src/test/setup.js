import '@testing-library/jest-dom'

// jsdom has no ResizeObserver; React Flow (used by StudyTracking) needs one to measure nodes.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
