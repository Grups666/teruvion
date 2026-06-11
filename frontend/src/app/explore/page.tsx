/**
 * Explore View - Interactive Digital Earth Intelligence
 *
 * This component demonstrates the core value of Teruvion:
 * - Click a region/object → see what's connected
 * - Multi-source integration (papers + datasets + models + events)
 * - Evidence chains visualization
 * - Capability discovery (what can you DO here?)
 *
 * The key insight: Teruvion is NOT a search engine.
 * It's a "capability discovery" platform - showing what's possible.
 */

'use client';

import React, { useState, useEffect } from 'react';

interface Entity {
  id: string;
  type: string;
  name: string;
  layer: string;
  category: string;
  confidence?: number;
}

interface Relation {
  type: string;
  from: string;
  to: string;
  confidence: number;
  isFallback: boolean;
}

interface ExploreNode {
  entity: Entity;
  relatedEntities: Entity[];
  relations: Relation[];
  sources: string[];
  capabilities: string[];
}

export default function ExploreView() {
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [exploreData, setExploreData] = useState<ExploreNode | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);

  // Load initial entities (regions, basins, datasets, models)
  useEffect(() => {
    fetch('/api/entities')
      .then(res => res.json())
      .then(data => {
        const typed = data.entities.map((e: any) => ({
          id: e.id,
          type: e.type,
          name: e.attributes?.name || e.id,
          layer: getLayer(e.type),
          category: getCategory(e.type),
          confidence: e.metadata?.confidence
        }));
        setEntities(typed);
      })
      .catch(err => console.error('Failed to load entities:', err));
  }, []);

  // When user selects an entity, explore its connections
  const handleSelectEntity = async (entity: Entity) => {
    setSelectedEntity(entity);
    setLoading(true);

    // Fetch relations and related entities
    try {
      const relationsRes = await fetch(`/api/entities/${entity.id}/relations`);
      const relationsData = await relationsRes.json();

      // Build explore data
      const relatedEntities = await Promise.all(
        (relationsData.relations || []).map(async (rel: Relation) => {
          const targetId = rel.from === entity.id ? rel.to : rel.from;
          const res = await fetch(`/api/entities/${targetId}`);
          const data = await res.json();
          return {
            id: targetId,
            type: data.entity?.type,
            name: data.entity?.attributes?.name || targetId,
            layer: getLayer(data.entity?.type),
            category: getCategory(data.entity?.type),
          };
        })
      );

      // Determine capabilities based on entity type and relations
      const capabilities = getCapabilities(entity, relationsData.relations || []);

      // Find sources that mention this entity
      const sources = findSources(entity, relatedEntities);

      setExploreData({
        entity,
        relatedEntities: relatedEntities.filter(e => e.type),
        relations: relationsData.relations || [],
        sources,
        capabilities,
      });
    } catch (err) {
      console.error('Explore error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel: Entity List */}
      <div className="w-64 bg-white border-r p-4">
        <h2 className="font-bold text-lg mb-4">Digital Earth Objects</h2>

        {/* Filter by layer */}
        <div className="mb-4">
          <span className="text-sm text-gray-500">Filter:</span>
          <div className="flex gap-2 mt-2">
            {['world', 'capability', 'source'].map(layer => (
              <button
                key={layer}
                className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
              >
                {layer}
              </button>
            ))}
          </div>
        </div>

        {/* Entity list */}
        <div className="space-y-2">
          {entities.map(entity => (
            <div
              key={entity.id}
              onClick={() => handleSelectEntity(entity)}
              className={`p-2 rounded cursor-pointer ${
                selectedEntity?.id === entity.id
                  ? 'bg-blue-100 border-blue-500'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${getLayerColor(entity.layer)}`} />
                <span className="font-medium">{entity.name}</span>
              </div>
              <div className="text-xs text-gray-500">
                {entity.type} · {entity.layer}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Panel: Explore View */}
      <div className="flex-1 p-6">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-gray-500">Exploring connections...</span>
          </div>
        )}

        {!loading && !selectedEntity && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-4xl mb-4">🌍</div>
            <p className="text-lg">Select an object to explore its Digital Earth connections</p>
            <p className="text-sm mt-2">
              Click a Basin, Dataset, or Model to see what sources, data, and capabilities relate to it
            </p>
          </div>
        )}

        {!loading && exploreData && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <span className={`w-4 h-4 rounded-full ${getLayerColor(exploreData.entity.layer)}`} />
              <h1 className="text-2xl font-bold">{exploreData.entity.name}</h1>
              <span className="text-gray-500">{exploreData.entity.type}</span>
            </div>

            {/* What is this? */}
            <div className="bg-white rounded-lg p-4 shadow">
              <h3 className="font-semibold text-gray-700 mb-2">About this object</h3>
              <p className="text-gray-600">
                {getObjectDescription(exploreData.entity)}
              </p>
            </div>

            {/* Sources */}
            {exploreData.sources.length > 0 && (
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="font-semibold text-gray-700 mb-3">📚 Sources mentioning this</h3>
                <div className="grid grid-cols-2 gap-3">
                  {exploreData.sources.map(source => (
                    <div key={source} className="p-2 bg-blue-50 rounded text-sm">
                      {source}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Objects (Grid by Layer) */}
            <div className="bg-white rounded-lg p-4 shadow">
              <h3 className="font-semibold text-gray-700 mb-3">🔗 Connected objects</h3>
              <div className="grid grid-cols-3 gap-4">
                {/* World Objects */}
                <div>
                  <h4 className="text-sm font-medium text-green-600 mb-2">World Objects</h4>
                  <div className="space-y-1">
                    {exploreData.relatedEntities
                      .filter(e => e.layer === 'world')
                      .map(e => (
                        <div
                          key={e.id}
                          onClick={() => handleSelectEntity(e)}
                          className="p-2 bg-green-50 rounded cursor-pointer hover:bg-green-100"
                        >
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{e.type}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Capabilities */}
                <div>
                  <h4 className="text-sm font-medium text-purple-600 mb-2">Capabilities</h4>
                  <div className="space-y-1">
                    {exploreData.relatedEntities
                      .filter(e => e.layer === 'capability')
                      .map(e => (
                        <div
                          key={e.id}
                          onClick={() => handleSelectEntity(e)}
                          className="p-2 bg-purple-50 rounded cursor-pointer hover:bg-purple-100"
                        >
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{e.type}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Sources */}
                <div>
                  <h4 className="text-sm font-medium text-orange-600 mb-2">Sources</h4>
                  <div className="space-y-1">
                    {exploreData.relatedEntities
                      .filter(e => e.layer === 'source')
                      .map(e => (
                        <div
                          key={e.id}
                          onClick={() => handleSelectEntity(e)}
                          className="p-2 bg-orange-50 rounded cursor-pointer hover:bg-orange-100"
                        >
                          <span className="font-medium">{e.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{e.type}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Capabilities - What can you DO? */}
            {exploreData.capabilities.length > 0 && (
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg p-4 text-white">
                <h3 className="font-semibold mb-3">🎯 What can you do with this?</h3>
                <div className="flex flex-wrap gap-2">
                  {exploreData.capabilities.map(cap => (
                    <button
                      key={cap}
                      className="px-3 py-2 bg-white/20 rounded-full hover:bg-white/30 transition"
                    >
                      {cap}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Chain */}
            {exploreData.relations.length > 0 && (
              <div className="bg-white rounded-lg p-4 shadow">
                <h3 className="font-semibold text-gray-700 mb-3">📊 Evidence & Relations</h3>
                <div className="space-y-2">
                  {exploreData.relations.slice(0, 5).map(rel => (
                    <div key={`${rel.type}-${rel.from}-${rel.to}`} className="flex items-center gap-2">
                      <span className="text-sm bg-gray-100 px-2 py-1 rounded">{rel.type}</span>
                      <span className="text-xs text-gray-500">
                        conf: {rel.confidence.toFixed(2)}
                        {rel.isFallback && ' (fallback)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Panel: Actions */}
      <div className="w-48 bg-white border-l p-4">
        <h2 className="font-bold text-lg mb-4">Actions</h2>
        <div className="space-y-2">
          <button className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Compare
          </button>
          <button className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600">
            Add Source
          </button>
          <button className="w-full px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600">
            Track Updates
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getLayer(type: string): string {
  const worldTypes = ['Basin', 'Region', 'Watershed', 'River', 'Lake', 'Glacier', 'Hazard', 'FloodEvent'];
  const capabilityTypes = ['Dataset', 'Model', 'Sensor', 'Gauge', 'Algorithm', 'Claim', 'Evidence'];
  const sourceTypes = ['Paper', 'Repository', 'Report', 'News'];

  if (worldTypes.includes(type)) return 'world';
  if (capabilityTypes.includes(type)) return 'capability';
  if (sourceTypes.includes(type)) return 'source';
  return 'foundation';
}

function getCategory(type: string): string {
  const categories: Record<string, string> = {
    'Basin': 'earth-object',
    'Dataset': 'data',
    'Model': 'modeling',
    'Gauge': 'observation',
    'Claim': 'evidence',
    'FloodEvent': 'hazard',
  };
  return categories[type] || 'general';
}

function getLayerColor(layer: string): string {
  const colors: Record<string, string> = {
    'world': 'bg-green-500',
    'capability': 'bg-purple-500',
    'source': 'bg-orange-500',
    'foundation': 'bg-gray-500',
  };
  return colors[layer] || 'bg-gray-400';
}

function getObjectDescription(entity: Entity): string {
  const descriptions: Record<string, string> = {
    'Basin': 'A river basin or catchment area - the fundamental unit for hydrological analysis.',
    'Dataset': 'A dataset with Earth system variables - provides data for analysis.',
    'Model': 'A computational model for simulating Earth processes.',
    'Gauge': 'An observation station measuring Earth variables.',
    'Claim': 'A scientific claim supported by evidence.',
  };
  return descriptions[entity.type] || `A ${entity.type} in the Digital Earth knowledge graph.`;
}

function getCapabilities(entity: Entity, relations: Relation[]): string[] {
  const caps: string[] = [];

  // Based on entity type and relations
  if (entity.type === 'Basin') {
    caps.push('View datasets covering this basin');
    caps.push('Find models validated here');
    caps.push('See flood history');
  }

  if (relations.some(r => r.type === 'simulates')) {
    caps.push('Run model simulation');
    caps.push('Compare model performance');
  }

  if (relations.some(r => r.type === 'covers')) {
    caps.push('Download dataset');
    caps.push('View data quality');
  }

  if (relations.some(r => r.type === 'observes')) {
    caps.push('View observation data');
    caps.push('Check station status');
  }

  if (relations.some(r => r.type === 'supports')) {
    caps.push('View evidence chain');
    caps.push('Check claim confidence');
  }

  return caps;
}

function findSources(entity: Entity, related: Entity[]): string[] {
  return related
    .filter(e => e.layer === 'source')
    .map(e => e.name);
}