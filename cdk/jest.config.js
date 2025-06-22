module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?
: 'ts-jest'
  },
  // JUnit形式のレポート出力を追加（CI用）
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-reports',
      outputName: 'junit.xml',
    }]
  ]
};
