# Module Protocol

Teruvion modules are loaded through a manifest.

```json
{
  "id": "example-module",
  "name": "Example Module",
  "version": "0.1.0",
  "entry": "./index.js",
  "className": "ExampleModule",
  "basePath": "https://example.github.io/module-repo/modules/example-module/",
  "datasets": []
}
```

Relative paths in a remote manifest resolve from the manifest URL directory. A module may also define `assetVersion` to force browser cache refresh for its entry script.

## Remote Import

The Teruvion frontend can import a module from:

- A direct `module.json` URL.
- A GitHub `blob/.../module.json` URL.
- A GitHub repository URL when the manifest can be inferred from common Pages or raw GitHub locations.

For GitHub Pages, the recommended layout is:

```text
https://owner.github.io/repo/modules/module-id/module.json
```

The domain repository can remain headless. It only needs to publish the manifest, entry script, and any referenced data files.

## Runtime Contract

A module class receives `(app, manifest)` and may implement:

- `onLoad()`
- `onUnload()`

The module can use Teruvion APIs such as:

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
