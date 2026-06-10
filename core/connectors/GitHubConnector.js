/**
 * GitHubConnector - Fetches rich repository content for LLM understanding
 * Gets: metadata, README, file tree, and key files (papers, configs, data descriptions)
 */

const BaseConnector = require('./BaseConnector');

class GitHubConnector extends BaseConnector {
  canHandle(input) {
    return input.includes('github.com/');
  }

  async fetch(input) {
    const match = input.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) throw new Error('Invalid GitHub URL');

    const [, owner, repo] = match;
    const headers = this._buildHeaders();

    const [repoData, readme, tree] = await Promise.all([
      this._fetchJSON(`https://api.github.com/repos/${owner}/${repo}`, headers),
      this._fetchReadme(owner, repo, headers),
      this._fetchTree(owner, repo, headers)
    ]);

    const keyFiles = await this._fetchKeyFiles(owner, repo, tree, headers);

    return {
      type: 'github',
      name: repoData.name,
      description: repoData.description,
      readme,
      url: input,
      owner,
      repo: repo.replace(/\.git$/, ''),
      stars: repoData.stargazers_count,
      topics: repoData.topics || [],
      language: repoData.language,
      license: repoData.license?.spdx_id,
      tree,
      keyFiles,
      metadata: {
        created: repoData.created_at,
        updated: repoData.updated_at,
        size: repoData.size,
        forks: repoData.forks_count,
        openIssues: repoData.open_issues_count
      }
    };
  }

  _buildHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Teruvion/0.1.0'
    };
    if (this.config.githubToken) {
      headers['Authorization'] = `Bearer ${this.config.githubToken}`;
    }
    return headers;
  }

  async _fetchJSON(url, headers) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} for ${url}`);
    return res.json();
  }

  async _fetchReadme(owner, repo, headers) {
    try {
      const data = await this._fetchJSON(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        headers
      );
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  async _fetchTree(owner, repo, headers) {
    try {
      const data = await this._fetchJSON(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        headers
      );
      return (data.tree || [])
        .filter(f => f.type === 'blob')
        .map(f => f.path);
    } catch {
      return [];
    }
  }

  async _fetchKeyFiles(owner, repo, tree, headers) {
    const keyFiles = {};
    const candidates = this._selectKeyFiles(tree);

    for (const filePath of candidates.slice(0, 8)) {
      try {
        const data = await this._fetchJSON(
          `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`,
          headers
        );
        if (data.size < 50000) {
          keyFiles[filePath] = Buffer.from(data.content, 'base64').toString('utf-8');
        }
      } catch {
        // skip inaccessible files
      }
    }

    return keyFiles;
  }

  _selectKeyFiles(tree) {
    const priorities = [];

    for (const path of tree) {
      const lower = path.toLowerCase();
      const name = lower.split('/').pop();

      if (name === 'requirements.txt' || name === 'setup.py' || name === 'pyproject.toml') {
        priorities.push({ path, score: 3 });
      } else if (name === 'config.yaml' || name === 'config.yml' || name === 'config.json') {
        priorities.push({ path, score: 3 });
      } else if (name.includes('paper') || name.includes('abstract') || name.includes('citation')) {
        priorities.push({ path, score: 4 });
      } else if (lower.endsWith('.md') && name !== 'readme.md') {
        priorities.push({ path, score: 2 });
      } else if (name === 'main.py' || name === 'train.py' || name === 'run.py' || name === 'model.py') {
        priorities.push({ path, score: 3 });
      } else if ((lower.includes('data') || lower.includes('dataset')) && (lower.endsWith('.py') || lower.endsWith('.md') || lower.endsWith('.txt'))) {
        priorities.push({ path, score: 3 });
      }
    }

    return priorities
      .sort((a, b) => b.score - a.score)
      .map(p => p.path);
  }
}

module.exports = GitHubConnector;
