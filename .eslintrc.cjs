module.exports = {
  root: true,
  env: {
    es2023: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'build', 'coverage', 'node_modules', '.turbo'],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  }
};
