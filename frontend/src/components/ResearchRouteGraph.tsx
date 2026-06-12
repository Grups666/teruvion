import React, { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
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
};

type Props = {
  signals: ResearchRouteSignal[];
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  variant?: 'overview' | 'detail' | 'micro';
};

const STAGE_POSITIONS = [
  { x: 40, y: 140 },
  { x: 300, y: 58 },
  { x: 570, y: 145 },
  { x: 820, y: 58 },
  { x: 1080, y: 145 },
  { x: 700, y: 275 }
];

const DETAIL_POSITIONS = [
  { x: 40, y: 92 },
  { x: 310, y: 34 },
  { x: 580, y: 92 },
  { x: 850, y: 34 },
  { x: 1120, y: 92 },
  { x: 610, y: 210 }
];

const MICRO_POSITIONS = [
  { x: 70, y: 70 },
  { x: 340, y: 34 },
  { x: 610, y: 70 },
  { x: 420, y: 180 },
  { x: 160, y: 180 }
];

function getPositions(variant: Props['variant']) {
  if (variant === 'detail') return DETAIL_POSITIONS;
  if (variant === 'micro') return MICRO_POSITIONS;
  return STAGE_POSITIONS;
}

export default function ResearchRouteGraph({ signals, activeKey, onSelect, variant = 'overview' }: Props) {
  const { nodes, edges } = useMemo(() => {
    const positions = getPositions(variant);
    const graphNodes: Node[] = signals.map((signal, index) => {
      const position = positions[index] || {
        x: 80 + index * 220,
        y: variant === 'overview'
          ? index % 2 === 0 ? 130 : 250
          : index % 2 === 0 ? 78 : 170
      };

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
        selectable: false,
        draggable: false,
        type: 'default'
      };
    });

    const graphEdges: Edge[] = signals.slice(1).map((signal, index) => ({
      id: `${signals[index].key}-${signal.key}`,
      source: signals[index].key,
      target: signal.key,
      animated: activeKey === signal.key || activeKey === signals[index].key,
      type: 'smoothstep',
      className: 'research-flow-edge'
    }));

    return { nodes: graphNodes, edges: graphEdges };
  }, [activeKey, onSelect, signals, variant]);

  return (
    <div className={`research-flow-shell ${variant}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={0.6} />
      </ReactFlow>
    </div>
  );
}
