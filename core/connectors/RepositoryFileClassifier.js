/**
 * RepositoryFileClassifier
 *
 * Classifies repository files by structural conventions only.
 * It intentionally avoids semantic substring matching in arbitrary filenames.
 */

const EXACT_FILE_CLASSES = {
  'requirements.txt': { role: 'dependency_manifest', score: 5 },
  'setup.py': { role: 'package_manifest', score: 5 },
  'pyproject.toml': { role: 'package_manifest', score: 5 },
  'package.json': { role: 'package_manifest', score: 5 },
  'environment.yml': { role: 'environment_manifest', score: 5 },
  'environment.yaml': { role: 'environment_manifest', score: 5 },
  dockerfile: { role: 'container_manifest', score: 5 },
  'citation.cff': { role: 'citation_metadata', score: 5 },
  'codemeta.json': { role: 'citation_metadata', score: 5 },
  'config.yaml': { role: 'configuration', score: 4 },
  'config.yml': { role: 'configuration', score: 4 },
  'config.json': { role: 'configuration', score: 4 },
  'main.py': { role: 'entrypoint', score: 4 },
  'train.py': { role: 'entrypoint', score: 4 },
  'run.py': { role: 'entrypoint', score: 4 },
  'model.py': { role: 'entrypoint', score: 4 },
  'readme.md': { role: 'readme', score: 1 }
};

const DOCUMENTATION_EXTENSIONS = new Set(['.md', '.rst', '.txt']);
const DATA_DESCRIPTOR_EXTENSIONS = new Set(['.md', '.rst', '.txt', '.json', '.yaml', '.yml']);
const ENTRYPOINT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.r']);
const DATA_DIRECTORY_SEGMENTS = new Set(['data', 'dataset', 'datasets']);
const DOC_DIRECTORY_SEGMENTS = new Set(['docs', 'doc', 'documentation']);
const EXAMPLE_DIRECTORY_SEGMENTS = new Set(['example', 'examples', 'demo', 'demos', 'notebooks']);

class RepositoryFileClassifier {
  classify(filePath) {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/');
    const segments = normalizedPath
      .split('/')
      .map(segment => segment.trim().toLowerCase())
      .filter(Boolean);

    if (segments.length === 0) return null;

    const name = segments[segments.length - 1];
    const extension = this._extension(name);
    const parentSegments = segments.slice(0, -1);

    if (parentSegments.some(segment => DATA_DIRECTORY_SEGMENTS.has(segment)) &&
        DATA_DESCRIPTOR_EXTENSIONS.has(extension)) {
      return { path: filePath, role: 'data_descriptor', score: 4 };
    }

    if (parentSegments.some(segment => EXAMPLE_DIRECTORY_SEGMENTS.has(segment)) &&
        ENTRYPOINT_EXTENSIONS.has(extension)) {
      return { path: filePath, role: 'example_entrypoint', score: 3 };
    }

    if (parentSegments.some(segment => DOC_DIRECTORY_SEGMENTS.has(segment)) &&
        DOCUMENTATION_EXTENSIONS.has(extension)) {
      return { path: filePath, role: 'documentation', score: 3 };
    }

    const exact = EXACT_FILE_CLASSES[name];
    if (exact) {
      return {
        path: filePath,
        role: exact.role,
        score: exact.score
      };
    }

    if (DOCUMENTATION_EXTENSIONS.has(extension)) {
      return { path: filePath, role: 'documentation', score: 2 };
    }

    return null;
  }

  selectKeyFiles(tree, limit = 8) {
    return (tree || [])
      .map(path => this.classify(path))
      .filter(Boolean)
      .filter(file => file.role !== 'readme')
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, limit)
      .map(file => file.path);
  }

  _extension(name) {
    const index = name.lastIndexOf('.');
    return index >= 0 ? name.slice(index) : '';
  }
}

module.exports = RepositoryFileClassifier;
