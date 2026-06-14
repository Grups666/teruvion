import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onBack?: () => void;
  variant?: 'overview' | 'detail' | 'micro';
  depth?: 'overview' | 'detail';
};

function getPosition(index: number, total: number, variant: Props['variant']) {
  const isMicro = variant === 'micro';
  const isDetail = variant === 'detail';
  if (total > 4) {
    const columns = Math.ceil(total / 2);
    const row = Math.floor(index / columns);
    const rawCol = index % columns;
    const col = row === 0 ? rawCol : columns - 1 - rawCol;
    const columnSpacing = isMicro ? 230 : isDetail ? 270 : 310;
    const startX = isMicro ? 28 : 42;
    const topY = isMicro ? 42 : isDetail ? 66 : 72;
    const rowGap = isMicro ? 132 : isDetail ? 178 : 190;
    const centerOffset = Math.max(0, 3 - columns) * (columnSpacing / 2);
    return {
      x: startX + centerOffset + col * columnSpacing,
      y: topY + row * rowGap
    };
  }

  const width = isMicro ? 620 : isDetail ? 820 : 920;
  const centerY = isMicro ? 110 : isDetail ? 150 : 176;
  const spacing = total <= 1 ? 0 : width / Math.max(total - 1, 1);
  const x = total <= 1 ? width / 2 - 96 : index * spacing + 40;
  const y = centerY + (total > 2 && index % 2 === 1 ? -26 : total > 2 ? 20 : 0);
  return { x, y };
}

export default function ResearchRouteGraph({ signals, activeKey, onSelect, onBack, variant = 'overview', depth = 'overview' }: Props) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isZoomArmed, setIsZoomArmed] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as HTMLElement)) {
        setIsZoomArmed(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

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
              onClick={() => {
                setIsZoomArmed(true);
                onSelect?.(signal.key);
              }}
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
        type: 'default',
        style: {
          background: 'transparent',
          border: 0,
          boxShadow: 'none',
          padding: 0
        }
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
    <div
      ref={shellRef}
      className={`research-flow-shell ${variant} ${depth} ${isZoomArmed ? 'zoom-armed' : ''}`}
      onContextMenu={event => {
        event.preventDefault();
        setIsZoomArmed(false);
      }}
    >
      {depth === 'detail' && onBack && (
        <button
          type="button"
          className="research-flow-back"
          onClick={event => {
            event.stopPropagation();
            setIsZoomArmed(false);
            onBack();
          }}
          aria-label="Back to overview"
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll={isZoomArmed}
        zoomOnPinch
        zoomOnDoubleClick={false}
        onPaneClick={() => setIsZoomArmed(true)}
        minZoom={0.45}
        maxZoom={1.8}
        preventScrolling={isZoomArmed}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={0.6} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
