import { defineConfig } from 'vitest/config'

// The model layer: one pure create/step/settle module per paradigm. renderer.ts paints, the
// *.tsx files bind React, and index.ts is the registry, so none of them belong to the model.
const MODEL = 'src/themes/*/*.ts'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // frameLoop.ts and wallClock.ts are browser hooks; the release suite drives them.
      include: [MODEL, 'src/data/**/*.ts', 'src/state/persist.ts'],
      exclude: ['src/themes/*/renderer.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // *.local is already ignored by git, so the HTML report never lands in a commit.
      reportsDirectory: 'coverage.local',
      thresholds: {
        // Applied to each model file on its own, so a new engine without invariant tests fails
        // the gate even when the other engines are well covered.
        [MODEL]: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 75 },
        // Settings persistence decides what a reload restores; every fallback branch is part of the contract.
        'src/state/persist.ts': { lines: 95, statements: 95, functions: 100, branches: 90 },
      },
    },
  },
})
