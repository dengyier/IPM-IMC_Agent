"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth-context";
import { cn } from "@/lib/utils";
import {
  nodesApi,
  type NodeCard as NodeCardData,
  type NodeCategory,
  type NodeDetail,
  type NodeEdge,
  type NodeExpansion,
  type NodeFilterOptions,
  type NodeVersion,
} from "@/lib/api";
import { fmtNum, nodeStatusTone, sourceTypeLabel } from "@/lib/presentation";

const PAGE_SIZE = 20;
const DEFAULT_FILTERS = {
  status: "",
  sourceType: "",
  scenario: "",
  version: "",
};

export function KnowledgeNodesPage() {
  const [category, setCategory] = useState("全部节点");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [nodes, setNodes] = useState<NodeCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<NodeCategory[]>([]);
  const [filterOptions, setFilterOptions] = useState<NodeFilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeCardData | null>(null);

  // 搜索框防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // 切换分类 / 搜索时回到第一页
  useEffect(() => {
    setPage(1);
  }, [category, debouncedQuery, filters]);

  // 分类 Tab 和筛选项来自真实数据。
  useEffect(() => {
    Promise.all([nodesApi.categories(), nodesApi.filterOptions()])
      .then(([cats, options]) => {
        setCategories(cats);
        setFilterOptions(options);
      })
      .catch(() => {
        setCategories([]);
        setFilterOptions(null);
      });
  }, []);

  // 节点列表
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    nodesApi
      .list({
        category: category === "全部节点" ? undefined : category,
        q: debouncedQuery || undefined,
        status: filters.status || undefined,
        sourceType: filters.sourceType || undefined,
        scenario: filters.scenario || undefined,
        version: filters.version || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((res) => {
        if (cancelled) return;
        setNodes(res.items);
        setTotal(res.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "加载失败");
        setNodes([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, debouncedQuery, filters, page]);

  return (
    <main className="flex min-w-0 flex-1 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
        <KnowledgeHeader total={total} />
        <KnowledgeSearch
          query={query}
          onQueryChange={setQuery}
        />
        <CategoryTabs
          categories={categories}
          selected={category}
          onSelect={setCategory}
        />
        <FilterRow
          value={filters}
          options={filterOptions}
          onChange={setFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />
        <NodeGrid
          nodes={nodes}
          total={total}
          page={page}
          loading={loading}
          error={error}
          onNodeSelect={setSelectedNode}
          onPageChange={setPage}
        />
      </section>
      {selectedNode && (
        <NodeDetailDrawer
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </main>
  );
}

function KnowledgeHeader({ total }: { total: number }) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-black tracking-[-0.03em] text-ink">知识节点库</h1>
          <span className="rounded-full bg-[#f0edff] px-3 py-1 text-[12px] font-bold text-brand">
            共 {fmtNum(total)} 个节点
          </span>
        </div>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          基于课程方法论、课堂案例和同学经验沉淀的结构化商业知识资产
        </p>
      </div>
      <div className="dashboard-card flex h-11 w-[300px] items-center gap-3 rounded-xl px-4">
        <span className="text-[13px] font-bold text-slate-400">⌘ K</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
          placeholder="快速搜索或输入指令..."
        />
      </div>
      <TopActions />
    </header>
  );
}

function TopActions() {
  const { user, logout } = useAuth();

  return (
    <div className="flex shrink-0 items-center gap-5">
      <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#172452] hover:bg-white">
        <Icon name="bell" className="h-[19px] w-[19px]" />
        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          8
        </span>
      </button>
      <button
        type="button"
        onClick={() => logout()}
        className="flex items-center gap-3 rounded-2xl py-1 pl-2 pr-2 text-left hover:bg-white"
        title="退出登录"
      >
        <div className="h-10 w-10 rounded-full bg-[radial-gradient(circle_at_50%_28%,#f8d5c2_0_18%,#233a70_19%_46%,#111827_47%)] ring-4 ring-white" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-ink">{user?.display_name || "用户"}</div>
          <div className="text-[11px] text-slate-400">{user?.role || "访客"}</div>
        </div>
        <Icon name="chevron-down" className="h-4 w-4 text-slate-400" />
      </button>
    </div>
  );
}

function KnowledgeSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
}) {
  return (
    <div className="mt-7 flex gap-4">
      <div className="dashboard-card flex h-[58px] min-w-0 flex-1 items-center gap-3 rounded-2xl px-5">
        <Icon name="search" className="h-5 w-5 text-[#65719a]" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#8c96b8]"
          placeholder="搜索知识节点，例如：价值主张、客户细分、最小可行验证..."
        />
      </div>
      <button className="dashboard-card flex h-[58px] items-center gap-2 rounded-xl px-5 text-[13px] font-bold text-[#172452]">
        <Icon name="filter" className="h-4 w-4" />
        高级筛选
      </button>
    </div>
  );
}

function CategoryTabs({
  categories,
  selected,
  onSelect,
}: {
  categories: NodeCategory[];
  selected: string;
  onSelect: (label: string) => void;
}) {
  return (
    <Card className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
        {categories.map((item) => {
          const active = item.label === selected;
          return (
            <button
              key={item.label}
              onClick={() => onSelect(item.label)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-bold",
                active ? "bg-[#f0edff] text-brand" : "text-[#172452] hover:bg-slate-50"
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/70" : "bg-slate-100 text-slate-500")}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function FilterRow({
  value,
  options,
  onChange,
  onReset,
}: {
  value: typeof DEFAULT_FILTERS;
  options: NodeFilterOptions | null;
  onChange: (value: typeof DEFAULT_FILTERS) => void;
  onReset: () => void;
}) {
  const statusOptions =
    options?.statuses.map((item) => ({
      ...item,
      label: nodeStatusTone[item.value]?.label ?? item.label,
    })) ?? [];
  const sourceOptions =
    options?.source_types.map((item) => ({
      ...item,
      label: sourceTypeLabel(item.value),
    })) ?? [];

  return (
    <Card className="mt-0 rounded-t-none px-5 py-4">
      <div className="flex items-center gap-4">
        <FilterSelect
          label="节点状态"
          value={value.status}
          options={statusOptions}
          onChange={(status) => onChange({ ...value, status })}
        />
        <FilterSelect
          label="来源类型"
          value={value.sourceType}
          options={sourceOptions}
          onChange={(sourceType) => onChange({ ...value, sourceType })}
        />
        <FilterSelect
          label="适用场景"
          value={value.scenario}
          options={options?.scenarios ?? []}
          onChange={(scenario) => onChange({ ...value, scenario })}
        />
        <FilterSelect
          label="版本"
          value={value.version}
          options={options?.versions ?? []}
          onChange={(version) => onChange({ ...value, version })}
        />
        <button
          onClick={onReset}
          className="h-10 rounded-lg border border-line bg-white px-5 text-[13px] font-semibold text-slate-500"
        >
          重置
        </button>
        <div className="ml-auto flex gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0edff] text-brand">
            <Icon name="grid-2" className="h-4 w-4" />
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-[#172452]">
            <Icon name="panel" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string; count: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative h-10 min-w-[146px]">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-line bg-white px-4 pr-8 text-[13px] font-semibold text-[#172452] outline-none transition-colors hover:border-brand focus:border-brand"
      >
        <option value="">{label}：全部</option>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}（{option.count}）
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}

function NodeGrid({
  nodes,
  total,
  page,
  loading,
  error,
  onNodeSelect,
  onPageChange,
}: {
  nodes: NodeCardData[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  onNodeSelect: (node: NodeCardData) => void;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="mt-5">
      {error ? (
        <Card className="px-6 py-10 text-center text-[13px] text-rose-500">
          加载失败：{error}
        </Card>
      ) : loading && nodes.length === 0 ? (
        <Card className="px-6 py-10 text-center text-[13px] text-slate-400">
          正在加载知识节点…
        </Card>
      ) : nodes.length === 0 ? (
        <Card className="px-6 py-10 text-center text-[13px] text-slate-400">
          未找到匹配的知识节点
        </Card>
      ) : (
        <div className={cn("grid gap-4 xl:grid-cols-3", loading && "opacity-60")}>
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} onSelect={() => onNodeSelect(node)} />
          ))}
        </div>
      )}
      <Pagination total={total} page={page} onPageChange={onPageChange} />
    </div>
  );
}

function NodeCard({ node, onSelect }: { node: NodeCardData; onSelect: () => void }) {
  const tone = nodeStatusTone[node.status] ?? {
    label: node.status,
    tone: "bg-slate-100 text-slate-500",
  };
  const sourceLabel =
    node.source_types.length > 0
      ? node.source_types.map(sourceTypeLabel).join("、")
      : "未知来源";
  return (
    <button
      type="button"
      onClick={onSelect}
      className="dashboard-card min-h-[178px] rounded-2xl p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_18px_42px_rgba(30,58,138,0.10)] focus:outline-none focus:ring-2 focus:ring-brand/25"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#172452]">
          {node.node_name}
        </h2>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", tone.tone)}>
          <Icon name={node.status === "active" ? "check-circle" : "history"} className="h-3.5 w-3.5" />
          {tone.label}
        </span>
      </div>
      <p className="mt-4 min-h-[44px] text-[13px] leading-6 text-[#405070]">
        {node.definition || "（暂无定义）"}
      </p>
      <div className="mt-4 flex items-center gap-5 text-[12px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="file-text" className="h-3.5 w-3.5" />
          {node.version}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="git-merge" className="h-3.5 w-3.5" />
          关联 {node.edge_count} 个节点
        </span>
      </div>
      <div className="mt-5 flex items-center border-t border-line pt-3 text-[12px] text-slate-500">
        <span className="truncate">
          {node.node_category ? `分类：${node.node_category}` : "未分类"} · 来源：{sourceLabel} · {node.source_chunk_count} 个片段
        </span>
        {node.expansion_count > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-brand">
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            {node.expansion_count} 条扩展
          </span>
        )}
      </div>
    </button>
  );
}

function NodeDetailDrawer({
  node,
  onClose,
}: {
  node: NodeCardData;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [edges, setEdges] = useState<NodeEdge[]>([]);
  const [versions, setVersions] = useState<NodeVersion[]>([]);
  const [expansions, setExpansions] = useState<NodeExpansion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      nodesApi.detail(node.id),
      nodesApi.edges(node.id),
      nodesApi.versions(node.id),
      nodesApi.expansions(node.id),
    ])
      .then(([detailData, edgeData, versionData, expansionData]) => {
        if (cancelled) return;
        setDetail(detailData);
        setEdges(edgeData);
        setVersions(versionData);
        setExpansions(expansionData);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "加载节点详情失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  const tone = nodeStatusTone[(detail?.status || node.status)] ?? {
    label: detail?.status || node.status,
    tone: "bg-slate-100 text-slate-500",
  };
  const sourceLabel =
    node.source_types.length > 0
      ? node.source_types.map(sourceTypeLabel).join("、")
      : "未知来源";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭节点详情"
        className="absolute inset-0 bg-[#0f172a]/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-[520px] max-w-[92vw] flex-col border-l border-line bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="border-b border-line px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-soft">
              <Icon name="list-tree" className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[20px] font-black tracking-[-0.02em] text-ink">
                  {detail?.node_name || node.node_name}
                </h2>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", tone.tone)}>
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                  {tone.label}
                </span>
              </div>
              <p className="mt-1 text-[12px] font-medium text-slate-500">
                {detail?.node_category || node.node_category || "未分类"} · {detail?.version || node.version} · 来源：{sourceLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-ink"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="rounded-2xl border border-line bg-slate-50 px-5 py-8 text-center text-[13px] text-slate-500">
              正在加载节点详情…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-8 text-center text-[13px] text-rose-500">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <DetailSection title="节点定义">
                <p className="text-[13px] leading-7 text-[#405070]">
                  {detail.definition || "暂无定义"}
                </p>
              </DetailSection>

              <DetailSection title="核心原则">
                <p className="text-[13px] leading-7 text-[#405070]">
                  {detail.core_principle || "暂无核心原则"}
                </p>
              </DetailSection>

              <DetailSection title="思考路径">
                <p className="whitespace-pre-line text-[13px] leading-7 text-[#405070]">
                  {detail.core_thinking || "暂无思考路径"}
                </p>
              </DetailSection>

              <DetailList title="决策逻辑" items={detail.decision_logic} />
              <DetailList title="关键问题" items={detail.key_questions} />
              <DetailList title="常见误区" items={detail.common_mistakes} />
              <TagSection title="适用场景" items={detail.applicable_scenarios} />

              <DetailSection title={`关联节点（${edges.length}）`}>
                {edges.length === 0 ? (
                  <EmptyLine>暂无关联节点</EmptyLine>
                ) : (
                  <div className="space-y-2">
                    {edges.slice(0, 8).map((edge) => (
                      <div key={edge.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-bold text-[#172452]">{edge.neighbor_name}</span>
                          <span className="rounded-full bg-[#f0edff] px-2 py-0.5 text-[10px] font-bold text-brand">
                            {edge.direction === "outgoing" ? "指向" : "来源"}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {edge.relation_type} · 权重 {edge.weight.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title={`扩展条目（${expansions.length}）`}>
                {expansions.length === 0 ? (
                  <EmptyLine>暂无已对齐扩展条目</EmptyLine>
                ) : (
                  <div className="space-y-2">
                    {expansions.slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                        <div className="text-[13px] font-bold text-[#172452]">{item.title || item.extension_type}</div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">
                          {item.summary || "暂无摘要"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailSection title={`版本记录（${versions.length}）`}>
                {versions.length === 0 ? (
                  <EmptyLine>暂无版本演进记录</EmptyLine>
                ) : (
                  <div className="space-y-2">
                    {versions.slice(0, 5).map((version) => (
                      <div key={version.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-[#172452]">{version.version}</span>
                          <span className="text-[11px] text-slate-400">{formatDate(version.created_at)}</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-slate-500">
                          {version.change_summary || version.change_type}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-[#fbfcff] px-4 py-4">
      <h3 className="text-[14px] font-black text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <DetailSection title={title}>
      {items.length === 0 ? (
        <EmptyLine>暂无内容</EmptyLine>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-[13px] leading-6 text-[#405070]">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

function TagSection({ title, items }: { title: string; items: string[] }) {
  return (
    <DetailSection title={title}>
      {items.length === 0 ? (
        <EmptyLine>暂无适用场景</EmptyLine>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="rounded-lg bg-[#f0edff] px-2.5 py-1.5 text-[12px] font-bold text-brand">
              {item}
            </span>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] text-slate-400">{children}</div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function Pagination({
  total,
  page,
  onPageChange,
}: {
  total: number;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 围绕当前页的页码窗口（最多 5 个）
  const windowSize = 5;
  let start = Math.max(1, page - 2);
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="mt-5 flex items-center justify-between text-[13px] text-slate-500">
      <span>共 {fmtNum(total)} 条</span>
      <div className="flex items-center gap-2">
        <PageButton
          icon="chevron-left"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              "h-9 w-9 rounded-lg border text-[13px] font-semibold",
              p === page ? "border-brand text-brand" : "border-line bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {p}
          </button>
        ))}
        {end < pageCount && (
          <>
            <span className="px-2">...</span>
            <button
              onClick={() => onPageChange(pageCount)}
              className="h-9 w-9 rounded-lg border border-line bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              {pageCount}
            </button>
          </>
        )}
        <PageButton
          icon="chevron-right"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
        <span className="ml-4 flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-4 text-[13px] font-semibold text-slate-600">
          {PAGE_SIZE} 条/页
        </span>
      </div>
    </div>
  );
}

function PageButton({
  icon,
  disabled,
  onClick,
}: {
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50"
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}
