#!/usr/bin/env node
/**
 * Teruvion Test Runner
 * Runs all tests in the tests directory with proper failure tracking
 */

const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(__dirname);

// Test files to run (in order)
const testFiles = [
  'core/ontology.test.js',
  'core/layered-ontology.test.js',
  'core/triple-store.test.js',
  'integration/source-admission.test.js',
  'integration/digital-earth-decomposer.test.js',
  'integration/dynamic-ontology-activation.test.js',
  'integration/entity-mapper.test.js',
  'integration/lenses.test.js',
  'integration/ingest-pipeline.test.js',
  'integration/real-source-e2e.test.js',
  'fixtures/fixture1-technical-paper.test.js',
  'fixtures/fixture2-era5-land-dataset.test.js',
  'fixtures/fixture3-wmo-policy-report.test.js',
  'fixtures/fixture4-flood-news.test.js'
];

let passed = 0;
let failed = 0;
let total = 0;
let anyTestFailed = false;

console.log('════════════════════════════════════════');
console.log('  Teruvion Test Suite');
console.log('════════════════════════════════════════\n');

// Track process.exitCode changes
const originalExitCode = process.exitCode;
let lastExitCode = 0;

for (const testFile of testFiles) {
  const filepath = path.join(TEST_DIR, testFile);

  if (!fs.existsSync(filepath)) {
    console.log(`⚠ Skipping ${testFile} (not found)`);
    continue;
  }

  console.log(`\n► Running ${testFile}\n`);

  // Reset exit code before each test
  process.exitCode = 0;
  lastExitCode = 0;

  // Capture console output to detect test failures
  let testOutput = [];
  const originalLog = console.log;
  const originalError = console.error;

  try {
    // Temporarily intercept console to capture test results
    console.log = (...args) => {
      const output = args.join(' ');
      testOutput.push(output);
      originalLog.apply(console, args);
      // Check for test failure markers
      if (output.includes('❌') || output.includes('✘') || output.includes('failed')) {
        anyTestFailed = true;
        lastExitCode = 1;
      }
    };

    console.error = (...args) => {
      testOutput.push(args.join(' '));
      originalError.apply(console, args);
      anyTestFailed = true;
      lastExitCode = 1;
    };

    require(filepath);

    // Check if process.exitCode was set
    if (process.exitCode !== 0) {
      lastExitCode = process.exitCode;
      anyTestFailed = true;
    }

    if (lastExitCode === 0 && !anyTestFailed) {
      passed++;
    } else {
      failed++;
    }
    total++;

  } catch (err) {
    originalError(`✘ ${testFile} failed:`, err.message);
    failed++;
    total++;
    anyTestFailed = true;
  } finally {
    // Restore console
    console.log = originalLog;
    console.error = originalError;
  }
}

// Cleanup temp files
const tempDir = path.join(TEST_DIR, '.temp');
if (fs.existsSync(tempDir)) {
  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

console.log('\n════════════════════════════════════════');
console.log(`  Results: ${passed}/${total} test files passed`);
if (failed > 0) {
  console.log(`  ✘ ${failed} failed`);
}
console.log('════════════════════════════════════════\n');

process.exit(anyTestFailed ? 1 : 0);