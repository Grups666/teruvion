#!/usr/bin/env node
/**
 * Teruvion Test Runner
 * Runs all tests in the tests directory
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
  'integration/entity-mapper.test.js',
  'integration/lenses.test.js',
  'integration/ingest-pipeline.test.js'
];

let passed = 0;
let failed = 0;
let total = 0;

console.log('════════════════════════════════════════');
console.log('  Teruvion Test Suite');
console.log('════════════════════════════════════════\n');

for (const testFile of testFiles) {
  const filepath = path.join(TEST_DIR, testFile);

  if (!fs.existsSync(filepath)) {
    console.log(`⚠ Skipping ${testFile} (not found)`);
    continue;
  }

  console.log(`\n► Running ${testFile}\n`);

  try {
    require(filepath);
    passed++;
    total++;
  } catch (err) {
    console.error(`✘ ${testFile} failed:`, err.message);
    failed++;
    total++;
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

process.exit(failed > 0 ? 1 : 0);