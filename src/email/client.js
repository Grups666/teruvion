/**
 * Email Client - Resend Integration
 *
 * Provides email sending capabilities for Teruvion.
 * Uses Resend (https://resend.com) as the email provider.
 */

const fetch = require('node-fetch');

let config = null;

/**
 * Load email configuration from local config file
 */
function loadConfig() {
  if (config) return config;

  try {
    const configPath = require('path').join(process.cwd(), '_local/config/email.local.json');
    config = require(configPath);
    return config;
  } catch (err) {
    console.error('[Email] Failed to load config:', err.message);
    return null;
  }
}

/**
 * Send an email via Resend API
 */
async function sendEmail({ to, subject, html, text }) {
  const cfg = loadConfig();

  if (!cfg || !cfg.apiKey) {
    console.error('[Email] No API key configured');
    return { success: false, error: 'No API key configured' };
  }

  if (cfg.provider !== 'resend') {
    console.error('[Email] Unsupported provider:', cfg.provider);
    return { success: false, error: 'Unsupported provider' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Email] Send failed:', data);
      return { success: false, error: data.message || 'Send failed' };
    }

    console.log('[Email] Sent successfully, id:', data.id);
    return { success: true, id: data.id };

  } catch (err) {
    console.error('[Email] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send application received confirmation
 */
async function sendApplicationReceivedEmail(to, name) {
  const { renderApplicationReceived } = require('./templates');

  return sendEmail({
    to,
    subject: 'Application Received - Teruvion Alpha',
    html: renderApplicationReceived(name),
  });
}

/**
 * Send alpha invite with access code
 */
async function sendAlphaInviteEmail(to, inviteCode) {
  const { renderAlphaInvite } = require('./templates');

  return sendEmail({
    to,
    subject: 'Welcome to Teruvion Alpha',
    html: renderAlphaInvite(inviteCode),
  });
}

/**
 * Send job completion notification
 */
async function sendJobCompletedEmail(to, jobId, resultUrl) {
  const { renderJobCompleted } = require('./templates');

  return sendEmail({
    to,
    subject: 'Your Analysis is Complete - Teruvion',
    html: renderJobCompleted(jobId, resultUrl),
  });
}

/**
 * Send job failure notification
 */
async function sendJobFailedEmail(to, jobId, errorMessage) {
  const { renderJobFailed } = require('./templates');

  return sendEmail({
    to,
    subject: 'Analysis Failed - Teruvion',
    html: renderJobFailed(jobId, errorMessage),
  });
}

/**
 * Send admin notification about new application
 */
async function sendAdminNewApplicationEmail(application) {
  const cfg = loadConfig();
  if (!cfg || !cfg.adminEmail) {
    console.error('[Email] No admin email configured');
    return { success: false, error: 'No admin email configured' };
  }

  const { renderAdminNewApplication } = require('./templates');

  return sendEmail({
    to: cfg.adminEmail,
    subject: `[Teruvion] New Alpha Application: ${application.email}`,
    html: renderAdminNewApplication(application),
  });
}

/**
 * Send test email to admin
 */
async function sendTestEmail() {
  const cfg = loadConfig();
  if (!cfg || !cfg.adminEmail) {
    console.error('[Email] No admin email configured');
    return { success: false, error: 'No admin email configured' };
  }

  return sendEmail({
    to: cfg.adminEmail,
    subject: 'Test Email - Teruvion',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px;">Test Email</h1>
        <p style="color: #666; margin: 0;">
          This is a test email from Teruvion.<br>
          Sent at: ${new Date().toISOString()}
        </p>
      </div>
    `,
  });
}

module.exports = {
  sendEmail,
  sendApplicationReceivedEmail,
  sendAlphaInviteEmail,
  sendJobCompletedEmail,
  sendJobFailedEmail,
  sendAdminNewApplicationEmail,
  sendTestEmail,
};
