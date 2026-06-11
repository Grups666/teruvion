/**
 * Alpha Invite Store
 * Manages invite codes for alpha access
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Invite expires after 7 days
const INVITE_EXPIRY_DAYS = 7;

class AlphaInviteStore {
  constructor(storagePath = null) {
    this.invites = new Map(); // code -> invite
    this.storagePath = storagePath || path.join(__dirname, '../../_local/data/alpha-invites.json');
  }

  /**
   * Create a new invite
   */
  create(email, applicationId) {
    const code = this._generateCode();
    const now = new Date().toISOString();

    const invite = {
      code,
      email: email.toLowerCase().trim(),
      applicationId,
      status: 'active',
      createdAt: now,
      usedAt: null
    };

    this.invites.set(code, invite);
    return invite;
  }

  /**
   * Find invite by code
   */
  findByCode(code) {
    const normalizedCode = code.toUpperCase().trim();
    return this.invites.get(normalizedCode);
  }

  /**
   * Mark invite as used
   */
  markUsed(code) {
    const invite = this.invites.get(code.toUpperCase().trim());
    if (!invite) return null;

    invite.status = 'used';
    invite.usedAt = new Date().toISOString();
    return invite;
  }

  /**
   * Check if invite is expired
   */
  isExpired(invite) {
    if (!invite || invite.status !== 'active') return true;

    const created = new Date(invite.createdAt);
    const now = new Date();
    const daysSinceCreated = (now - created) / (1000 * 60 * 60 * 24);

    return daysSinceCreated > INVITE_EXPIRY_DAYS;
  }

  /**
   * Get all invites
   */
  getAll() {
    return Array.from(this.invites.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get active invites
   */
  getActive() {
    return this.getAll().filter(inv => inv.status === 'active' && !this.isExpired(inv));
  }

  /**
   * Save to disk
   */
  async save() {
    const data = {
      version: '1.0',
      updated: new Date().toISOString(),
      invites: Array.from(this.invites.values())
    };

    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load from disk
   */
  async load() {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      const data = JSON.parse(content);

      this.invites.clear();
      for (const invite of data.invites || []) {
        this.invites.set(invite.code, invite);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist yet, start empty
    }
  }

  /**
   * Generate 8-character alphanumeric code
   */
  _generateCode() {
    let code;
    do {
      code = crypto.randomBytes(4).toString('hex').toUpperCase();
    } while (this.invites.has(code));
    return code;
  }
}

module.exports = { AlphaInviteStore };
