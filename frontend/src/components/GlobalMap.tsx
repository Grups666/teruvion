'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  properties?: Record<string, any>;
  sourceUrl?: string | null;
};

type MapViewPlan = {
  primaryVisual?: string;
  styling?: {
    colorBy?: string | null;
    sizeBy?: string | null;
    palette?: string | null;
  };
  legend?: {
    type?: string;
    title?: string;
    items?: Array<{ value?: string; count?: number }>;
  };
  inspector?: {
    titleFields?: string[];
    metricFields?: Array<{ field: string; role?: string; coverage?: number }>;
    descriptorFields?: string[];
    timeSeriesFields?: string[];
    evidenceFields?: Array<Record<string, any>>;
    resourceFields?: Array<Record<string, any>>;
  };
  diagnostics?: Record<string, any>;
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
const QUALITATIVE_PALETTE = ['#5ecad3', '#f2c85b', '#d98ac3', '#ee8b83', '#7fbf7a', '#7fa6df', '#8d949e', '#c78de0'];

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
  const fittedFeatureSignatureRef = useRef<string | null>(null);
  const renderFeatures = useMemo(
    () => buildRenderFeatures(mapRecomposition, entities),
    [mapRecomposition, entities]
  );
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const diagnostics = mapRecomposition?.map?.diagnostics;
  const viewPlan = (mapRecomposition?.map as any)?.viewPlan as MapViewPlan | undefined;
  const mapLayers = useMemo(
    () => buildDisplayLayers(mapRecomposition?.map?.layers || [], renderFeatures),
    [mapRecomposition, renderFeatures]
  );
  const selectedFeature = useMemo(
    () => renderFeatures.find(feature => feature.id === selectedFeatureId || feature.objectId === selectedEntityId) || null,
    [renderFeatures, selectedFeatureId, selectedEntityId]
  );
  const mapSummary = useMemo(() => buildMapSummary(renderFeatures), [renderFeatures]);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = L.map(containerRef.current, {
      center: [18, 8],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
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
      const layer = renderFeature(feature, selectedFeature?.id || selectedEntityId, viewPlan, (selected) => {
        setSelectedFeatureId(selected.id);
        if (selected.objectId) onSelectEntity(selected.objectId);
      });
      if (!layer) continue;
      layer.addTo(layerGroup);
      extendBounds(bounds, feature);
    }

    const featureSignature = renderFeatures.map(feature => feature.id).join('|');
    if (bounds.isValid() && featureSignature !== fittedFeatureSignatureRef.current) {
      map.fitBounds(bounds.pad(0.16), { animate: false, maxZoom: 6 });
      fittedFeatureSignatureRef.current = featureSignature;
    }
  }, [renderFeatures, selectedEntityId, selectedFeature, viewPlan, onSelectEntity]);

  return (
    <div className="global-map-root">
      <div ref={containerRef} className="global-map-canvas" />

      <section className="global-map-intelligence" aria-label="Global map intelligence summary">
        {selectedFeature ? (
          <FeatureInspector feature={selectedFeature} viewPlan={viewPlan} onClose={() => setSelectedFeatureId(null)} />
        ) : (
          <>
            <div className="global-map-kicker">Global Map</div>
            <h2>{formatPrimaryMode(viewPlan?.primaryVisual || mapRecomposition?.map?.primaryMode || 'global-source-overview')}</h2>
            <p className="global-map-summary">{mapSummary.sentence}</p>
            <MapLegend viewPlan={viewPlan} />
            <div className="global-map-metrics">
              <div>
                <span>Features</span>
                <strong>{diagnostics?.renderableAnchorCount ?? renderFeatures.length}</strong>
              </div>
              <div>
                <span>Geometry</span>
                <strong>{mapSummary.geometryKinds.length}</strong>
              </div>
              <div>
                <span>Fields</span>
                <strong>{mapSummary.fieldCount}</strong>
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
          </>
        )}
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
    provenance: item.provenance || null,
    properties: item.properties || {},
    sourceUrl: item.sourceUrl || item.provenance?.sourceUrl || null
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
    provenance: entity.metadata?.provenance || null,
    properties: attributes.properties || attributes,
    sourceUrl: attributes.sourceUrl || entity.metadata?.sourceUrl || null
  };
}

function renderFeature(
  feature: RenderFeature,
  selectedId: string | null,
  viewPlan: MapViewPlan | undefined,
  onSelectFeature: (feature: RenderFeature) => void
) {
  const isSelected = feature.id === selectedId || feature.objectId === selectedId;
  if (feature.point) {
    const color = featureColor(feature, viewPlan);
    const numeric = primaryNumericMetric(feature.properties || {}, viewPlan);
    const marker = L.circleMarker([feature.point.lat, feature.point.lon], {
      radius: isSelected ? 8 : Math.max(4.5, Math.min(11, 4.5 + (numeric?.normalized || 0) * 6)),
      fillColor: isSelected ? '#0f172a' : color.fill,
      fillOpacity: isSelected ? 0.96 : 0.72,
      weight: isSelected ? 2.4 : 1.1,
      color: isSelected ? '#0f172a' : color.stroke,
      opacity: isSelected ? 1 : 0.82,
      bubblingMouseEvents: true,
    });
    marker.bindPopup(buildFeaturePopupHtml(feature), { closeButton: false });
    marker.on('click', () => onSelectFeature(feature));
    return marker;
  }

  if (feature.geometry) {
    const style = featureColor(feature, viewPlan);
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
    geoJson.on('click', () => onSelectFeature(feature));
    return geoJson;
  }

  return null;
}

function FeatureInspector({ feature, viewPlan, onClose }: { feature: RenderFeature; viewPlan?: MapViewPlan; onClose: () => void }) {
  const properties = feature.properties || {};
  const metrics = selectMetrics(properties, viewPlan).slice(0, 4);
  const descriptors = selectDescriptors(properties, viewPlan).slice(0, 8);
  const series = selectSeries(properties, viewPlan).slice(0, 3);
  const category = categoricalValue(properties, viewPlan);

  return (
    <>
      <button className="global-map-inspector-close" type="button" onClick={onClose} aria-label="Close map detail">x</button>
      <div className="global-map-kicker">{formatPrimaryMode(feature.primitive)}</div>
      <h2>{feature.label}</h2>
      <p className="global-map-summary">
        {feature.sourceTitle || feature.type}
        {category ? ` - ${humanizeKey(category.label)}: ${category.value}` : ''}
      </p>

      {metrics.length > 0 ? (
        <div className="global-map-metrics feature-metrics">
          {metrics.map(metric => (
            <div key={metric.key}>
              <span>{humanizeKey(metric.key)}</span>
              <strong>{formatMetric(metric.value)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {descriptors.length > 0 ? (
        <div className="global-map-field-list">
          <div className="global-map-section-title">Attributes</div>
          {descriptors.map(item => (
            <div className="global-map-field" key={item.key}>
              <span>{humanizeKey(item.key)}</span>
              <strong>{String(item.value)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {series.length > 0 ? (
        <div className="global-map-series">
          <div className="global-map-section-title">Time Series / Multi Value</div>
          <svg viewBox="0 0 280 96" role="img" aria-label="Feature series preview">
            {series.map((item, index) => (
              <polyline
                key={item.key}
                points={sparklinePoints(item.values, 280, 96)}
                fill="none"
                stroke={QUALITATIVE_PALETTE[index % QUALITATIVE_PALETTE.length]}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          <div className="global-map-series-legend">
            {series.map((item, index) => (
              <span key={item.key}><i style={{ background: QUALITATIVE_PALETTE[index % QUALITATIVE_PALETTE.length] }} />{humanizeKey(item.key)}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="global-map-field-list compact">
        <div className="global-map-section-title">Trace</div>
        <div className="global-map-field">
          <span>Type</span>
          <strong>{feature.type}</strong>
        </div>
        {typeof feature.confidence === 'number' ? (
          <div className="global-map-field">
            <span>Confidence</span>
            <strong>{Math.round(feature.confidence * 100)}%</strong>
          </div>
        ) : null}
        {feature.sourceUrl ? (
          <a className="global-map-source-link" href={feature.sourceUrl} target="_blank" rel="noreferrer">Open source</a>
        ) : null}
      </div>
    </>
  );
}

function MapLegend({ viewPlan }: { viewPlan?: MapViewPlan }) {
  const legend = viewPlan?.legend;
  if (!legend?.title && !legend?.items?.length) return null;
  return (
    <div className="global-map-legend" aria-label="Map legend">
      <div className="global-map-section-title">{legend.type || 'Legend'}</div>
      <strong>{legend.title || 'Map signal'}</strong>
      {legend.items?.length ? (
        <div className="global-map-legend-items">
          {legend.items.slice(0, 8).map((item, index) => (
            <span key={`${item.value || 'value'}-${index}`}>
              <i style={{ background: QUALITATIVE_PALETTE[index % QUALITATIVE_PALETTE.length] }} />
              {item.value || 'Value'}{typeof item.count === 'number' ? ` (${item.count})` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
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

function buildMapSummary(features: RenderFeature[]) {
  const geometryKinds = Array.from(new Set(features.map(feature => feature.point ? 'point' : feature.geometry?.type || 'unknown')));
  const fields = new Set<string>();
  for (const feature of features) {
    for (const key of Object.keys(feature.properties || {})) fields.add(key);
  }
  const firstCategory = categoricalValue(features.find(feature => categoricalValue(feature.properties || {}))?.properties || {});
  return {
    geometryKinds,
    fieldCount: fields.size,
    sentence: features.length > 0
      ? `${features.length} spatial features assembled from source-grounded objects${firstCategory ? `, including ${humanizeKey(firstCategory.label)} categories` : ''}. Click a feature to inspect its attached data.`
      : 'No spatial feature has been assembled yet.'
  };
}

function featureColor(feature: RenderFeature, viewPlan?: MapViewPlan) {
  const base = PRIMITIVE_STYLES[feature.primitive] || DEFAULT_STYLE;
  const category = categoricalValue(feature.properties || {}, viewPlan);
  if (!category) return base;
  const hash = stableHash(`${category.label}:${category.value}`);
  const fill = QUALITATIVE_PALETTE[hash % QUALITATIVE_PALETTE.length];
  return {
    ...base,
    fill,
    stroke: shadeColor(fill, -28),
    opacity: feature.point ? 0.76 : Math.max(base.opacity, 0.34)
  };
}

function categoricalValue(properties: Record<string, any>, viewPlan?: MapViewPlan) {
  const colorBy = viewPlan?.styling?.colorBy;
  if (colorBy && properties[colorBy] !== undefined && properties[colorBy] !== null && properties[colorBy] !== '') {
    return { label: colorBy, value: String(properties[colorBy]) };
  }
  const entries = Object.entries(properties).filter(([, value]) => value !== null && value !== undefined && value !== '');
  const preferred = entries.find(([key, value]) => {
    const text = key.toLowerCase();
    return ['class', 'category', 'status', 'group', 'type', 'cluster', 'region', 'continent'].some(token => text.includes(token))
      && typeof value !== 'object';
  });
  const fallback = entries.find(([, value]) => typeof value === 'string' || typeof value === 'boolean');
  const match = preferred || fallback;
  return match ? { label: match[0], value: String(match[1]) } : null;
}

function numericMetrics(properties: Record<string, any>) {
  return Object.entries(properties)
    .map(([key, value]) => ({ key, value: Number(value) }))
    .filter(item => Number.isFinite(item.value));
}

function primaryNumericMetric(properties: Record<string, any>, viewPlan?: MapViewPlan) {
  const sizeBy = viewPlan?.styling?.sizeBy;
  const planned = sizeBy ? numericMetrics(properties).find(metric => metric.key === sizeBy) : null;
  const metric = planned || numericMetrics(properties)[0];
  if (!metric) return null;
  const magnitude = Math.log10(Math.abs(metric.value) + 1);
  return { ...metric, normalized: Math.max(0, Math.min(1, magnitude / 6)) };
}

function descriptorFields(properties: Record<string, any>) {
  return Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .filter(([, value]) => !Array.isArray(value) && typeof value !== 'object')
    .filter(([key]) => !numericMetrics({ [key]: properties[key] }).length)
    .slice(0, 8)
    .map(([key, value]) => ({ key, value }));
}

function selectMetrics(properties: Record<string, any>, viewPlan?: MapViewPlan) {
  const planned = viewPlan?.inspector?.metricFields
    ?.map(item => numericMetrics(properties).find(metric => metric.key === item.field))
    .filter(Boolean) as Array<{ key: string; value: number }> | undefined;
  return planned?.length ? planned : numericMetrics(properties);
}

function selectDescriptors(properties: Record<string, any>, viewPlan?: MapViewPlan) {
  const plannedFields = viewPlan?.inspector?.descriptorFields || [];
  const planned = plannedFields
    .filter(field => properties[field] !== undefined && properties[field] !== null && properties[field] !== '')
    .filter(field => !Array.isArray(properties[field]) && typeof properties[field] !== 'object')
    .map(field => ({ key: field, value: properties[field] }));
  return planned.length ? planned : descriptorFields(properties);
}

function selectSeries(properties: Record<string, any>, viewPlan?: MapViewPlan) {
  const plannedFields = viewPlan?.inspector?.timeSeriesFields || [];
  const planned = plannedFields
    .filter(field => Array.isArray(properties[field]))
    .map(field => ({ key: field, values: (properties[field] as any[]).map(Number).filter(Number.isFinite) }))
    .filter(item => item.values.length >= 3);
  return planned.length ? planned : timeSeriesFields(properties);
}

function timeSeriesFields(properties: Record<string, any>) {
  return Object.entries(properties)
    .filter(([, value]) => Array.isArray(value) && value.length >= 3)
    .map(([key, value]) => ({
      key,
      values: (value as any[]).map(Number).filter(Number.isFinite)
    }))
    .filter(item => item.values.length >= 3);
}

function sparklinePoints(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 12 - ((value - min) / span) * (height - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function formatMetric(value: number) {
  if (Math.abs(value) >= 1000000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function humanizeKey(key: string) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function shadeColor(hex: string, amount: number) {
  const clean = hex.replace('#', '');
  const number = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, (number >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((number >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (number & 0x0000ff) + amount));
  return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
}

function suppressAggregateCoverage(features: RenderFeature[]) {
  const concreteFeatureCount = features.filter(feature => !isAggregateCoverageFeature(feature)).length;
  if (concreteFeatureCount < 8) return features;

  return features.filter(feature => {
    return !isAggregateCoverageFeature(feature);
  });
}

function isAggregateCoverageFeature(feature: RenderFeature) {
  const isBboxOnlyRegion = feature.geometry?.type === 'Polygon' && feature.bbox && !feature.point;
  const isSourceLevel = /source|paper|datasetpage|repository|sourceobject/i.test(feature.type || '');
  const propertyKeys = Object.keys(feature.properties || {});
  const hasOnlySourceIdentityFields = propertyKeys.length > 0
    && propertyKeys.every(key => ['identifier', 'title', 'type', 'url', 'id', 'name'].includes(key));
  return Boolean(isBboxOnlyRegion && isSourceLevel && hasOnlySourceIdentityFields);
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
    <div class="gm-popup-meta">${escapeHtml(feature.type)} - ${escapeHtml(confidence)}</div>
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
