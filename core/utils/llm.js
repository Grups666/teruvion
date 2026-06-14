/**
 * LLM Wrapper
 * Handles API calls, JSON cleaning, error handling, and optional local config.
 */

const fs = require('fs');
const path = require('path');
const AgentRuntime = require('../agents/AgentRuntime');

class LLM {
  constructor() {
    this.config = null;
    this.agentRuntime = null;
  }

  /**
   * Load configuration from environment variables, with optional _local overrides.
   * Public clones should work without _local/config/llm.local.jsonc.
   */
  loadConfig() {
    if (this.config) return this.config;

    const localConfig = this._loadLocalConfig();
    const localModels = localConfig.models || {};
    const localIntegrations = localConfig.integrations || {};
    const localAgent = localConfig.agent || {};
    const localGitHub = localIntegrations.github || {};
    const localOpenAlex = localIntegrations.openAlex || {};
    const baseUrl = process.env.ANTHROPIC_BASE_URL
      || localConfig.apiUrl
      || localConfig.baseUrl
      || 'https://api.anthropic.com';

    this.config = {
      ...localConfig,
      apiKey: process.env.ANTHROPIC_API_KEY || localConfig.apiKey || '',
      adminSecret: process.env.ADMIN_SECRET || localConfig.adminSecret || '',
      apiUrl: baseUrl,
      baseUrl,
      models: {
        ...localModels,
        engineering: process.env.ANTHROPIC_MODEL
          || localModels.engineering
          || localModels.default
          || 'claude-3-5-sonnet-latest'
      },
      agent: {
        ...localAgent,
        provider: process.env.TERUVION_AGENT_PROVIDER
          || localAgent.provider
          || 'api',
        fallbackToApi: process.env.TERUVION_AGENT_FALLBACK_TO_API
          ? process.env.TERUVION_AGENT_FALLBACK_TO_API !== 'false'
          : localAgent.fallbackToApi !== false,
        claudeCode: {
          ...(localAgent.claudeCode || {}),
          command: process.env.TERUVION_AGENT_COMMAND
            || localAgent.claudeCode?.command,
          args: process.env.TERUVION_AGENT_ARGS
            ? process.env.TERUVION_AGENT_ARGS.split(/\s+/).filter(Boolean)
            : localAgent.claudeCode?.args,
          promptMode: process.env.TERUVION_AGENT_PROMPT_MODE
            || localAgent.claudeCode?.promptMode,
          timeout: process.env.TERUVION_AGENT_TIMEOUT
            ? Number(process.env.TERUVION_AGENT_TIMEOUT)
            : localAgent.claudeCode?.timeout
        }
      },
      integrations: {
        ...localIntegrations,
        github: {
          ...localGitHub,
          token: process.env.GITHUB_TOKEN || localGitHub.token || ''
        },
        openAlex: {
          ...localOpenAlex,
          apiKey: process.env.OPENALEX_API_KEY || localOpenAlex.apiKey || '',
          email: process.env.OPENALEX_EMAIL || localOpenAlex.email || ''
        }
      }
    };

    return this.config;
  }

  _loadLocalConfig() {
    const configPath = path.join(__dirname, '../../_local/config/llm.local.jsonc');

    try {
      const content = fs.readFileSync(configPath, 'utf8');

      // Remove comments (but be careful with URLs containing //)
      const lines = content.split('\n');
      const cleanedLines = lines.map(line => {
        // Remove // comments only if they're not inside quotes
        const commentIndex = line.indexOf('//');
        if (commentIndex !== -1) {
          // Check if // is inside a string
          const beforeComment = line.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;
          // If odd number of quotes, // is inside a string, keep the line
          if (quoteCount % 2 === 0) {
            return line.substring(0, commentIndex);
          }
        }
        return line;
      });

      const cleaned = cleanedLines.join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

      return JSON.parse(cleaned);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return {};
      }
      throw new Error(`Failed to load local LLM config from ${configPath}: ${err.message}`);
    }
  }

  /**
   * Chat-style interface for compatibility with evaluators
   * @param {Object} params - { messages: [{ role, content }], temperature, max_tokens }
   */
  async chat(params) {
    const config = this.loadConfig();
    const agent = this.getAgentRuntime();

    if (agent.isEnabled() && params.agent !== false) {
      return agent.chat(params, {
        fallback: () => this._chatAPI({ ...params, agent: false })
      });
    }

    return this._chatAPI(params);
  }

  async _chatAPI(params) {
    const config = this.loadConfig();

    const apiUrl = config.apiUrl || config.baseUrl;
    const model = params.model || config.models?.engineering || 'glm-5.1';
    const maxTokens = params.max_tokens || 4000;
    const temperature = params.temperature ?? 0.2;

    if (!config.apiKey) {
      throw new Error('LLM API key not configured');
    }

    // Convert messages to prompt if needed by the API
    const messages = params.messages || [];

    const response = await fetch(`${apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages
      }),
      signal: AbortSignal.timeout(params.timeout || 180000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Return in standard format
    return {
      choices: [{
        message: {
          content: data.content?.[0]?.text || ''
        }
      }],
      content: data.content?.[0]?.text || ''
    };
  }

  /**
   * Call LLM with prompt
   */
  async call(prompt, options = {}) {
    const config = this.loadConfig();
    const agent = this.getAgentRuntime();

    if (agent.isEnabled() && options.agent !== false) {
      return agent.call(prompt, options, {
        fallback: () => this._callAPI(prompt, { ...options, agent: false })
      });
    }

    return this._callAPI(prompt, options);
  }

  async _callAPI(prompt, options = {}) {
    const config = this.loadConfig();

    const apiUrl = config.apiUrl || config.baseUrl;
    const model = options.model || config.models?.engineering || 'AWS-Claude-Opus-4.7';
    const maxTokens = options.maxTokens || 4000;

    if (!config.apiKey) {
      throw new Error('LLM API key not configured');
    }

    const response = await fetch(`${apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(options.timeout || 180000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.content || !data.content[0] || !data.content[0].text) {
      throw new Error('Unexpected LLM response format');
    }

    let text = data.content[0].text;

    // Clean markdown code blocks
    text = this.cleanJSON(text);

    return text;
  }

  /**
   * Clean JSON response (remove markdown code blocks)
   */
  cleanJSON(text) {
    text = text.trim();

    if (text.startsWith('```json')) {
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return text;
  }

  /**
   * Call LLM and parse JSON response
   * Includes robust JSON extraction and validation
   */
  async callJSON(prompt, options = {}) {
    const response = await this.call(prompt, options);

    // Try direct parse first
    try {
      return JSON.parse(response);
    } catch (directErr) {
      // Try to extract JSON from response
      const extracted = this.extractJSON(response);
      if (extracted) {
        try {
          return JSON.parse(extracted);
        } catch (extractErr) {
          // Try to repair JSON
          const repaired = this.repairJSON(extracted);
          if (repaired) {
            return JSON.parse(repaired);
          }
        }
      }

      throw new Error(`Failed to parse LLM JSON response: ${directErr.message}\nResponse: ${response.substring(0, 500)}`);
    }
  }

  /**
   * Extract JSON from response (handles markdown code blocks, mixed content)
   */
  extractJSON(text) {
    // Try to find JSON object
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return objectMatch[0];

    // Try to find JSON array
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) return arrayMatch[0];

    return null;
  }

  /**
   * Attempt to repair malformed JSON
   */
  repairJSON(text) {
    if (!text) return null;

    let repaired = text.trim();

    // Remove trailing commas before closing braces/brackets
    repaired = repaired.replace(/,\s*}/g, '}');
    repaired = repaired.replace(/,\s*\]/g, ']');

    // Fix unquoted property names (common LLM mistake)
    // This is a simple heuristic, not comprehensive
    repaired = repaired.replace(/(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

    // Fix single quotes to double quotes
    repaired = repaired.replace(/'/g, '"');

    // Try to parse
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }

  /**
   * Call LLM with structured output and schema validation
   * @param {string} prompt - The prompt
   * @param {Object} schema - Expected response schema (for validation hints)
   * @param {Object} options - Additional options
   */
  async callStructured(prompt, schema = null, options = {}) {
    // Add schema hint to prompt if provided
    const enhancedPrompt = schema
      ? `${prompt}\n\nReturn valid JSON matching this structure. Do not include any text outside the JSON.`
      : prompt;

    return this.callJSON(enhancedPrompt, options);
  }

  /**
   * Get GitHub token from config
   */
  getGitHubToken() {
    const config = this.loadConfig();
    return config.integrations?.github?.token;
  }

  /**
   * Get OpenAlex API key from config
   */
  getOpenAlexKey() {
    const config = this.loadConfig();
    return config.integrations?.openAlex?.apiKey;
  }

  /**
   * Get OpenAlex email from config
   */
  getOpenAlexEmail() {
    const config = this.loadConfig();
    return config.integrations?.openAlex?.email;
  }

  /**
   * Get local admin secret for protected admin API routes
   */
  getAdminSecret() {
    const config = this.loadConfig();
    return config.adminSecret;
  }

  getAgentRuntime() {
    const config = this.loadConfig();
    if (!this.agentRuntime) {
      this.agentRuntime = new AgentRuntime(config.agent || {});
    }
    return this.agentRuntime;
  }

  getAgentStatus() {
    const agent = this.getAgentRuntime();
    const config = this.loadConfig();
    return {
      enabled: agent.isEnabled(),
      provider: agent.providerName(),
      fallbackToApi: config.agent?.fallbackToApi !== false,
      timeout: config.agent?.claudeCode?.timeout || null
    };
  }
}

// Singleton instance
const llm = new LLM();

module.exports = llm;
