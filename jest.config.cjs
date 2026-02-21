/* eslint-env node */
/**
 * Jest configuration for SOACRS service.
 * Uses ts-jest to transform TypeScript test files.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',

  // ✅ Use <rootDir> so CI/local behave the same
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],

  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],

  // Repo currently uses single worker for determinism
  maxWorkers: 1,

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
};