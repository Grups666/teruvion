/**
 * Teruvion Test Setup
 * Initializes test environment, mocks, and utilities
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  tempDir: path.join(__dirname, '.temp'),
  fixturesDir: path.join(__dirname, 'helpers', 'fixtures')
};

// Ensure temp directory exists
if (!fs.existsSync(TEST_CONFIG.tempDir)) {
  fs.mkdirSync(TEST_CONFIG.tempDir, { recursive: true });
}

// Test utilities
const testUtils = {
  /**
   * Create a temporary file for testing
   */
  createTempFile(content, extension = '.json') {
    const filename = `test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${extension}`;
    const filepath = path.join(TEST_CONFIG.tempDir, filename);
    fs.writeFileSync(filepath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return filepath;
  },

  /**
   * Clean up temporary files
   */
  cleanup() {
    if (fs.existsSync(TEST_CONFIG.tempDir)) {
      const files = fs.readdirSync(TEST_CONFIG.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_CONFIG.tempDir, file));
      }
    }
  },

  /**
   * Load fixture file
   */
  loadFixture(name) {
    const filepath = path.join(TEST_CONFIG.fixturesDir, name);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Fixture not found: ${name}`);
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  },

  /**
   * Assert that an object has specific properties
   */
  assertHasProps(obj, props, message = '') {
    for (const prop of props) {
      assert.ok(obj.hasOwnProperty(prop), `${message}: Missing property '${prop}'`);
    }
  },

  /**
   * Assert that an array is not empty
   */
  assertNotEmpty(arr, message = 'Array should not be empty') {
    assert.ok(Array.isArray(arr), 'Expected an array');
    assert.ok(arr.length > 0, message);
  },

  /**
   * Deep clone an object
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

// Test runner helper
function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Suite setup failed: ${err.message}`);
    process.exitCode = 1;
  }
}

function it(name, fn) {
  const fullName = `  ✓ ${name}`;
  try {
    if (fn.length === 1) {
      // Async test with callback
      const done = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout);
        fn((err) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      });
      done.then(() => console.log(fullName)).catch(err => {
        console.error(`  ❌ ${name}: ${err.message}`);
        process.exitCode = 1;
      });
    } else {
      // Sync test
      const result = fn();
      if (result && result.then) {
        result.then(() => console.log(fullName)).catch(err => {
          console.error(`  ❌ ${name}: ${err.message}`);
          process.exitCode = 1;
        });
      } else {
        console.log(fullName);
      }
    }
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

// Export test utilities
module.exports = {
  assert,
  TEST_CONFIG,
  testUtils,
  describe,
  it
};
