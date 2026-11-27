/*
 * Every performance budget in one place. scripts/check-bundle.mjs and tests/perf.spec.mjs read
 * these and nothing else, so tightening a budget is a one-line change here.
 *
 * How the numbers were set: measure first, then add headroom. Byte budgets get about 20 % over
 * the measured build, enough for one more paradigm folder (each adds roughly 20–30 kB of JS)
 * and not enough for an accidental dependency. Timing budgets are CI numbers: they are set from
 * the slower of a local run and a Linux amd64 container under emulation, which is slower than
 * the GitHub runner, then widened so the first week cannot be flaky. Frame metrics are the median
 * of several runs. Start wide, tighten once CI history shows the spread.
 */

export const bundle = {
  /** dist/ in bytes, every file. Measured 1,170,933 B (six paradigms, 2026-11-27). */
  totalBytes: 1_400_000,
  /** Largest single JavaScript file in dist/assets. Measured 367,140 B. */
  largestScriptBytes: 430_000,
}

export const gallery = {
  /** Window observed after the index has loaded. The index draws its plates once, as SVG, and runs no engine. */
  observeMs: 3000,
  /** No single long task may exceed this while the index sits on screen. Measured: none at all, locally and emulated. */
  longestTaskMs: 200,
  /** Sum of all long-task durations in the window. Measured 0 ms; the budget allows one slow GC or font pass. */
  totalLongTaskMs: 300,
}

export const focus = {
  /** Runs per paradigm; each statistic is the median across runs. */
  runs: 3,
  /** Frames discarded after the paradigm mounts, then the window measured. */
  warmupMs: 800,
  sampleMs: 2000,
  /**
   * rAF interval, ms. 60 Hz is 16.7 ms. Measured on all six paradigms, locally and in the emulated
   * Linux amd64 container: median 16.7, p95 16.7–16.8. These are CI ceilings, not targets.
   */
  medianFrameMs: 20,
  p95FrameMs: 50,
}
