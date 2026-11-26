// The paradigm contract (README, Rule 1) as import rules. `$1` refers to the theme folder matched in
// `from`, so one rule covers every paradigm, including ones that do not exist yet.
const THEME = '^src/themes/([^/]+)/'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'theme-imports-another-theme',
      comment: 'A paradigm shares data with the others through src/state and src/data, never through code.',
      severity: 'error',
      from: { path: THEME },
      to: { path: '^src/themes/', pathNot: '^src/themes/$1/' },
    },
    {
      name: 'theme-imports-chrome',
      comment: 'A paradigm never reaches into the showcase chrome: no shared card, modal, dock or frame.',
      severity: 'error',
      from: { path: THEME },
      to: { path: '^src/(components/|App\\.tsx$|main\\.tsx$)' },
    },
    {
      name: 'theme-outside-core',
      comment: 'A paradigm may import src/data, src/state, its own folder and packages. Nothing else in src.',
      severity: 'error',
      from: { path: THEME },
      to: { path: '^src/', pathNot: ['^src/themes/$1/', '^src/data/', '^src/state/'] },
    },
    {
      name: 'core-imports-presentation',
      comment: 'The live core is a leaf: data and state know nothing about paradigms or chrome.',
      severity: 'error',
      from: { path: '^src/(data|state)/' },
      to: { path: '^src/(themes|components)/|^src/(App|main)\\.tsx$' },
    },
    {
      name: 'chrome-bypasses-registry',
      comment: 'The chrome reaches paradigms only through the registry in src/themes/index.ts.',
      severity: 'error',
      from: { path: '^src/(components/|App\\.tsx$|main\\.tsx$)' },
      to: { path: THEME },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: '^src/',
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.mjs', '.css'] },
  },
}
