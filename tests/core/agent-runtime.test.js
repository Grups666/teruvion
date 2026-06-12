/**
 * AgentRuntime tests
 */

const fs = require('fs');
const path = require('path');
const { assert, describe, it } = require('../setup');
const AgentRuntime = require('../../core/agents/AgentRuntime');

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
});
