# Tereon Project Agent Guide

This file is intentionally mirrored in `CLAUDE.md`. Keep both files byte-for-byte identical when updating project guidance.

## Project Identity

Tereon is a pluggable geospatial research operating foundation. It provides the interactive browser map shell, base geospatial layers, rendering pipeline, sidebar, layer manager, event bus, module loader, and shared inspector, legend, and modal UI.

Domain repositories such as Hydrological Imbalance should remain separate modules. They can be loaded into Tereon by URL through a module manifest instead of being baked into the foundation.

## Goals

- Provide a stable browser-based foundation for spatial research workflows.
- Keep foundation concerns separate from domain modules.
- Support URL-loadable research modules with data, styling, legends, charts, literature panels, and model outputs.
- Keep interaction smooth for global basin-scale visualization.
- Make GitHub Pages usable as a zero-install demo and deployment surface.

## Architecture Boundaries

Tereon owns:

- map canvas and viewport state
- coordinate transform
- foundation basin, country, land, theme, and optional imagery layers
- module manifest import and lifecycle
- shared right inspector, modal, legend, and sidebar structure
- feature hover, click, selection, and cleanup routing

Modules own:

- domain data and metadata
- feature-level joins to foundation geometries
- module-specific rendering enhancements
- module legends and inspector content
- cleanup in `onUnload()`

Modules must not replace the global viewport, mutate foundation coordinate assumptions, or create duplicate base geometry layers when they only need to attach data to existing foundation features.

## Local Commands

- `npm start` starts the local server on `http://127.0.0.1:8791/`.
- `npm run check` runs syntax checks for server and foundation scripts.
- Public frontend code lives under `public/`.
- Server code lives under `src/server/`.

## Development Practices

- Prefer small, scoped changes that match the existing code structure.
- Keep `Light` and `Dark` as UI themes, separate from optional `Imagery`.
- Keep generated or domain-specific data out of the foundation unless it is true foundation geometry.
- Preserve module URL import compatibility.
- After frontend changes, verify locally before deployment.
- Deploy to GitHub Pages only when explicitly requested.
