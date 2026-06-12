/**
 * AgentRuntime
 *
 * Switchable AI execution layer for LLM-heavy work. Providers expose the same
 * chat/call shape as core/utils/llm so admission, decomposition, review, and
 * future deep jobs can use agents without business-layer branching.
 */

const ClaudeCodeProvider = require('./providers/ClaudeCodeProvider');

class AgentRuntime {
  constructor(config = {}) {
    this.config = config;
    this.provider = this._createProvider(config);
  }

  isEnabled() {
    return Boolean(this.provider);
  }

  providerName() {
    return this.provider?.name || 'api';
  }

  async chat(params = {}, context = {}) {
    if (!this.provider) {
      return context.fallback ? context.fallback() : null;
    }

    try {
      return await this.provider.chat(params, context);
    } catch (error) {
      if (this._fallbackToApi() && context.fallback) {
        const fallback = await context.fallback();
        return {
          ...fallback,
          agent: {
            provider: this.providerName(),
            success: false,
            fallback: 'api',
            error: error.message
          }
        };
      }
      throw error;
    }
  }

  async call(prompt, options = {}, context = {}) {
    const response = await this.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature,
      max_tokens: options.maxTokens || options.max_tokens,
      timeout: options.timeout,
      model: options.model
    }, context);

    return response?.choices?.[0]?.message?.content || response?.content || '';
  }

  _fallbackToApi() {
    return this.config.fallbackToApi !== false;
  }

  _createProvider(config = {}) {
    const provider = String(config.provider || 'api').toLowerCase();
    if (!provider || provider === 'api' || provider === 'llm') return null;
    if (provider === 'claude-code' || provider === 'claudecode' || provider === 'claude_code') {
      return new ClaudeCodeProvider(config.claudeCode || {});
    }
    throw new Error(`Unknown agent provider: ${config.provider}`);
  }
}

module.exports = AgentRuntime;
