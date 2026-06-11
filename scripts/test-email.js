#!/usr/bin/env node
/**
 * Test Email Script
 *
 * Sends a test email to the admin email configured in _local/config/email.local.json
 *
 * Usage: node scripts/test-email.js
 */

const path = require('path');

// Ensure we're in the project root
process.chdir(path.join(__dirname, '..'));

const { sendTestEmail } = require('../src/email/client');

async function main() {
  console.log('Sending test email...');
  console.log('');

  const result = await sendTestEmail();

  if (result.success) {
    console.log('✓ Test email sent successfully');
    console.log('  Message ID:', result.id);
  } else {
    console.error('✗ Failed to send test email');
    console.error('  Error:', result.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
