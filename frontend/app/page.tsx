import { Sidebar } from "@/components/sidebar";
import { HomeWorkspace } from "@/components/right-panel";
import { AssistantProvider } from "@/components/assistant-context";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="home" />

      <AssistantProvider>
        <HomeWorkspace />
      </AssistantProvider>
    </div>
  );
}
