import { Sidebar } from "@/components/sidebar";
import { AssistantProvider } from "@/components/assistant-context";
import { KnowledgeNodesPage } from "@/components/knowledge-nodes/page";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="knowledge" />
      <AssistantProvider>
        <KnowledgeNodesPage />
      </AssistantProvider>
    </div>
  );
}
