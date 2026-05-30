import { Card, CardHeader } from "./card";
import { graphNodes, graphEdges, graphGroups } from "@/lib/data";

const byId = Object.fromEntries(graphNodes.map((n) => [n.id, n]));
const ambientDots = Array.from({ length: 34 }, (_, i) => ({
  x: 70 + ((i * 83) % 790),
  y: 58 + ((i * 47) % 305),
  r: i % 5 === 0 ? 5 : 3.8,
  color: ["#7C5CFF", "#60A5FA", "#C4B5FD", "#34D399"][i % 4],
}));

export function KnowledgeGraph() {
  return (
    <Card>
      <CardHeader title="知识网络图谱（部分）" action="查看完整图谱" />
      <div className="flex gap-4 px-5 pb-5 pt-3">
        <div className="relative flex-1">
          <svg viewBox="0 0 920 420" className="h-[320px] w-full">
            <defs>
              <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {ambientDots.map((dot, i) => (
              <circle
                key={`ambient-${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dot.color}
                opacity={0.45}
              />
            ))}
            {graphEdges.map((e, i) => {
              const a = byId[e.from];
              const b = byId[e.to];
              if (!a || !b) return null;
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#D8DEEA"
                  strokeWidth={1}
                  opacity={0.88}
                />
              );
            })}
            {graphNodes.map((n) => {
              const color = graphGroups[n.group].color;
              return (
                <g key={n.id}>
                  {!n.hollow && (
                    <>
                      <circle cx={n.x} cy={n.y} r={n.r + 10} fill={color} opacity={0.1} />
                      <circle cx={n.x} cy={n.y} r={n.r + 5} fill="#fff" opacity={0.92} />
                    </>
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={n.hollow ? "#fff" : color}
                    stroke={color}
                    strokeWidth={n.hollow ? 2.4 : 0}
                    filter={n.hollow ? undefined : "url(#nodeGlow)"}
                  />
                  {n.label && (
                    <text
                      x={n.x}
                      y={n.y + n.r + 14}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#6B7280"
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex w-32 shrink-0 flex-col justify-center gap-3">
          {graphGroups.map((g) => (
            <div key={g.name} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: g.color }}
              />
              <span className="text-[12px] text-gray-500">{g.name}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
