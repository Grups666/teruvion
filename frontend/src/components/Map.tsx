'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Entity } from '../types/api';
import { getEntityLayer } from '../types/api';

interface MapProps {
  entities: Entity[];
  selectedEntityId: string | null;
  onSelectEntity: (id: string) => void;
}

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
      zoomControl: true,
      attributionControl: false,
    });

    // Minimalist tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

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

    const spatialEntities = entities.filter(e => {
      const bbox = e.attributes?.bbox;
      return bbox && bbox.length === 4 && bbox.some(v => v !== 0);
    });

    spatialEntities.forEach(entity => {
      const bbox = entity.attributes.bbox!;
      const lat = (bbox[1] + bbox[3]) / 2;
      const lon = (bbox[0] + bbox[2]) / 2;
      const isSelected = entity.id === selectedEntityId;
      const layer = getEntityLayer(entity.type);

      // Layer-based colors
      const colors: Record<string, { fill: string; stroke: string }> = {
        world: { fill: '#22c55e', stroke: '#16a34a' },
        capability: { fill: '#8b5cf6', stroke: '#7c3aed' },
        source: { fill: '#f59e0b', stroke: '#d97706' },
        foundation: { fill: '#6b7280', stroke: '#4b5563' },
      };
      const color = colors[layer] || colors.foundation;

      const marker = L.circleMarker([lat, lon], {
        radius: isSelected ? 12 : 8,
        fillColor: isSelected ? '#0a0a0a' : color.fill,
        fillOpacity: isSelected ? 1 : 0.8,
        weight: isSelected ? 3 : 2,
        color: isSelected ? '#0a0a0a' : color.stroke,
      }).addTo(map);

      // Minimalist popup
      marker.bindPopup(
        `<div style="padding:8px 12px;font-size:13px;line-height:1.5">
          <div style="font-weight:600;margin-bottom:4px">${entity.attributes.name || entity.id}</div>
          <div style="font-size:11px;color:#a3a3a3">${entity.type}</div>
        </div>`,
        { closeButton: false }
      );

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