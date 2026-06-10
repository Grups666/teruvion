#!/usr/bin/env node
/**
 * Fixture Test Runner
 * Runs all fixture tests to validate the Digital Earth decomposition pipeline
 */

const path = require('path');
const fs = require('fs');

const FIXTURE_DIR = path.join(__dirname);

// Fixture test files
const fixtureFiles = [
  'fixture1-technical-paper.test.js',
  'fixture2-era5-land-dataset.test.js',
  'fixture3-wmo-policy-report.test.js',
  'fixture4-flood-news.test.js'
];

let passed = 0;
let failed = 0;
let total = 0;
let anyTestFailed = false;

console.log('════════════════════════════════════════');
console.log('  Digital Earth Fixture Tests');
console.log('════════════════════════════════════════\n');

for (const testFile of fixtureFiles) {
  const filepath = path.join(FIXTURE_DIR, testFile);

  if (!fs.existsSync(filepath)) {
    console.log(`⚠ Skipping ${testFile} (not found)`);
    continue;
  }

  console.log(`\n► Running ${testFile}\n`);

  process.exitCode = 0;
  let lastExitCode = 0;

  const originalLog = console.log;
  const originalError = console.error;

  try {
    console.log = (...args) => {
      const output = args.join(' ');
      originalLog.apply(console, args);
      if (output.includes('❌') || output.includes('✘') || output.includes('failed')) {
        anyTestFailed = true;
        lastExitCode = 1;
      }
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      anyTestFailed = true;
      lastExitCode = 1;
    };

    require(filepath);

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
    console.log = originalLog;
    console.error = originalError;
  }
}

console.log('\n════════════════════════════════════════');
console.log(`  Fixture Results: ${passed}/${total} tests passed`);
if (failed > 0) {
  console.log(`  ✘ ${failed} failed`);
}
console.log('════════════════════════════════════════\n');

process.exit(anyTestFailed ? 1 : 0);
