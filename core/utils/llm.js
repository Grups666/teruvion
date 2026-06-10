/**
 * LLM Wrapper - Paratera API Integration
 * Handles API calls, JSON cleaning, error handling
 */

const fs = require('fs');
const path = require('path');

class LLM {
  constructor() {
    this.config = null;
  }

  /**
   * Load configuration from _local/config/llm.local.jsonc
   */
  loadConfig() {
    if (this.config) return this.config;

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

      this.config = JSON.parse(cleaned);
      return this.config;
    } catch (err) {
      throw new Error(`Failed to load LLM config from ${configPath}: ${err.message}`);
    }
  }

  /**
   * Call LLM with prompt
   */
  async call(prompt, options = {}) {
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
      signal: AbortSignal.timeout(options.timeout || 180000)  // 默认3分钟，深度理解需要时间
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
   */
  async callJSON(prompt, options = {}) {
    const response = await this.call(prompt, options);

    try {
      return JSON.parse(response);
    } catch (err) {
      throw new Error(`Failed to parse LLM JSON response: ${err.message}\nResponse: ${response.substring(0, 200)}`);
    }
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
}

// Singleton instance
const llm = new LLM();

module.exports = llm;
