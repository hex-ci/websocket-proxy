module.exports = {
  testEnvironment: 'node',
  // collectCoverage: false,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/**/*.js',
    'index.js',
    '!test/**/*.js'
  ],
  testMatch: [
    '**/test/**/*.test.js'
  ]
};
