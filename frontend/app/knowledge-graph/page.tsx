import { FullKnowledgeGraphPage } from "@/components/full-knowledge-graph/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="home" />
      <FullKnowledgeGraphPage />
    </div>
  );
}
