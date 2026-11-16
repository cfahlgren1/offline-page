interface Window {
  /** Exposed for latency checks: milliseconds per tinynext suggestion, measured in its worker. */
  offlinePageDebug?: { suggestionTimings: number[] };
}
