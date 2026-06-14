/**
 * SourceAssetCache
 *
 * Caches inspectable source media locally so frontend review does not depend on
 * low-resolution publisher previews or cross-site image availability.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_PUBLIC_PREFIX = '/assets/source-assets';

class SourceAssetCache {
  constructor(options = {}) {
    this.rootDir = options.rootDir || path.join(__dirname, '../../_local/source-assets');
    this.publicPrefix = options.publicPrefix || DEFAULT_PUBLIC_PREFIX;
    this.maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
    this.timeout = options.timeout || 20000;
  }

  async cacheVisualEvidence(visuals = []) {
    if (!Array.isArray(visuals) || visuals.length === 0) return visuals;

    for (const visual of visuals) {
      if (!visual || String(visual.kind || '').toLowerCase() === 'table') continue;
      const imageUrl = visual.imageUrl;
      if (!this._canCacheUrl(imageUrl)) continue;

      try {
        const cached = await this.cacheImage(imageUrl);
        visual.originalImageUrl = visual.originalImageUrl || imageUrl;
        visual.imageUrl = cached.publicUrl;
        visual.cachedImage = {
          path: cached.relativePath,
          contentType: cached.contentType,
          bytes: cached.bytes,
          cachedAt: cached.cachedAt
        };
      } catch (error) {
        visual.assetCacheWarning = error.message;
      }
    }

    return visuals;
  }

  async cacheImage(url) {
    const normalizedUrl = this._normalizeUrl(url);
    if (!normalizedUrl) throw new Error('Image URL is not cacheable');

    const response = await fetch(normalizedUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(this.timeout),
      headers: {
        'User-Agent': 'Teruvion SourceAssetCache/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Image request failed with HTTP ${response.status}`);
    }

    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new Error(`Refusing to cache non-image asset: ${contentType || 'unknown content type'}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > this.maxBytes) {
      throw new Error(`Image exceeds cache limit: ${contentLength} bytes`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > this.maxBytes) {
      throw new Error(`Image exceeds cache limit: ${buffer.length} bytes`);
    }

    const hash = crypto.createHash('sha256').update(normalizedUrl).digest('hex');
    const extension = this._extensionFor(contentType, normalizedUrl);
    const subdir = hash.slice(0, 2);
    const filename = `${hash}${extension}`;
    const outputDir = path.join(this.rootDir, subdir);
    const outputPath = path.join(outputDir, filename);
    const relativePath = `${subdir}/${filename}`;

    fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, buffer);
    }

    return {
      publicUrl: `${this.publicPrefix}/${relativePath}`,
      relativePath,
      contentType,
      bytes: buffer.length,
      cachedAt: new Date().toISOString()
    };
  }

  _canCacheUrl(url) {
    return Boolean(this._normalizeUrl(url));
  }

  _normalizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  _extensionFor(contentType, url) {
    const byType = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/tiff': '.tif'
    };
    if (byType[contentType]) return byType[contentType];

    try {
      const ext = path.extname(new URL(url).pathname).toLowerCase();
      if (/^\.(png|jpe?g|webp|gif|svg|tiff?|bmp)$/.test(ext)) return ext;
    } catch {
      // Fall through to default extension.
    }
    return '.img';
  }
}

module.exports = SourceAssetCache;
