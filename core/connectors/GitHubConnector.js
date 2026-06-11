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
    const text = this._buildText({ repoData, readme, tree, keyFiles });
    const metadata = this._buildMetadata({ repoData, readme, tree, keyFiles, owner, repo });

    return {
      type: 'github',
      name: repoData.name,
      description: repoData.description,
      readme,
      text,
      url: input,
      owner,
      repo: repo.replace(/\.git$/, ''),
      stars: repoData.stargazers_count,
      topics: repoData.topics || [],
      language: repoData.language,
      license: repoData.license?.spdx_id,
      tree,
      keyFiles,
      metadata
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
          `https://api.github.com/repos/${owner}/${repo}/contents/${this._encodeContentPath(filePath)}`,
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

  _encodeContentPath(filePath) {
    return filePath.split('/').map(encodeURIComponent).join('/');
  }

  _selectKeyFiles(tree) {
    const priorities = [];

    for (const path of tree) {
      const lower = path.toLowerCase();
      const name = lower.split('/').pop();

      if (
        name === 'requirements.txt'
        || name === 'setup.py'
        || name === 'pyproject.toml'
        || name === 'package.json'
        || name === 'environment.yml'
        || name === 'environment.yaml'
        || name === 'dockerfile'
      ) {
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

  _buildText({ repoData, readme, tree, keyFiles }) {
    const sections = [
      `# ${repoData.full_name || repoData.name}`,
      repoData.description || '',
      readme ? `\n## README\n${readme}` : '',
      tree.length > 0 ? `\n## Repository File Tree\n${tree.slice(0, 300).join('\n')}` : ''
    ];

    for (const [filePath, content] of Object.entries(keyFiles)) {
      sections.push(`\n## File: ${filePath}\n${content}`);
    }

    return sections.filter(Boolean).join('\n').slice(0, 80000);
  }

  _buildMetadata({ repoData, readme, tree, keyFiles, owner, repo }) {
    const dependencies = this._extractDependencies(keyFiles);
    const workflows = this._extractWorkflows(tree, readme);
    const datasets = this._extractNamedItemsFromSections(readme, ['dataset', 'data']);
    const models = this._extractRepositoryModels(repoData, readme);

    return {
      type: 'Repository',
      name: repoData.name,
      title: repoData.name,
      fullName: repoData.full_name,
      owner,
      repo: repo.replace(/\.git$/, ''),
      description: repoData.description,
      readme,
      language: repoData.language,
      stars: repoData.stargazers_count,
      topics: repoData.topics || [],
      license: repoData.license?.spdx_id,
      tree,
      keyFiles,
      dependencies,
      packages: dependencies,
      workflows,
      datasets,
      models,
      created: repoData.created_at,
      updated: repoData.updated_at,
      size: repoData.size,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count
    };
  }

  _extractDependencies(keyFiles) {
    const dependencies = [];
    const seen = new Set();

    const add = (name, version = undefined) => {
      const cleanName = String(name || '').trim();
      if (!cleanName || seen.has(cleanName.toLowerCase())) return;
      seen.add(cleanName.toLowerCase());
      dependencies.push({ name: cleanName, version });
    };

    for (const [filePath, content] of Object.entries(keyFiles)) {
      const name = filePath.toLowerCase().split('/').pop();

      if (name === 'requirements.txt') {
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
          const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*(?:==|>=|<=|~=|>|<)?\s*([^#;\s]+)?/);
          if (match) add(match[1], match[2]);
        }
      }

      if (name === 'package.json') {
        try {
          const parsed = JSON.parse(content);
          for (const [pkg, version] of Object.entries(parsed.dependencies || {})) add(pkg, version);
          for (const [pkg, version] of Object.entries(parsed.devDependencies || {})) add(pkg, version);
        } catch {
          // Ignore malformed package files.
        }
      }

      if (name === 'pyproject.toml') {
        for (const line of content.split(/\r?\n/)) {
          const match = line.match(/^\s*"?([A-Za-z0-9_.-]+)"?\s*[=><~!]/);
          if (match) add(match[1]);
        }
      }
    }

    return dependencies.slice(0, 50);
  }

  _extractWorkflows(tree, readme) {
    const workflows = [];

    const hasNotebook = tree.some(path => path.toLowerCase().endsWith('.ipynb'));
    const hasScripts = tree.some(path => /\.(py|js|ts|sh|r)$/i.test(path));
    const hasDocker = tree.some(path => path.toLowerCase().split('/').pop() === 'dockerfile');

    if (hasNotebook) workflows.push({ name: 'Notebook workflow', purpose: 'analysis or demonstration notebooks' });
    if (hasScripts) workflows.push({ name: 'Script workflow', purpose: 'repository scripts or executable entry points' });
    if (hasDocker) workflows.push({ name: 'Container workflow', purpose: 'containerized runtime' });

    if (/usage|quick start|getting started|run/i.test(readme || '')) {
      workflows.push({ name: 'README run workflow', purpose: 'documented usage or run instructions' });
    }

    return workflows;
  }

  _extractRepositoryModels(repoData, readme) {
    const haystack = [
      repoData.name,
      repoData.description,
      ...(repoData.topics || []),
      (readme || '').split(/\r?\n/).slice(0, 12).join(' ')
    ].join(' ');

    if (!/model|forecast|prediction|simulation|algorithm|learning|inference/i.test(haystack)) {
      return [];
    }

    return [{
      name: repoData.name,
      type: 'repository_model',
      framework: repoData.language,
      originalText: repoData.description || repoData.name,
      confidence: 0.65
    }];
  }

  _extractNamedItemsFromSections(text, labels) {
    if (!text) return [];

    const items = [];
    const seen = new Set();
    const lines = text.split(/\r?\n/);
    const labelPattern = labels.join('|');
    let inRelevantSection = false;

    for (const line of lines) {
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        inRelevantSection = new RegExp(labelPattern, 'i').test(heading[1]);
        continue;
      }

      if (!inRelevantSection || !/^\s*[-*+]\s+/.test(line)) continue;

      const cleaned = line
        .replace(/^[\s>*#-]+/, '')
        .replace(/\[[^\]]+\]\([^)]+\)/g, match => match.replace(/^\[|\]\([^)]+\)$/g, ''))
        .trim();

      if (!cleaned || cleaned.length > 160) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name: cleaned, originalText: line.trim(), confidence: 0.55 });
      if (items.length >= 12) break;
    }

    return items;
  }
}

module.exports = GitHubConnector;
