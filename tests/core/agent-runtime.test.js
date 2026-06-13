/**
 * AgentRuntime tests
 */

const fs = require('fs');
const path = require('path');
const { assert, describe, it } = require('../setup');
const AgentRuntime = require('../../core/agents/AgentRuntime');
const ClaudeCodeProvider = require('../../core/agents/providers/ClaudeCodeProvider');

describe('AgentRuntime', () => {
  it('should stay disabled for api provider', () => {
    const runtime = new AgentRuntime({ provider: 'api' });

    assert.strictEqual(runtime.isEnabled(), false);
    assert.strictEqual(runtime.providerName(), 'api');
  });

  it('should route chat through a configured claude-code compatible command', async () => {
    const scriptPath = path.join(__dirname, '../.temp/mock-agent-provider.js');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, `
      let input = '';
      process.stdin.on('data', chunk => { input += chunk.toString(); });
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({ content: input.includes('Digital Earth') ? 'agent-ok' : 'agent-missing' }));
      });
    `);

    const runtime = new AgentRuntime({
      provider: 'claude-code',
      fallbackToApi: false,
      claudeCode: {
        command: process.execPath,
        args: [scriptPath],
        promptMode: 'stdin',
        timeout: 10000
      }
    });

    const response = await runtime.chat({
      messages: [{ role: 'user', content: 'Digital Earth source' }]
    });

    assert.strictEqual(runtime.isEnabled(), true);
    assert.strictEqual(runtime.providerName(), 'claude-code');
    assert.strictEqual(response.content, 'agent-ok');
    assert.strictEqual(response.agent.provider, 'claude-code');
  });

  it('should resolve Windows command shims from PATH', () => {
    const shimDir = path.join(__dirname, '../.temp/shims');
    fs.mkdirSync(shimDir, { recursive: true });
    const shimPath = path.join(shimDir, 'mock-agent.cmd');
    fs.writeFileSync(shimPath, '@echo off\r\necho ok\r\n');

    const originalPath = process.env.PATH;
    process.env.PATH = `${shimDir}${path.delimiter}${originalPath || ''}`;
    try {
      const provider = new ClaudeCodeProvider({ command: 'mock-agent' });
      const resolved = provider._resolveCommand('mock-agent');
      if (process.platform === 'win32') {
        assert.strictEqual(resolved.toLowerCase(), shimPath.toLowerCase());
      } else {
        assert.strictEqual(resolved, 'mock-agent');
      }
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('should execute PowerShell shims through powershell on Windows', () => {
    const provider = new ClaudeCodeProvider({ command: 'mock-agent' });
    const spec = provider._buildSpawnSpec('C:\\Tools\\claude.ps1', ['-p', 'hello']);

    if (process.platform === 'win32') {
      assert.strictEqual(spec.command, 'powershell.exe');
      assert.deepStrictEqual(spec.args.slice(0, 4), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']);
      assert.strictEqual(spec.args[4], 'C:\\Tools\\claude.ps1');
      assert.deepStrictEqual(spec.args.slice(5), ['-p', 'hello']);
    } else {
      assert.strictEqual(spec.command, 'C:\\Tools\\claude.ps1');
      assert.deepStrictEqual(spec.args, ['-p', 'hello']);
    }
  });

  it('should default Claude Code prompt delivery to stdin', () => {
    const provider = new ClaudeCodeProvider({ command: 'claude', promptMode: undefined });

    assert.strictEqual(provider.config.promptMode, 'stdin');
  });
});
