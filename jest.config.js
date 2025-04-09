module.exports = {
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: "coverage",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  moduleFileExtensions: ["js", "json", "jsx", "ts", "tsx", "node"],
  verbose: true,
};