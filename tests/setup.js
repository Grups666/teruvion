/**
 * Teruvion test setup.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const TEST_CONFIG = {
  timeout: 30000,
  tempDir: path.join(__dirname, '.temp'),
  fixturesDir: path.join(__dirname, 'helpers', 'fixtures')
};

const pendingTests = [];

if (!fs.existsSync(TEST_CONFIG.tempDir)) {
  fs.mkdirSync(TEST_CONFIG.tempDir, { recursive: true });
}

const testUtils = {
  createTempFile(content, extension = '.json') {
    const filename = `test-${Date.now()}-${Math.random().toString(36).substr(2, 6)}${extension}`;
    const filepath = path.join(TEST_CONFIG.tempDir, filename);
    fs.writeFileSync(filepath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return filepath;
  },

  cleanup() {
    if (!fs.existsSync(TEST_CONFIG.tempDir)) return;

    const files = fs.readdirSync(TEST_CONFIG.tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(TEST_CONFIG.tempDir, file));
    }
  },

  loadFixture(name) {
    const filepath = path.join(TEST_CONFIG.fixturesDir, name);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Fixture not found: ${name}`);
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  },

  assertHasProps(obj, props, message = '') {
    for (const prop of props) {
      assert.ok(Object.prototype.hasOwnProperty.call(obj, prop), `${message}: Missing property '${prop}'`);
    }
  },

  assertNotEmpty(arr, message = 'Array should not be empty') {
    assert.ok(Array.isArray(arr), 'Expected an array');
    assert.ok(arr.length > 0, message);
  },

  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
};

function describe(name, fn) {
  console.log(`\n[Suite] ${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  [FAIL] Suite setup failed: ${err.message}`);
    process.exitCode = 1;
  }
}

function it(name, fn) {
  const fullName = `  [PASS] ${name}`;

  try {
    if (fn.length === 1) {
      const done = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout);
        fn((err) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      });

      pendingTests.push(done
        .then(() => console.log(fullName))
        .catch((err) => {
          console.error(`  [FAIL] ${name}: ${err.message}`);
          process.exitCode = 1;
        }));
      return;
    }

    const result = fn();
    if (result && result.then) {
      pendingTests.push(result
        .then(() => console.log(fullName))
        .catch((err) => {
          console.error(`  [FAIL] ${name}: ${err.message}`);
          process.exitCode = 1;
        }));
    } else {
      console.log(fullName);
    }
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function waitForTests() {
  const tests = pendingTests.splice(0, pendingTests.length);
  await Promise.all(tests);
}

module.exports = {
  assert,
  TEST_CONFIG,
  testUtils,
  describe,
  it,
  waitForTests
};
