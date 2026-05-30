import { Sidebar } from "@/components/sidebar";
import { KnowledgeNodesPage } from "@/components/knowledge-nodes/page";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="knowledge" />
      <KnowledgeNodesPage />
    </div>
  );
}
