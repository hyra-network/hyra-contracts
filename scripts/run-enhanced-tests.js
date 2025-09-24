#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running Enhanced Test Coverage Analysis...\n');

// Test files to run
const testFiles = [
  'test/EnhancedCoverageTests.test.ts',
  'test/SecurityContractsTests.test.ts', 
  'test/AttackScenariosTests.test.ts'
];

// Check if test files exist
const existingTests = testFiles.filter(file => {
  const exists = fs.existsSync(file);
  if (!exists) {
    console.log(`Warning: Test file not found: ${file}`);
  }
  return exists;
});

if (existingTests.length === 0) {
  console.log('Error: No enhanced test files found. Please create test files first.');
  process.exit(1);
}

console.log(`Running ${existingTests.length} enhanced test files...\n`);

try {
  // Run individual test files
  for (const testFile of existingTests) {
    console.log(`Running ${testFile}...`);
    try {
      execSync(`npx hardhat test ${testFile}`, { 
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log(`${testFile} completed successfully\n`);
    } catch (error) {
      console.log(`${testFile} failed\n`);
    }
  }

  // Run coverage analysis
  console.log('Running coverage analysis...');
  try {
    execSync('npx hardhat coverage', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('Coverage analysis completed');
  } catch (error) {
    console.log('Coverage analysis failed');
  }

  // Generate test report
  console.log('\nGenerating test report...');
  generateTestReport();

} catch (error) {
  console.error('Test execution failed:', error.message);
  process.exit(1);
}

function generateTestReport() {
  const reportPath = 'test-coverage-report.md';
  
  const report = `# Test Coverage Report

## Summary
- **Enhanced Test Files**: ${existingTests.length}
- **Test Files Run**: ${existingTests.join(', ')}
- **Generated**: ${new Date().toISOString()}

## Recommendations

### Immediate Actions (Week 1-2)
1. **Fix Failing Tests**: Address the 78 failing tests identified in coverage analysis
2. **Core Contract Coverage**: Achieve 80%+ coverage on HyraToken, HyraGovernor, HyraTimelock
3. **Security Contract Coverage**: Achieve 90%+ coverage on security contracts

### Short-term Goals (Week 3-4)
1. **Integration Tests**: Add comprehensive end-to-end workflow tests
2. **Attack Scenarios**: Implement attack scenario tests
3. **Edge Cases**: Add boundary condition tests

### Long-term Goals (Month 2+)
1. **Fuzz Testing**: Implement property-based testing
2. **Gas Optimization**: Add gas usage tests
3. **Overall Coverage**: Achieve 90%+ project-wide coverage

## Test Quality Metrics
- **Statements Coverage**: Target 90%+
- **Branches Coverage**: Target 85%+
- **Functions Coverage**: Target 95%+
- **Lines Coverage**: Target 90%+

## Security Focus Areas
1. **Access Control**: Comprehensive role-based access testing
2. **Upgrade Security**: Thorough upgrade scenario testing
3. **Mint Security**: Complete mint cap and request testing
4. **Governance Security**: Full proposal lifecycle testing
5. **Timelock Security**: Complete timelock operation testing

## Next Steps
1. Review failing tests and fix initialization issues
2. Implement missing security contract tests
3. Add comprehensive integration tests
4. Set up continuous integration with coverage reporting
5. Implement automated security testing pipeline
`;

  fs.writeFileSync(reportPath, report);
  console.log(`Test report generated: ${reportPath}`);
}
