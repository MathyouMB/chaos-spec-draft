module.exports = {
  clearMocks: true,
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@chaosspec$": "<rootDir>/lib/index.ts",
    "^@chaosspec/(.*)$": "<rootDir>/lib/$1",
  },
  // setupFilesAfterEnv: ["<rootDir>/test/helpers/setup.ts"],
  maxWorkers: 1, // TODO: we should be able to run tests in parallel, but I believe our lack of unique email contraint is causing issues
  testTimeout: 30000,
};
