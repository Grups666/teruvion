#!/usr/bin/env node
/**
 * Teruvion Test Runner
 * Runs all tests in the tests directory with proper async failure tracking.
 */

const path = require('path');
const fs = require('fs');
const testSetup = require('./setup');

const TEST_DIR = path.join(__dirname);

const testFiles = [
  'core/ontology.test.js',
  'core/layered-ontology.test.js',
  'core/triple-store.test.js',
  'core/source-coverage.test.js',
  'core/project-diagnostics.test.js',
  'core/agent-runtime.test.js',
  'core/github-connector.test.js',
  'core/repository-file-classifier.test.js',
  'core/object-review-actions.test.js',
  'core/entity-presenter.test.js',
  'core/paper-identifier-resolver.test.js',
  'core/full-text-broker.test.js',
  'core/digital-earth-importer.test.js',
  'core/alpha-membership-store.test.js',
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

console.log('========================================');
console.log('  Teruvion Test Suite');
console.log('========================================\n');

async function runTestFile(testFile) {
  const filepath = path.join(TEST_DIR, testFile);

  if (!fs.existsSync(filepath)) {
    console.log(`Skipping ${testFile} (not found)`);
    return;
  }

  console.log(`\n> Running ${testFile}\n`);

  process.exitCode = 0;
  let fileFailed = false;
  const originalError = console.error;

  try {
    console.error = (...args) => {
      fileFailed = true;
      originalError.apply(console, args);
    };

    require(filepath);
    await testSetup.waitForTests();

    if (process.exitCode !== 0) {
      fileFailed = true;
    }
  } catch (err) {
    fileFailed = true;
    originalError(`${testFile} failed:`, err.message);
  } finally {
    console.error = originalError;
  }

  if (fileFailed) {
    failed++;
    anyTestFailed = true;
  } else {
    passed++;
  }
  total++;
}

function cleanupTempFiles() {
  const tempDir = path.join(TEST_DIR, '.temp');
  if (!fs.existsSync(tempDir)) return;

  try {
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  } catch {
    // Ignore cleanup errors.
  }
}

async function main() {
  for (const testFile of testFiles) {
    await runTestFile(testFile);
  }

  cleanupTempFiles();

  console.log('\n========================================');
  console.log(`  Results: ${passed}/${total} test files passed`);
  if (failed > 0) {
    console.log(`  ${failed} failed`);
  }
  console.log('========================================\n');

  process.exit(anyTestFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner failed:', err.message);
  process.exit(1);
});
