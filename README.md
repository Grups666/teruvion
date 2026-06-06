# Tereon

Tereon is a pluggable geospatial research foundation. It owns the map canvas, base basin geometry, layer manager, sidebar UI, event bus, and module loading protocol.

Domain repositories provide modules. A module can be loaded from a local folder or from a remote `module.json` URL. The first supported remote module is Water Imbalance from Hydro-Imbalance.

## Run locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8791/
```

## Version

Current release: `v0.0.1`

## Module Boundary

Tereon provides:

- Foundation map and HydroBASINS geometry.
- Basemap and basin layer rendering.
- Layer, legend, modal, and inspector UI.
- Module manifest loading.
- Feature click and hover event routing.

Domain modules provide:

- Domain data and metadata.
- Layer styling or layer enhancers.
- Inspector contents and charts.
- Legends and domain-specific panels.

Modules should not mutate the core canvas coordinate system or global viewport. They should render through Tereon's viewport coordinates and restore any enhanced layer state on unload.

See [Module Protocol](docs/module-protocol.md).
