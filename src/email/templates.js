/**
 * Email Templates - Teruvion
 *
 * Minimalist HTML email templates matching the product's design language.
 */

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0a0a0a; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; border: 1px solid #e5e5e5; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid #e5e5e5;">
              <span style="font-size: 18px; font-weight: 700; letter-spacing: -0.5px;">Teruvion</span>
              <span style="font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #a3a3a3; margin-left: 12px;">Digital Earth</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #e5e5e5; background: #fafafa;">
              <p style="font-size: 11px; color: #a3a3a3; margin: 0; letter-spacing: 0.3px;">
                Teruvion - Digital Earth Intelligence Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text, url) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background: #0a0a0a; border-radius: 4px;">
          <a href="${url}" style="display: inline-block; padding: 12px 24px; font-size: 13px; font-weight: 600; color: #ffffff; text-decoration: none; letter-spacing: 0.3px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * Application received confirmation
 */
function renderApplicationReceived(name) {
  return baseTemplate(`
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.25px;">Application Received</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 24px;">
      ${name ? `Hi ${name},` : 'Hello,'}<br><br>
      Thank you for applying to the Teruvion Alpha program. We've received your application and will review it shortly.
    </p>
    <p style="font-size: 13px; color: #a3a3a3; margin: 0;">
      We'll notify you when your access is ready.
    </p>
  `);
}

/**
 * Alpha invite with access code
 */
function renderAlphaInvite(inviteCode) {
  return baseTemplate(`
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.25px;">Welcome to Teruvion Alpha</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 24px;">
      Your application has been approved. Use the invite code below to get started.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 16px 32px;">
          <span style="font-size: 24px; font-weight: 700; letter-spacing: 2px; font-family: 'SF Mono', 'Fira Code', monospace;">${inviteCode}</span>
        </td>
      </tr>
    </table>
    ${button('Activate Your Account', 'https://teruvion.com/activate?code=' + inviteCode)}
    <p style="font-size: 12px; color: #a3a3a3; margin: 0;">
      This invite code expires in 7 days.
    </p>
  `);
}

/**
 * Job completed notification
 */
function renderJobCompleted(jobId, resultUrl) {
  return baseTemplate(`
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.25px;">Analysis Complete</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 16px;">
      Your research analysis has been completed successfully.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #e5e5e5;">
      <tr>
        <td style="padding: 16px;">
          <span style="font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #a3a3a3;">Job ID</span><br>
          <span style="font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; color: #0a0a0a;">${jobId}</span>
        </td>
      </tr>
    </table>
    ${resultUrl ? button('View Results', resultUrl) : ''}
    <p style="font-size: 12px; color: #a3a3a3; margin: 0;">
      Results are available for 30 days.
    </p>
  `);
}

/**
 * Job failed notification
 */
function renderJobFailed(jobId, errorMessage) {
  return baseTemplate(`
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.25px;">Analysis Failed</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 16px;">
      Your research analysis encountered an error and could not be completed.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #e5e5e5;">
      <tr>
        <td style="padding: 16px;">
          <span style="font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #a3a3a3;">Job ID</span><br>
          <span style="font-size: 13px; font-family: 'SF Mono', 'Fira Code', monospace; color: #0a0a0a;">${jobId}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 16px 16px;">
          <span style="font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #a3a3a3;">Error</span><br>
          <span style="font-size: 13px; color: #525252;">${errorMessage}</span>
        </td>
      </tr>
    </table>
    <p style="font-size: 12px; color: #a3a3a3; margin: 0;">
      You can retry the analysis from your dashboard. If the problem persists, please contact support.
    </p>
  `);
}

/**
 * Admin notification for new application
 */
function renderAdminNewApplication(application) {
  const fields = [
    ['Email', application.email],
    ['Name', application.name || '-'],
    ['Affiliation', application.affiliation || '-'],
    ['Research Field', application.researchField || '-'],
    ['Intended Use', application.intendedUse || '-'],
    ['Website/Profile', application.websiteOrProfile || '-'],
    ['Applied At', application.createdAt || new Date().toISOString()],
  ];

  const rows = fields.map(([label, value]) => `
    <tr>
      <td style="padding: 8px 16px; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #a3a3a3; white-space: nowrap; vertical-align: top;">${label}</td>
      <td style="padding: 8px 16px; font-size: 13px; color: #0a0a0a;">${value}</td>
    </tr>
  `).join('');

  return baseTemplate(`
    <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 16px; letter-spacing: -0.25px;">New Alpha Application</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #525252; margin: 0 0 16px;">
      A new application has been submitted for the Teruvion Alpha program.
    </p>
    <table cellpadding="0" cellspacing="0" style="width: 100%; background: #fafafa; border-radius: 6px; border: 1px solid #e5e5e5;">
      ${rows}
    </table>
  `);
}

module.exports = {
  renderApplicationReceived,
  renderAlphaInvite,
  renderJobCompleted,
  renderJobFailed,
  renderAdminNewApplication,
};
