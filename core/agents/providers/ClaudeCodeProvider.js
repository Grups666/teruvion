/**
 * ClaudeCodeProvider
 *
 * Runs a configurable Claude Code-style CLI in non-interactive print mode.
 * The command is intentionally configurable because local and server installs
 * may expose Claude Code under different wrappers.
 */

const { spawn } = require('child_process');

class ClaudeCodeProvider {
  constructor(config = {}) {
    this.name = 'claude-code';
    this.config = {
      command: config.command || process.env.TERUVION_AGENT_COMMAND || 'claude',
      args: Array.isArray(config.args)
        ? config.args
        : this._parseArgs(process.env.TERUVION_AGENT_ARGS || '-p --dangerously-skip-permissions'),
      promptMode: config.promptMode || process.env.TERUVION_AGENT_PROMPT_MODE || 'argument',
      cwd: config.cwd || process.env.TERUVION_AGENT_CWD || process.cwd(),
      timeout: Number(config.timeout || process.env.TERUVION_AGENT_TIMEOUT || 300000),
      maxOutputBytes: Number(config.maxOutputBytes || 1024 * 1024),
      ...config
    };
  }

  async chat(params = {}) {
    const prompt = this._messagesToPrompt(params.messages || []);
    const output = await this._run(prompt, params.timeout || this.config.timeout);
    const content = this._extractContent(output);

    return {
      choices: [{
        message: { content }
      }],
      content,
      agent: {
        provider: this.name,
        success: true,
        fallback: null
      }
    };
  }

  _messagesToPrompt(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return '';
    return messages
      .map(message => {
        const role = message.role || 'user';
        const content = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content);
        return `## ${role}\n${content}`;
      })
      .join('\n\n');
  }

  _run(prompt, timeout) {
    return new Promise((resolve, reject) => {
      const args = this.config.promptMode === 'argument'
        ? [...this.config.args, prompt]
        : this.config.args;

      const child = spawn(this.config.command, args, {
        cwd: this.config.cwd,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(new Error(`Claude Code agent timed out after ${timeout}ms`));
      }, timeout);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.length > this.config.maxOutputBytes) {
          child.kill('SIGTERM');
        }
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Claude Code agent failed to start: ${error.message}`));
      });

      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(`Claude Code agent exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
          return;
        }

        resolve(stdout.trim());
      });

      if (this.config.promptMode === 'stdin') {
        child.stdin.write(prompt);
      }
      child.stdin.end();
    });
  }

  _extractContent(output) {
    const text = String(output || '').trim();
    if (!text) return '';

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
      if (typeof parsed.result === 'string') return parsed.result;
      if (typeof parsed.content === 'string') return parsed.content;
      if (parsed.message?.content) return String(parsed.message.content);
    } catch {
      // Plain stdout is valid provider output.
    }

    return text;
  }

  _parseArgs(value) {
    return String(value || '')
      .split(/\s+/)
      .map(part => part.trim())
      .filter(Boolean);
  }
}

module.exports = ClaudeCodeProvider;
