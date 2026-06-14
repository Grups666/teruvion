import React, { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';

export type ResearchRouteSignal = {
  key: string;
  label: string;
  value: string;
  detail: string;
  status: 'ready' | 'review' | 'blocked' | 'pending';
  edges?: Array<{ to: string; label?: string }>;
};

type Props = {
  signals: ResearchRouteSignal[];
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  variant?: 'overview' | 'detail' | 'micro';
  depth?: 'overview' | 'detail';
};

function getPosition(index: number, total: number, variant: Props['variant']) {
  const isMicro = variant === 'micro';
  const isDetail = variant === 'detail';
  const width = isMicro ? 720 : isDetail ? 1180 : 1240;
  const centerY = isMicro ? 110 : isDetail ? 132 : 186;
  const amplitude = isMicro ? 54 : isDetail ? 58 : 76;
  const spacing = total <= 1 ? 0 : width / Math.max(total - 1, 1);
  const x = total <= 1 ? width / 2 - 92 : index * spacing + 24;
  const wave = Math.sin((index / Math.max(total - 1, 1)) * Math.PI * 1.45 - 0.5);
  const branch = total > 4 && index > 0 && index < total - 1 && index % 2 === 0 ? -34 : 0;
  const y = centerY + wave * amplitude + branch;
  return { x, y };
}

export default function ResearchRouteGraph({ signals, activeKey, onSelect, variant = 'overview', depth = 'overview' }: Props) {
  const { nodes, edges } = useMemo(() => {
    const graphNodes: Node[] = signals.map((signal, index) => {
      const position = getPosition(index, signals.length, variant);

      return {
        id: signal.key,
        position,
        data: {
          label: (
            <button
              type="button"
              className={`research-flow-node ${signal.status} ${activeKey === signal.key ? 'active' : ''}`}
              onClick={() => onSelect?.(signal.key)}
              disabled={!onSelect}
            >
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
              <small>{signal.detail}</small>
            </button>
          )
        },
        selectable: true,
        draggable: false,
        type: 'default'
      };
    });

    const knownKeys = new Set(signals.map(signal => signal.key));
    const explicitEdges = signals.flatMap(signal => (signal.edges || [])
      .filter(edge => knownKeys.has(edge.to))
      .map(edge => ({
        id: `${signal.key}-${edge.to}`,
        source: signal.key,
        target: edge.to,
        label: edge.label,
        animated: activeKey === signal.key || activeKey === edge.to,
        type: 'smoothstep',
        className: 'research-flow-edge',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }
      })));

    const sequentialEdges = signals.slice(1).map((signal, index) => ({
      id: `${signals[index].key}-${signal.key}`,
      source: signals[index].key,
      target: signal.key,
      animated: activeKey === signal.key || activeKey === signals[index].key,
      type: 'smoothstep',
      className: 'research-flow-edge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }
    }));

    const graphEdges: Edge[] = explicitEdges.length > 0 ? explicitEdges : sequentialEdges;

    return { nodes: graphNodes, edges: graphEdges };
  }, [activeKey, onSelect, signals, variant]);

  return (
    <div className={`research-flow-shell ${variant} ${depth}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.45}
        maxZoom={1.8}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={0.6} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
