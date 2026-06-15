/**
 * SpatialRepositoryDiscovery
 *
 * Discovers bounded, map-relevant files from public data repository landing
 * pages. This module emits generic resource candidates; sampling stays in
 * SpatialResourceSampler and source interpretation stays in the decomposer.
 */

const fetch = require('node-fetch');
const { inferFormatFromUrl, primitiveFromFormat } = require('../project/RecompositionSemantics');

const DEFAULTS = Object.freeze({
  maxRepositoryBytes: 20 * 1024 * 1024,
  maxCandidates: 8,
  maxHuggingFaceDirectories: 6
});

class SpatialRepositoryDiscovery {
  constructor(config = {}) {
    this.config = {
      ...DEFAULTS,
      ...config,
      ...(config.spatialRepositoryDiscovery || {})
    };
    this.fetch = config.fetch || fetch;
  }

  canDiscover(resource = {}) {
    const url = resource.url || resource.href;
    if (!url) return false;
    const platform = platformForUrl(url);
    if (!platform) return false;
    const type = String(resource.type || '').toLowerCase();
    return ['dataset', 'data', 'external', 'supplement', 'source'].includes(type) || !type;
  }

  async discover(resource = {}, options = {}) {
    const url = resource.url || resource.href;
    const platform = platformForUrl(url);
    if (!platform) {
      return { status: 'unsupported', resources: [], diagnostics: { reason: 'Unsupported repository platform' } };
    }

    if (platform === 'zenodo') return this.discoverZenodo(resource, options);
    if (platform === 'osf') return this.discoverOSF(resource, options);
    if (platform === 'huggingface') return this.discoverHuggingFace(resource, options);
    return { status: 'unsupported', resources: [], diagnostics: { reason: `Unsupported platform ${platform}` } };
  }

  async discoverZenodo(resource = {}, options = {}) {
    const recordId = zenodoRecordId(resource.url);
    if (!recordId) {
      return { status: 'needs-review', resources: [], diagnostics: { reason: 'Zenodo record id not found' } };
    }

    const record = await this._json(`https://zenodo.org/api/records/${recordId}`, options);
    const candidates = (record.files || [])
      .map(file => this._resourceFromFile({
        fileName: file.key,
        url: file.links?.self,
        size: file.size,
        parent: resource,
        platform: 'zenodo',
        source: 'repository-file-list'
      }))
      .filter(Boolean);

    return this._finishDiscovery({ resource, platform: 'zenodo', candidates });
  }

  async discoverOSF(resource = {}, options = {}) {
    const nodeId = osfNodeId(resource.url);
    if (!nodeId) {
      return { status: 'needs-review', resources: [], diagnostics: { reason: 'OSF node id not found' } };
    }

    const listing = await this._json(`https://api.osf.io/v2/nodes/${nodeId}/files/osfstorage/`, options);
    const candidates = (listing.data || [])
      .filter(item => item.attributes?.kind === 'file')
      .map(item => this._resourceFromFile({
        fileName: item.attributes?.name || item.attributes?.materialized_path,
        url: item.links?.download,
        htmlUrl: item.links?.html || item.links?.iri,
        size: item.attributes?.size,
        parent: resource,
        platform: 'osf',
        source: 'repository-file-list'
      }))
      .filter(Boolean);

    return this._finishDiscovery({ resource, platform: 'osf', candidates });
  }

  async discoverHuggingFace(resource = {}, options = {}) {
    const datasetId = huggingFaceDatasetId(resource.url);
    if (!datasetId) {
      return { status: 'needs-review', resources: [], diagnostics: { reason: 'Hugging Face dataset id not found' } };
    }

    const metadata = await this._safeJson(`https://huggingface.co/api/datasets/${datasetId}`, options);
    const siblingFiles = Array.isArray(metadata?.siblings)
      ? metadata.siblings
        .map(item => ({ type: 'file', path: item.rfilename, size: item.size || item.lfs?.size }))
        .filter(item => item.path)
      : [];
    if (siblingFiles.some(item => inferRepositoryFileFormat(item.path))) {
      const candidates = siblingFiles
        .map(item => this._resourceFromFile({
          fileName: item.path,
          url: `https://huggingface.co/datasets/${datasetId}/resolve/main/${encodeURI(item.path)}`,
          htmlUrl: `https://huggingface.co/datasets/${datasetId}/blob/main/${encodeURI(item.path)}`,
          size: item.size,
          parent: resource,
          platform: 'huggingface',
          source: 'dataset-file-list'
        }))
        .filter(Boolean);

      return this._finishDiscovery({
        resource,
        platform: 'huggingface',
        candidates,
        diagnostics: {
          candidateSource: 'dataset-metadata-siblings',
          bounded: true
        }
      });
    }

    const root = await this._safeJson(`https://huggingface.co/api/datasets/${datasetId}/tree/main?recursive=false`, options);
    if (!root) {
      return {
        status: 'needs-review',
        source: 'spatial-repository-discovery',
        platform: 'huggingface',
        parentResourceUrl: resource.url,
        resources: [],
        diagnostics: {
          warning: 'Hugging Face file listing was unavailable through the current runtime network path.',
          bounded: true
        }
      };
    }
    const rootItems = Array.isArray(root) ? root : (root.value || []);
    const directories = rootItems
      .filter(item => item.type === 'directory')
      .map(item => item.path)
      .sort((a, b) => directoryPriority(b) - directoryPriority(a))
      .slice(0, this.config.maxHuggingFaceDirectories);
    const fileItems = [...rootItems.filter(item => item.type === 'file')];

    for (const directory of directories) {
      const children = await this._safeHFListing(datasetId, directory, options);
      fileItems.push(...children.filter(item => item.type === 'file'));

      const nestedDirectories = children
        .filter(item => item.type === 'directory')
        .map(item => item.path)
        .slice(0, 2);
      for (const nested of nestedDirectories) {
        const nestedChildren = await this._safeHFListing(datasetId, nested, options);
        fileItems.push(...nestedChildren.filter(item => item.type === 'file'));
      }
    }

    const candidates = fileItems
      .map(item => this._resourceFromFile({
        fileName: item.path,
        url: `https://huggingface.co/datasets/${datasetId}/resolve/main/${encodeURI(item.path)}`,
        htmlUrl: `https://huggingface.co/datasets/${datasetId}/blob/main/${encodeURI(item.path)}`,
        size: item.size || item.lfs?.size,
        parent: resource,
        platform: 'huggingface',
        source: 'bounded-repository-tree'
      }))
      .filter(Boolean);

    return this._finishDiscovery({
      resource,
      platform: 'huggingface',
      candidates,
      diagnostics: {
        crawledDirectories: directories,
        bounded: true
      }
    });
  }

  async _safeHFListing(datasetId, path, options = {}) {
    try {
      const url = `https://huggingface.co/api/datasets/${datasetId}/tree/main/${encodeURI(path)}?recursive=false`;
      const listing = await this._json(url, options);
      return Array.isArray(listing) ? listing : (listing.value || []);
    } catch {
      return [];
    }
  }

  async _safeJson(url, options = {}) {
    try {
      return await this._json(url, options);
    } catch {
      return null;
    }
  }

  _resourceFromFile({ fileName, url, htmlUrl, size, parent, platform, source }) {
    if (!fileName || !url) return null;
    const format = inferRepositoryFileFormat(fileName);
    if (!format) return null;
    const numericSize = Number(size || 0);
    const sampleable = !numericSize || numericSize <= this.config.maxRepositoryBytes;
    return {
      label: readableFileLabel(fileName),
      url,
      htmlUrl: htmlUrl || null,
      type: 'dataset',
      role: 'spatial data candidate',
      source,
      format,
      dataFormat: format,
      displayPrimitive: primitiveFromFormat(format),
      sizeBytes: numericSize || null,
      parentResourceUrl: parent.url || null,
      parentResourceLabel: parent.label || null,
      repositoryPlatform: platform,
      samplingEligible: sampleable,
      investigationLabel: sampleable ? 'Sample spatial data' : 'Review large data',
      routeRelevance: sampleable
        ? `Repository file can be bounded-sampled as ${format}.`
        : `Repository file appears spatial but is larger than the bounded sampling limit.`,
      verificationFocus: sampleable
        ? 'format, spatial fields, geometry coverage, and source provenance'
        : 'file manifest, size, subset strategy, and access terms',
      reviewHint: sampleable
        ? `Discovered ${format} file from ${platform}; sample before interpreting map values.`
        : `Discovered ${format} file from ${platform}, but size ${numericSize} bytes exceeds bounded sampling limit.`,
      provenance: {
        method: source,
        repositoryPlatform: platform,
        parentResourceUrl: parent.url || null,
        sourceText: parent.context || parent.url || null,
        url
      }
    };
  }

  _finishDiscovery({ resource, platform, candidates, diagnostics = {} }) {
    const ranked = candidates
      .sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, this.config.maxCandidates);
    return {
      status: ranked.length > 0 ? 'discovered' : 'needs-review',
      source: 'spatial-repository-discovery',
      platform,
      parentResourceUrl: resource.url,
      resources: ranked,
      diagnostics: {
        candidateCount: candidates.length,
        returnedCount: ranked.length,
        ...diagnostics
      }
    };
  }

  async _json(url, options = {}) {
    const response = await this.fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Teruvion/0.12.86 (https://teruvion.com)'
      },
      signal: AbortSignal.timeout(options.timeout || this.config.timeout || 15000)
    });
    if (!response.ok) throw new Error(`Repository discovery failed: HTTP ${response.status}`);
    return response.json();
  }
}

function platformForUrl(url = '') {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('zenodo.org') || host === 'doi.org') return String(url).includes('zenodo') ? 'zenodo' : null;
    if (host.includes('osf.io')) return 'osf';
    if (host.includes('huggingface.co')) return 'huggingface';
  } catch {
    return null;
  }
  return null;
}

function zenodoRecordId(url = '') {
  const value = String(url || '');
  const match = value.match(/zenodo\.org\/(?:records?|record)\/(\d+)/i)
    || value.match(/10\.5281\/zenodo\.(\d+)/i);
  return match?.[1] || null;
}

function osfNodeId(url = '') {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

function huggingFaceDatasetId(url = '') {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const datasetIndex = parts.indexOf('datasets');
    if (datasetIndex >= 0 && parts.length >= datasetIndex + 3) {
      return `${parts[datasetIndex + 1]}/${parts[datasetIndex + 2]}`;
    }
  } catch {
    return null;
  }
  return null;
}

function inferRepositoryFileFormat(fileName = '') {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.geojson')) return 'geojson';
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'csv';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'geotiff';
  if (lower.endsWith('.zip')) return 'shapefile';
  return null;
}

function candidateScore(candidate = {}) {
  let score = 0;
  if (candidate.samplingEligible) score += 100;
  if (candidate.format === 'geojson' || candidate.format === 'shapefile') score += 40;
  if (candidate.format === 'csv') score += 28;
  if (candidate.format === 'geotiff') score += 20;
  const label = `${candidate.label || ''} ${candidate.url || ''}`.toLowerCase();
  if (/(dam|dams|catchment|basin|reservoir|flood|region|country|boundary|result|plot|paper)/.test(label)) score += 16;
  if (candidate.sizeBytes) score -= Math.min(20, candidate.sizeBytes / (10 * 1024 * 1024));
  return score;
}

function directoryPriority(path = '') {
  const lower = String(path || '').toLowerCase();
  if (lower.includes('paper') || lower.includes('plot')) return 10;
  if (/^[ns]\d{2}$/i.test(path)) return 4;
  return 1;
}

function readableFileLabel(fileName = '') {
  const name = String(fileName || '').split('/').filter(Boolean).pop() || fileName;
  return decodeURIComponent(name)
    .replace(/\.(geojson|json|csv|tsv|zip|tiff?|parquet)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Spatial resource';
}

module.exports = SpatialRepositoryDiscovery;
module.exports.platformForUrl = platformForUrl;
module.exports.inferRepositoryFileFormat = inferRepositoryFileFormat;
