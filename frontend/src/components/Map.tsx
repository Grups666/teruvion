'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Entity } from '../types/api';
import type { EntityLayer } from '../types/api';
import { getEntityLayer } from '../types/api';

interface MapProps {
  entities: Entity[];
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
}

type MarkerColor = { fill: string; stroke: string };
type MapPoint = { lat: number; lon: number };

const LAYER_MARKER_COLORS: Record<EntityLayer, MarkerColor> = {
  world: { fill: '#22c55e', stroke: '#16a34a' },
  capability: { fill: '#8b5cf6', stroke: '#7c3aed' },
  source: { fill: '#f59e0b', stroke: '#d97706' },
  foundation: { fill: '#6b7280', stroke: '#4b5563' },
  domain: { fill: '#06b6d4', stroke: '#0891b2' },
  extension: { fill: '#ec4899', stroke: '#db2777' },
  unknown: { fill: '#6b7280', stroke: '#4b5563' },
};

const DEFAULT_MARKER_COLOR = LAYER_MARKER_COLORS.foundation;

export default function MapComponent({ entities, selectedEntityId, onSelectEntity }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 12,
      maxBounds: [[-90, -Infinity], [90, Infinity]],
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: false,
    });

    // Carto provides a clean global basemap. If an edge server misses a tile,
    // retry the same z/x/y coordinate from OpenStreetMap instead of leaving a gap.
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

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => mapRef.current?.invalidateSize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach(m => m.remove());
    const newMarkers: L.CircleMarker[] = [];

    const spatialEntities = entities
      .map(entity => ({ entity, point: getEntityMapPoint(entity) }))
      .filter((item): item is { entity: Entity; point: MapPoint } => Boolean(item.point));

    spatialEntities.forEach(({ entity, point }) => {
      const isSelected = entity.id === selectedEntityId;
      const layer = getEntityLayer(entity);
      const color = LAYER_MARKER_COLORS[layer] || DEFAULT_MARKER_COLOR;

      const marker = L.circleMarker([point.lat, point.lon], {
        radius: isSelected ? 12 : 8,
        fillColor: isSelected ? '#0a0a0a' : color.fill,
        fillOpacity: isSelected ? 1 : 0.8,
        weight: isSelected ? 3 : 2,
        color: isSelected ? '#0a0a0a' : color.stroke,
      }).addTo(map);

      marker.bindPopup(buildEntityPopupHtml(entity), { closeButton: false });

      marker.on('click', () => onSelectEntity(entity.id));

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;
  }, [entities, selectedEntityId, onSelectEntity]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#fafafa',
      }}
    />
  );
}

function getEntityMapPoint(entity: Entity): MapPoint | null {
  const attributes = entity.attributes || {};
  const bboxPoint = pointFromBbox(attributes.bbox);
  if (bboxPoint) return bboxPoint;

  return pointFromCoordinateValue(
    attributes.centroid ||
    attributes.location ||
    attributes.coordinates ||
    attributes.spatialCoverage
  );
}

function pointFromBbox(value: unknown): MapPoint | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [minLon, minLat, maxLon, maxLat] = value.map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;
  if (minLon === 0 && minLat === 0 && maxLon === 0 && maxLat === 0) return null;

  return {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2
  };
}

function pointFromCoordinateValue(value: unknown): MapPoint | null {
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

function buildEntityPopupHtml(entity: Entity) {
  const title = escapeHtml(String(entity.attributes?.name || entity.id));
  const subtitle = escapeHtml(entity.category ? `${entity.type} - ${entity.category}` : entity.type);

  return `<div style="padding:8px 12px;font-size:13px;line-height:1.5">
    <div style="font-weight:600;margin-bottom:4px">${title}</div>
    <div style="font-size:11px;color:#a3a3a3">${subtitle}</div>
  </div>`;
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
