module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // The "@/..." imports used by the components, and JSX for component tests (Next keeps JSX for itself)
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
  },
};
