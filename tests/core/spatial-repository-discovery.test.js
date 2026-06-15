/**
 * SpatialRepositoryDiscovery tests
 */

const assert = require('assert');
const { describe, it } = require('../setup');
const SpatialRepositoryDiscovery = require('../../core/connectors/SpatialRepositoryDiscovery');

describe('SpatialRepositoryDiscovery', () => {
  it('discovers bounded Zenodo spatial files from repository metadata', async () => {
    const discovery = new SpatialRepositoryDiscovery({
      fetch: async () => okJson({
        files: [
          { key: '1_DDSA_Dam Information.csv', size: 114503, links: { self: 'https://zenodo.org/api/records/4315647/files/1.csv/content' } },
          { key: '6_ddsa_dams.zip', size: 116958, links: { self: 'https://zenodo.org/api/records/4315647/files/6.zip/content' } },
          { key: 'readme.txt', size: 1200, links: { self: 'https://zenodo.org/readme.txt' } }
        ]
      })
    });

    const result = await discovery.discover({
      url: 'https://zenodo.org/records/4315647',
      type: 'dataset',
      label: 'DDSA Zenodo archive'
    });

    assert.strictEqual(result.status, 'discovered');
    assert.strictEqual(result.platform, 'zenodo');
    assert.strictEqual(result.resources.length, 2);
    assert.ok(result.resources.some(resource => resource.format === 'shapefile'));
    assert.ok(result.resources.every(resource => resource.samplingEligible));
    assert.ok(result.resources[0].provenance.parentResourceUrl.includes('zenodo.org'));
  });

  it('discovers Zenodo records when papers cite them through DOI URLs', async () => {
    let requestedUrl = '';
    const discovery = new SpatialRepositoryDiscovery({
      fetch: async (url) => {
        requestedUrl = url;
        return okJson({
          files: [
            { key: '6_ddsa_dams.zip', size: 116958, links: { self: 'https://zenodo.org/api/records/4315647/files/6.zip/content' } }
          ]
        });
      }
    });

    const result = await discovery.discover({
      url: 'https://doi.org/10.5281/zenodo.4315647',
      type: 'dataset',
      label: 'DDSA data DOI'
    });

    assert.strictEqual(requestedUrl, 'https://zenodo.org/api/records/4315647');
    assert.strictEqual(result.status, 'discovered');
    assert.strictEqual(result.resources[0].format, 'shapefile');
  });

  it('keeps large OSF spatial archives visible without marking them sampling eligible', async () => {
    const discovery = new SpatialRepositoryDiscovery({
      maxRepositoryBytes: 16 * 1024 * 1024,
      fetch: async () => okJson({
        data: [{
          attributes: {
            kind: 'file',
            name: 'GRILSS_v1.2.zip',
            size: 69402561
          },
          links: {
            download: 'https://osf.io/download/v74yz/',
            html: 'https://osf.io/w4ug8/files/osfstorage/68d8b938dcec115ea6432d57'
          }
        }]
      })
    });

    const result = await discovery.discover({
      url: 'https://osf.io/w4ug8/',
      type: 'dataset'
    });

    assert.strictEqual(result.status, 'discovered');
    assert.strictEqual(result.resources[0].format, 'shapefile');
    assert.strictEqual(result.resources[0].samplingEligible, false);
    assert.ok(result.resources[0].reviewHint.includes('exceeds bounded sampling limit'));
  });

  it('bounds Hugging Face repository crawling and emits direct file candidates', async () => {
    const requested = [];
    const discovery = new SpatialRepositoryDiscovery({
      fetch: async (url) => {
        requested.push(url);
        if (url.includes('/tree/main?')) {
          return okJson([
            { type: 'directory', path: 'paper_plot_tifs' },
            { type: 'directory', path: 'N00' },
            { type: 'file', path: 'README.md', size: 1000 }
          ]);
        }
        if (url.includes('/tree/main/paper_plot_tifs')) {
          return okJson([
            { type: 'file', path: 'paper_plot_tifs/example-flood-map.tif', size: 600000 }
          ]);
        }
        return okJson([]);
      }
    });

    const result = await discovery.discover({
      url: 'https://huggingface.co/datasets/ai-for-good-lab/ai4g-flood-dataset',
      type: 'dataset'
    });

    assert.strictEqual(result.status, 'discovered');
    assert.strictEqual(result.resources[0].format, 'geotiff');
    assert.ok(result.resources[0].url.includes('/resolve/main/paper_plot_tifs/example-flood-map.tif'));
    assert.ok(result.diagnostics.bounded);
    assert.ok(requested.length <= 4);
  });
});

function okJson(value) {
  return {
    ok: true,
    status: 200,
    async json() {
      return value;
    }
  };
}
