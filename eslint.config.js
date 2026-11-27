import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'coverage.local/', 'test-results/', '**/*.local/', 'Claude outputs/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/unit/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hook rules. The React Compiler rules in the plugin's recommended set are left
      // out: no paradigm is compiled, and the engines mutate their model objects in place on purpose.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tests/**/*.{mjs,ts,tsx}', 'scripts/**/*.mjs', '*.{js,cjs,mjs,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    // The repository's own style, checked rather than rewritten: single quotes, no semicolons,
    // two-space indentation, no trailing whitespace, one final newline. Long lines are allowed.
    // Prettier is not used: configured as closely to this style as it allows, it would rewrite
    // 61 of the 73 tracked text files (re-wrapping dense lines, `.5` to `0.5`, splitting HTML
    // attributes), which is a different style rather than a check of this one.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/linebreak-style': ['error', 'unix'],
    },
  },
)
