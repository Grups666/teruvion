# Module Protocol

Tereon modules are loaded through a manifest.

```json
{
  "id": "water-imbalance",
  "name": "Water Imbalance",
  "version": "0.1.1",
  "entry": "./index.js",
  "className": "WaterImbalanceModule",
  "basePath": "https://example.github.io/module-repo/modules/water-imbalance/",
  "datasets": []
}
```

Relative paths in a remote manifest resolve from the manifest URL directory. A module may also define `assetVersion` to force browser cache refresh for its entry script.

## Runtime Contract

A module class receives `(app, manifest)` and may implement:

- `onLoad()`
- `onUnload()`

The module can use Tereon APIs such as:

- `app.layerManager.getLayer(id)`
- `app.registerLegend(id, legend)`
- `app.unregisterLegend(id)`
- `app.showInspector(title, html)`
- `app.draw()`
- `Foundation.eventBus`

## Coordinate Boundary

Modules must not replace the global canvas transform or viewport. If a module renders geometry, it should use the same screen projection as the Foundation map:

```js
const base = (viewport.height / 180) * viewport.scale;
const x = viewport.width / 2 + lon * base + viewport.offsetX;
const y = viewport.height / 2 - lat * base + viewport.offsetY;
```

This keeps domain layers aligned with the Foundation basemap.
