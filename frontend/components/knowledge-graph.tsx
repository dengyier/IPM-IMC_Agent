"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "./card";
import {
  nodesApi,
  type MethodologyGraph,
  type MethodologyGraphNode,
} from "@/lib/api";

const palette = [
  "#2563EB",
  "#7C3AED",
  "#0EA5A4",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6",
  "#A855F7",
  "#F97316",
  "#E11D48",
  "#14B8A6",
];

const width = 920;
const height = 420;
const center = { x: 460, y: 210 };

type PositionedNode = MethodologyGraphNode & {
  x: number;
  y: number;
  r: number;
  category: string;
  color: string;
};

export function KnowledgeGraph() {
  const [graph, setGraph] = useState<MethodologyGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    nodesApi
      .graph(40)
      .then((data) => {
        if (!cancelled) {
          setGraph(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "知识图谱加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { nodes, byId, legend } = useMemo(() => layoutGraph(graph), [graph]);

  return (
    <Card>
      <CardHeader title="知识网络图谱（部分）" action="查看完整图谱" actionHref="/knowledge-graph" />
      <div className="flex gap-4 px-5 pb-5 pt-3">
        <div className="relative flex-1">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[320px] w-full">
            <defs>
              <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {graph?.edges.map((edge) => {
              const source = byId.get(edge.source);
              const target = byId.get(edge.target);
              if (!source || !target) return null;
              return (
                <line
                  key={`${edge.source}-${edge.target}-${edge.relation_type}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#D8DEEA"
                  strokeWidth={Math.max(0.8, Math.min(source.degree, target.degree) / 18)}
                  opacity={0.9}
                />
              );
            })}

            {nodes.map((node) => {
              const isHub = node.degree >= Math.max(4, maxDegree(nodes) * 0.65);
              return (
                <g key={node.id}>
                  <circle cx={node.x} cy={node.y} r={node.r + 11} fill={node.color} opacity={0.1} />
                  <circle cx={node.x} cy={node.y} r={node.r + 5} fill="#fff" opacity={0.92} />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r}
                    fill={isHub ? node.color : "#fff"}
                    stroke={node.color}
                    strokeWidth={isHub ? 0 : 2.3}
                    filter={isHub ? "url(#nodeGlow)" : undefined}
                  />
                  <text
                    x={node.x}
                    y={node.y + node.r + 14}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#6B7280"
                  >
                    {node.node_name}
                  </text>
                </g>
              );
            })}
          </svg>

          {!graph && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-slate-400">
              正在加载真实知识图谱...
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-rose-500">
              {error}
            </div>
          )}

          {graph && graph.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[14px] font-bold text-ink">暂无知识网络数据</div>
              <p className="mt-2 text-[12px] leading-5 text-slate-400">
                请先上传并处理课程资料，再构建知识内核生成节点与关系边。
              </p>
            </div>
          )}
        </div>

        <div className="flex w-36 shrink-0 flex-col justify-center gap-3">
          {legend.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-[12px] text-gray-500">{item.name}</span>
            </div>
          ))}
          {graph && (
            <div className="mt-2 border-t border-line pt-3 text-[11px] leading-5 text-slate-400">
              <div>节点 {graph.total_nodes.toLocaleString()} 个</div>
              <div>关系 {graph.total_edges.toLocaleString()} 条</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function layoutGraph(graph: MethodologyGraph | null): {
  nodes: PositionedNode[];
  byId: Map<string, PositionedNode>;
  legend: { name: string; color: string }[];
} {
  if (!graph) return { nodes: [], byId: new Map(), legend: [] };

  const categories = Array.from(
    new Set(graph.nodes.map((node) => node.node_category || "未分类"))
  );
  const colors = new Map(categories.map((category, index) => [category, palette[index % palette.length]]));
  const degreeMax = Math.max(1, ...graph.nodes.map((node) => node.degree || 0));

  const nodes = [...graph.nodes]
    .sort((a, b) => (b.degree || 0) - (a.degree || 0))
    .map((node, index) => {
      const category = node.node_category || "未分类";
      const angle = index * 2.399963229728653;
      const ring = Math.sqrt(index + 0.8);
      const radius = 40 + ring * 48;
      const x = clamp(center.x + Math.cos(angle) * radius * 1.46, 70, width - 70);
      const y = clamp(center.y + Math.sin(angle) * radius * 0.78, 62, height - 58);
      const r = 6 + Math.round(Math.sqrt((node.degree || 1) / degreeMax) * 12);
      return {
        ...node,
        category,
        color: colors.get(category) || palette[0],
        x,
        y,
        r,
      };
    });

  if (nodes.length > 0) {
    nodes[0] = { ...nodes[0], x: center.x, y: center.y, r: Math.max(nodes[0].r, 15) };
  }

  return {
    nodes,
    byId: new Map(nodes.map((node) => [node.id, node])),
    legend: categories.slice(0, 10).map((name) => ({
      name,
      color: colors.get(name) || palette[0],
    })),
  };
}

function maxDegree(nodes: PositionedNode[]) {
  return Math.max(1, ...nodes.map((node) => node.degree || 0));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
