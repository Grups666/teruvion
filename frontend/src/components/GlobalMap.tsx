'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import type { Entity, EntityLayer, ProjectMapRecomposition } from '../types/api';
import { getEntityLayer } from '../types/api';

interface GlobalMapProps {
  entities: Entity[];
  mapRecomposition?: ProjectMapRecomposition | null;
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
}

type MarkerColor = { fill: string; stroke: string };
type MapPoint = { lat: number; lon: number };
type RenderFeature = {
  id: string;
  objectId: string | null;
  label: string;
  type: string;
  primitive: string;
  sourceTitle?: string;
  geometry?: GeoJSON.Geometry | null;
  point?: MapPoint | null;
  bbox?: [number, number, number, number] | null;
  confidence?: number | null;
  provenance?: Record<string, any> | null;
};

const LAYER_MARKER_COLORS: Record<EntityLayer, MarkerColor> = {
  world: { fill: '#0f9f8f', stroke: '#0f766e' },
  capability: { fill: '#4f46e5', stroke: '#3730a3' },
  source: { fill: '#c47a1d', stroke: '#9a5b13' },
  foundation: { fill: '#64748b', stroke: '#475569' },
  domain: { fill: '#0e7490', stroke: '#155e75' },
  extension: { fill: '#be185d', stroke: '#9d174d' },
  unknown: { fill: '#64748b', stroke: '#475569' },
};

const PRIMITIVE_STYLES: Record<string, { fill: string; stroke: string; weight: number; opacity: number }> = {
  'classified-area-layer': { fill: '#0f766e', stroke: '#0f3f3a', weight: 1.4, opacity: 0.26 },
  'region-layer': { fill: '#2563eb', stroke: '#1d4ed8', weight: 1.2, opacity: 0.13 },
  'raster-layer': { fill: '#7c3aed', stroke: '#6d28d9', weight: 1.1, opacity: 0.18 },
  'point-layer': { fill: '#0f766e', stroke: '#134e4a', weight: 1.5, opacity: 0.78 },
  'route-or-flow-layer': { fill: '#334155', stroke: '#334155', weight: 2, opacity: 0.2 },
  'spatial-anchor': { fill: '#64748b', stroke: '#475569', weight: 1, opacity: 0.12 },
};

const DEFAULT_STYLE = PRIMITIVE_STYLES['spatial-anchor'];
const DEFAULT_MARKER_COLOR = LAYER_MARKER_COLORS.foundation;

export default function GlobalMap({
  entities,
  mapRecomposition,
  selectedEntityId,
  onSelectEntity
}: GlobalMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const renderFeatures = useMemo(
    () => buildRenderFeatures(mapRecomposition, entities),
    [mapRecomposition, entities]
  );
  const diagnostics = mapRecomposition?.map?.diagnostics;
  const mapLayers = useMemo(
    () => buildDisplayLayers(mapRecomposition?.map?.layers || [], renderFeatures),
    [mapRecomposition, renderFeatures]
  );

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = L.map(containerRef.current, {
      center: [18, 8],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      maxBounds: [[-85.0511, -180], [85.0511, 180]],
      maxBoundsViscosity: 1.0,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: false,
    });

    const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'bcd',
      maxZoom: 19,
      crossOrigin: true,
    });

    tileLayer.on('tileerror', (event: L.TileErrorEvent) => {
      const tile = event.tile as HTMLImageElement & { dataset: DOMStringMap };
      if (tile.dataset.fallbackApplied) return;
      tile.dataset.fallbackApplied = 'true';
      tile.src = `https://tile.openstreetmap.org/${event.coords.z}/${event.coords.x}/${event.coords.y}.png`;
    });

    tileLayer.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => mapRef.current?.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const map = mapRef.current;
    const layerGroup = layerRef.current;
    const bounds = L.latLngBounds([]);

    layerGroup.clearLayers();

    for (const feature of renderFeatures) {
      const layer = renderFeature(feature, selectedEntityId, onSelectEntity);
      if (!layer) continue;
      layer.addTo(layerGroup);
      extendBounds(bounds, feature);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.16), { animate: false, maxZoom: 6 });
    }
  }, [renderFeatures, selectedEntityId, onSelectEntity]);

  return (
    <div className="global-map-root">
      <div ref={containerRef} className="global-map-canvas" />

      <section className="global-map-intelligence" aria-label="Global map intelligence summary">
        <div className="global-map-kicker">Global Map</div>
        <h2>{formatPrimaryMode(mapRecomposition?.map?.primaryMode || 'global-source-overview')}</h2>
        <div className="global-map-metrics">
          <div>
            <span>Anchors</span>
            <strong>{diagnostics?.renderableAnchorCount ?? renderFeatures.length}</strong>
          </div>
          <div>
            <span>Results</span>
            <strong>{diagnostics?.resultCount ?? 0}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>{diagnostics?.attachmentCount ?? 0}</strong>
          </div>
        </div>
        <div className="global-map-layer-list">
          {mapLayers.slice(0, 4).map(layer => (
            <div key={layer.id} className="global-map-layer">
              <span style={{ background: layerSwatch(layer.displayPrimitive) }} />
              <div>
                <strong>{layer.label}</strong>
                <small>{layer.resultCount || 0} results / {layer.anchorCount || 0} anchors</small>
              </div>
            </div>
          ))}
          {mapLayers.length === 0 && (
            <p>{diagnostics?.warnings?.[0] || 'No map-ready layer has been assembled yet.'}</p>
          )}
        </div>
      </section>

      {diagnostics?.warnings?.length ? (
        <section className="global-map-review" aria-label="Map review notice">
          <span>Review</span>
          <p>{diagnostics.warnings[0]}</p>
        </section>
      ) : null}
    </div>
  );
}

function buildRenderFeatures(
  mapRecomposition: ProjectMapRecomposition | null | undefined,
  entities: Entity[]
): RenderFeature[] {
  const recomposed = [
    ...((mapRecomposition?.map?.anchors || []) as any[]),
    ...((mapRecomposition?.map?.results || []) as any[]).filter(result => result.renderability === 'renderable-now')
  ]
    .map(item => featureFromRecomposition(item))
    .filter((feature): feature is RenderFeature => Boolean(feature));

  if (recomposed.length > 0) return suppressAggregateCoverage(recomposed);

  return entities
    .map(entity => featureFromEntity(entity))
    .filter((feature): feature is RenderFeature => Boolean(feature));
}

function featureFromRecomposition(item: any): RenderFeature | null {
  const spatial = item.spatial || {};
  const rawGeometry = spatial.geometry || null;
  const point = normalizePoint(spatial.point) || pointFromGeometry(rawGeometry);
  const geometry = point ? null : rawGeometry || geometryFromBbox(spatial.bbox) || null;
  if (!geometry && !point) return null;

  return {
    id: item.id || item.objectId || item.label,
    objectId: item.objectId || null,
    label: item.label || item.objectType || 'Map item',
    type: item.objectType || item.type || 'Entity',
    primitive: item.displayPrimitive || 'spatial-anchor',
    sourceTitle: item.sourceTitle,
    geometry,
    point,
    bbox: normalizeBbox(spatial.bbox),
    confidence: item.confidence ?? null,
    provenance: item.provenance || null
  };
}

function featureFromEntity(entity: Entity): RenderFeature | null {
  const attributes = entity.attributes || {};
  const bbox = normalizeBbox(attributes.bbox || attributes.spatialCoverage);
  const rawGeometry = attributes.geometry || null;
  const point = normalizePoint(attributes.centroid || attributes.location || attributes.coordinates || attributes.spatialCoverage)
    || pointFromGeometry(rawGeometry);
  const geometry = point ? null : rawGeometry || geometryFromBbox(bbox);
  if (!geometry && !point) return null;

  return {
    id: entity.id,
    objectId: entity.id,
    label: String(attributes.name || attributes.title || entity.name || entity.id),
    type: entity.type,
    primitive: geometry ? 'region-layer' : 'point-layer',
    geometry,
    point,
    bbox,
    confidence: entity.metadata?.confidence ?? null,
    provenance: entity.metadata?.provenance || null
  };
}

function renderFeature(
  feature: RenderFeature,
  selectedEntityId: string | null,
  onSelectEntity: (id: string) => void
) {
  const isSelected = feature.objectId === selectedEntityId;
  if (feature.point) {
    const color = PRIMITIVE_STYLES[feature.primitive] || PRIMITIVE_STYLES['point-layer'];
    const marker = L.circleMarker([feature.point.lat, feature.point.lon], {
      radius: isSelected ? 8 : 4.8,
      fillColor: isSelected ? '#0f172a' : color.fill,
      fillOpacity: isSelected ? 0.96 : 0.72,
      weight: isSelected ? 2.4 : 1.1,
      color: isSelected ? '#0f172a' : color.stroke,
      opacity: isSelected ? 1 : 0.82,
      bubblingMouseEvents: true,
    });
    marker.bindPopup(buildFeaturePopupHtml(feature), { closeButton: false });
    if (feature.objectId) {
      marker.on('click', () => onSelectEntity(feature.objectId!));
    }
    return marker;
  }

  if (feature.geometry) {
    const style = PRIMITIVE_STYLES[feature.primitive] || DEFAULT_STYLE;
    const geoJson = L.geoJSON(feature.geometry as any, {
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: isSelected ? 8 : 4.8,
        fillColor: isSelected ? '#0f172a' : (PRIMITIVE_STYLES['point-layer'] || DEFAULT_STYLE).fill,
        fillOpacity: isSelected ? 0.96 : 0.72,
        weight: isSelected ? 2.4 : 1.1,
        color: isSelected ? '#0f172a' : (PRIMITIVE_STYLES['point-layer'] || DEFAULT_STYLE).stroke,
        opacity: isSelected ? 1 : 0.82,
      }),
      style: {
        color: isSelected ? '#0f172a' : style.stroke,
        weight: isSelected ? style.weight + 1.5 : style.weight,
        opacity: 0.92,
        fillColor: style.fill,
        fillOpacity: isSelected ? Math.min(style.opacity + 0.18, 0.52) : style.opacity,
      }
    });
    geoJson.bindPopup(buildFeaturePopupHtml(feature), { closeButton: false });
    if (feature.objectId) {
      geoJson.on('click', () => onSelectEntity(feature.objectId!));
    }
    return geoJson;
  }

  return null;
}

function buildDisplayLayers(layers: any[], features: RenderFeature[]) {
  if (layers.length > 0) return layers;
  const counts = new Map<string, number>();
  for (const feature of features) {
    const primitive = feature.primitive || (feature.point ? 'point-layer' : 'region-layer');
    counts.set(primitive, (counts.get(primitive) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([primitive, count]) => ({
    id: primitive,
    displayPrimitive: primitive,
    label: formatPrimaryMode(primitive),
    anchorCount: count,
    resultCount: 0,
  }));
}

function suppressAggregateCoverage(features: RenderFeature[]) {
  const pointCount = features.filter(feature => feature.point).length;
  if (pointCount < 8) return features;

  return features.filter(feature => {
    const isBboxOnlyRegion = feature.geometry?.type === 'Polygon' && feature.bbox && !feature.point;
    const isSourceLevel = /source|paper|datasetpage|repository|sourceobject/i.test(feature.type || '');
    return !(isBboxOnlyRegion && isSourceLevel);
  });
}

function pointFromGeometry(value: unknown): MapPoint | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as GeoJSON.Geometry;
  if (geometry.type !== 'Point') return null;
  return normalizePoint((geometry as GeoJSON.Point).coordinates);
}

function extendBounds(bounds: L.LatLngBounds, feature: RenderFeature) {
  if (feature.bbox) {
    bounds.extend([feature.bbox[1], feature.bbox[0]]);
    bounds.extend([feature.bbox[3], feature.bbox[2]]);
    return;
  }

  if (feature.point) {
    bounds.extend([feature.point.lat, feature.point.lon]);
    return;
  }

  if (feature.geometry) {
    const coords = extractCoordinates(feature.geometry);
    for (const [lon, lat] of coords) {
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        bounds.extend([lat, lon]);
      }
    }
  }
}

function geometryFromBbox(value: unknown): GeoJSON.Polygon | null {
  const bbox = normalizeBbox(value);
  if (!bbox) return null;
  return {
    type: 'Polygon',
    coordinates: [[
      [bbox[0], bbox[1]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
      [bbox[0], bbox[3]],
      [bbox[0], bbox[1]]
    ]]
  };
}

function normalizeBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const bbox = value.slice(0, 4).map(Number);
  if (!bbox.every(Number.isFinite)) return null;
  return bbox as [number, number, number, number];
}

function normalizePoint(value: unknown): MapPoint | null {
  const coordinates = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { coordinates?: unknown }).coordinates)
      ? (value as { coordinates: unknown[] }).coordinates
      : null;
  if (!coordinates || coordinates.length < 2) return null;
  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function extractCoordinates(geometry: GeoJSON.Geometry): Array<[number, number]> {
  if (geometry.type === 'Point') return [geometry.coordinates as [number, number]];
  if (geometry.type === 'LineString') return geometry.coordinates as Array<[number, number]>;
  if (geometry.type === 'Polygon') return geometry.coordinates.flat() as Array<[number, number]>;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2) as Array<[number, number]>;
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat() as Array<[number, number]>;
  return [];
}

function buildFeaturePopupHtml(feature: RenderFeature) {
  const confidence = typeof feature.confidence === 'number'
    ? `${Math.round(feature.confidence * 100)}% confidence`
    : 'confidence not stated';
  const source = feature.sourceTitle ? `<div class="gm-popup-source">${escapeHtml(feature.sourceTitle)}</div>` : '';
  return `<div class="gm-popup">
    <div class="gm-popup-kicker">${escapeHtml(formatPrimaryMode(feature.primitive))}</div>
    <div class="gm-popup-title">${escapeHtml(feature.label)}</div>
    <div class="gm-popup-meta">${escapeHtml(feature.type)} · ${escapeHtml(confidence)}</div>
    ${source}
  </div>`;
}

function formatPrimaryMode(value: string) {
  return String(value || 'global-source-overview')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function layerSwatch(primitive: string) {
  return (PRIMITIVE_STYLES[primitive] || DEFAULT_STYLE).fill;
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  let escaped = '';
  for (const char of value) {
    escaped += replacements[char] || char;
  }
  return escaped;
}
