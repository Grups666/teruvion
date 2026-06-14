/**
 * SourceAssetCache tests
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assert, describe, it } = require('../setup');
const SourceAssetCache = require('../../core/source/SourceAssetCache');

function startImageServer() {
  const imageBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d
  ]);

  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url === '/figure.png') {
        res.writeHead(200, {
          'content-type': 'image/png',
          'content-length': imageBytes.length
        });
        res.end(imageBytes);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/figure.png` });
    });
  });
}

describe('SourceAssetCache', () => {
  it('should cache source figure images and preserve original URLs', async () => {
    const { server, url } = await startImageServer();
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teruvion-assets-'));
    const cache = new SourceAssetCache({
      rootDir,
      publicPrefix: '/assets/source-assets',
      timeout: 5000
    });

    try {
      const visuals = [{
        kind: 'figure',
        label: 'Figure 1',
        imageUrl: url
      }, {
        kind: 'table',
        label: 'Table 1',
        imageUrl: url
      }];

      await cache.cacheVisualEvidence(visuals);

      assert.ok(visuals[0].imageUrl.startsWith('/assets/source-assets/'), 'Should rewrite image URL to local asset URL');
      assert.strictEqual(visuals[0].originalImageUrl, url, 'Should preserve original image URL');
      assert.strictEqual(visuals[0].cachedImage.contentType, 'image/png');
      assert.ok(fs.existsSync(path.join(rootDir, visuals[0].cachedImage.path)), 'Should write cached image');
      assert.strictEqual(visuals[1].imageUrl, url, 'Should not cache table image placeholders');
    } finally {
      server.close();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
