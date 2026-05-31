"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Icon } from "@/components/icon";
import {
  nodesApi,
  type MethodologyGraph,
  type MethodologyGraphEdge,
  type MethodologyGraphNode,
} from "@/lib/api";

const batchSize = 40;
const sphereRadius = 235;
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
  "#64748B",
  "#06B6D4",
];

type SphericalNode = MethodologyGraphNode & {
  color: string;
  position: THREE.Vector3;
  size: number;
};

type HoverNode = {
  name: string;
  category: string;
  degree: number;
  x: number;
  y: number;
};

export function FullKnowledgeGraphPage() {
  const [nodes, setNodes] = useState<MethodologyGraphNode[]>([]);
  const [edges, setEdges] = useState<MethodologyGraphEdge[]>([]);
  const [totalNodes, setTotalNodes] = useState(0);
  const [totalEdges, setTotalEdges] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<HoverNode | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const graphDataRef = useRef<{ nodes: SphericalNode[]; edges: MethodologyGraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  const loadBatchRef = useRef<() => void>(() => undefined);

  const loadBatch = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const nextOffset = offsetRef.current;
      const data = await nodesApi.graph(batchSize, nextOffset);
      mergeGraph(data, setNodes, setEdges);
      setTotalNodes(data.total_nodes);
      setTotalEdges(data.total_edges);
      setHasMore(data.has_more);
      offsetRef.current = nextOffset + data.nodes.length;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "完整图谱加载失败");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore]);

  useEffect(() => {
    loadBatchRef.current = loadBatch;
  }, [loadBatch]);

  useEffect(() => {
    loadBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spherical = useMemo(() => layoutSphere(nodes), [nodes]);
  const byId = useMemo(() => new Map(spherical.nodes.map((node) => [node.id, node])), [spherical.nodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => byId.has(edge.source) && byId.has(edge.target)),
    [byId, edges]
  );

  useEffect(() => {
    graphDataRef.current = { nodes: spherical.nodes, edges: visibleEdges };
  }, [spherical.nodes, visibleEdges]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#fbfcff");

    const camera = new THREE.PerspectiveCamera(48, 1, 1, 1600);
    camera.position.set(0, 0, 680);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = "h-full w-full cursor-grab touch-none active:cursor-grabbing";
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    group.rotation.set(-0.18, -0.32, 0);
    scene.add(group);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(sphereRadius, 48, 32),
      new THREE.MeshBasicMaterial({
        color: "#eef2ff",
        transparent: true,
        opacity: 0.1,
        wireframe: true,
      })
    );
    group.add(shell);

    const ambient = new THREE.AmbientLight("#ffffff", 2.8);
    scene.add(ambient);
    const key = new THREE.PointLight("#d9d2ff", 2.6, 1200);
    key.position.set(260, 210, 460);
    scene.add(key);

    const nodeObjects = new Map<string, THREE.Mesh>();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const drag = {
      active: false,
      x: 0,
      y: 0,
      rotationX: 0,
      rotationY: 0,
      moved: 0,
    };

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const rebuild = () => {
      while (group.children.length > 1) {
        const child = group.children.pop();
        if (!child) continue;
        disposeObject(child);
      }
      nodeObjects.clear();

      const data = graphDataRef.current;
      const localById = new Map(data.nodes.map((node) => [node.id, node]));
      const linePositions: number[] = [];
      const lineColors: number[] = [];

      for (const edge of data.edges) {
        const source = localById.get(edge.source);
        const target = localById.get(edge.target);
        if (!source || !target) continue;
        linePositions.push(
          source.position.x,
          source.position.y,
          source.position.z,
          target.position.x,
          target.position.y,
          target.position.z
        );
        const sourceColor = new THREE.Color(source.color);
        const targetColor = new THREE.Color(target.color);
        lineColors.push(sourceColor.r, sourceColor.g, sourceColor.b, targetColor.r, targetColor.g, targetColor.b);
      }

      if (linePositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(lineColors, 3));
        const material = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
        group.add(new THREE.LineSegments(geometry, material));
      }

      for (const node of data.nodes) {
        const geometry = new THREE.SphereGeometry(node.size, 20, 14);
        const material = new THREE.MeshStandardMaterial({
          color: node.color,
          emissive: node.color,
          emissiveIntensity: node.degree > 2 ? 0.28 : 0.14,
          roughness: 0.45,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(node.position);
        mesh.userData = node;
        group.add(mesh);
        nodeObjects.set(node.id, mesh);
      }
    };

    const projectHover = (mesh: THREE.Object3D, event: PointerEvent) => {
      const node = mesh.userData as SphericalNode;
      const rect = mount.getBoundingClientRect();
      setHoverNode({
        name: node.node_name,
        category: node.node_category || "未分类",
        degree: node.degree || 0,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
      drag.active = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.rotationX = group.rotation.x;
      drag.rotationY = group.rotation.y;
      drag.moved = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

      if (drag.active) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.moved = Math.abs(dx) + Math.abs(dy);
        group.rotation.y = drag.rotationY + dx * 0.006;
        group.rotation.x = THREE.MathUtils.clamp(drag.rotationX + dy * 0.0048, -1.25, 1.25);

        if (drag.moved > 180 && hasMoreRef.current && !loadingRef.current) {
          drag.x = event.clientX;
          drag.y = event.clientY;
          drag.rotationX = group.rotation.x;
          drag.rotationY = group.rotation.y;
          drag.moved = 0;
          loadBatchRef.current();
        }
      }

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(Array.from(nodeObjects.values()), false)[0];
      if (hit) {
        projectHover(hit.object, event);
      } else {
        setHoverNode(null);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      drag.active = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.42, 430, 900);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", () => setHoverNode(null));
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    let lastNodeCount = -1;
    let lastEdgeCount = -1;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const data = graphDataRef.current;
      if (lastNodeCount !== data.nodes.length || lastEdgeCount !== data.edges.length) {
        lastNodeCount = data.nodes.length;
        lastEdgeCount = data.edges.length;
        rebuild();
      }
      if (!drag.active) group.rotation.y += 0.0015;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      disposeObject(group);
      shell.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const hasMoreRef = useLatest(hasMore);
  const visibleEdgeCount = visibleEdges.length;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-7 py-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <a href="/" className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-[#172452] hover:text-brand">
              <Icon name="chevron-left" className="h-4 w-4" />
            </a>
            <div>
              <h1 className="text-[27px] font-black tracking-[-0.03em] text-ink">完整知识网络图谱</h1>
              <p className="mt-1.5 text-[13px] font-medium text-slate-500">
                真实知识节点以 3D 球体呈现，关系边随节点批次动态扩展。
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-card flex items-center gap-5 rounded-2xl px-5 py-3">
          <Metric label="已加载节点" value={`${nodes.length}/${totalNodes || "..."}`} />
          <Metric label="已显示关系" value={`${visibleEdgeCount}/${totalEdges || "..."}`} />
          <Metric label="加载批次" value={`${Math.ceil(nodes.length / batchSize) || 0}`} />
          <button
            onClick={loadBatch}
            disabled={loading || !hasMore}
            className="brand-gradient h-10 rounded-xl px-4 text-[13px] font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "加载中..." : hasMore ? "加载更多" : "已全部加载"}
          </button>
        </div>
      </header>

      <section className="mt-6 flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#fbfcff]">
          <div ref={mountRef} className="h-full min-h-[620px] w-full" />

          {hoverNode && (
            <div
              className="pointer-events-none absolute z-10 min-w-[180px] rounded-xl border border-line bg-white/95 px-3 py-2 shadow-card backdrop-blur"
              style={{ left: hoverNode.x + 14, top: hoverNode.y + 14 }}
            >
              <div className="max-w-[230px] truncate text-[13px] font-black text-ink">{hoverNode.name}</div>
              <div className="mt-1 text-[11px] font-medium text-slate-500">{hoverNode.category}</div>
              <div className="mt-1 text-[11px] text-slate-400">关联度 {hoverNode.degree}</div>
            </div>
          )}

          {error && (
            <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-xl bg-rose-50 px-4 py-2 text-[13px] font-bold text-rose-500">
              {error}
            </div>
          )}

          {nodes.length === 0 && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-slate-400">
              正在加载真实知识图谱...
            </div>
          )}

          <div className="absolute bottom-5 left-5 flex gap-2 rounded-xl border border-line bg-white/90 p-2 shadow-card backdrop-blur">
            <button
              onClick={() => setCameraZoom(mountRef.current, -80)}
              className="h-9 w-9 rounded-lg text-brand hover:bg-[#f0edff]"
            >
              +
            </button>
            <button
              onClick={() => setCameraZoom(mountRef.current, 80)}
              className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-50"
            >
              -
            </button>
          </div>
        </div>

        <aside className="w-[280px] shrink-0 border-l border-line bg-white/78 px-5 py-5">
          <h2 className="text-[15px] font-black text-ink">图例分类</h2>
          <div className="mt-4 max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            {spherical.legend.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-[12px] text-slate-600">{item.name}</span>
                <span className="ml-auto text-[11px] text-slate-400">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl bg-[#f6f7ff] px-4 py-4">
            <div className="text-[12px] font-bold text-ink">实时加载</div>
            <div className="mt-2 text-[22px] font-black text-brand">{nodes.length}</div>
            <div className="mt-1 text-[11px] text-slate-400">当前已加载节点</div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div className="mt-0.5 text-[18px] font-black text-ink">{value}</div>
    </div>
  );
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function mergeGraph(
  data: MethodologyGraph,
  setNodes: React.Dispatch<React.SetStateAction<MethodologyGraphNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<MethodologyGraphEdge[]>>
) {
  setNodes((prev) => {
    const seen = new Set(prev.map((node) => node.id));
    return [...prev, ...data.nodes.filter((node) => !seen.has(node.id))];
  });
  setEdges((prev) => {
    const seen = new Set(prev.map(edgeKey));
    return [...prev, ...data.edges.filter((edge) => !seen.has(edgeKey(edge)))];
  });
}

function edgeKey(edge: MethodologyGraphEdge) {
  return `${edge.source}-${edge.target}-${edge.relation_type}`;
}

function layoutSphere(nodes: MethodologyGraphNode[]) {
  const categories = Array.from(new Set(nodes.map((node) => node.node_category || "未分类")));
  const colors = new Map(categories.map((category, index) => [category, palette[index % palette.length]]));
  const counts = new Map<string, number>();
  const degreeMax = Math.max(1, ...nodes.map((node) => node.degree || 0));
  const ordered = [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
  const total = Math.max(ordered.length, batchSize);

  const sphericalNodes = ordered.map((node, index) => {
    const category = node.node_category || "未分类";
    counts.set(category, (counts.get(category) || 0) + 1);
    const position = fibonacciSphere(index, total, sphereRadius + Math.sin(index * 1.7) * 16);
    const degreeRatio = Math.sqrt((node.degree || 1) / degreeMax);
    return {
      ...node,
      color: colors.get(category) || palette[0],
      position,
      size: 5.4 + degreeRatio * 8.6,
    };
  });

  return {
    nodes: sphericalNodes,
    legend: categories.map((name) => ({
      name,
      color: colors.get(name) || palette[0],
      count: counts.get(name) || 0,
    })),
  };
}

function fibonacciSphere(index: number, total: number, radius: number) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(total - 1, 1)) * 2;
  const radial = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * goldenAngle;
  return new THREE.Vector3(
    Math.cos(theta) * radial * radius,
    y * radius,
    Math.sin(theta) * radial * radius
  );
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function setCameraZoom(mount: HTMLDivElement | null, delta: number) {
  const canvas = mount?.querySelector("canvas");
  if (!canvas) return;
  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true, cancelable: true }));
}
