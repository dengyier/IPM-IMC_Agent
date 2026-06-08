import { Sidebar } from "@/components/sidebar";
import { HomeWorkspace } from "@/components/right-panel";
import { AssistantProvider } from "@/components/assistant-context";
import { MobileTabBar } from "@/components/mobile/tab-bar";

// 对话页：桌面与移动通用，复用工作台对话区。移动端底部带 Tab 栏。
export default function ChatPage() {
  return (
    <div className="flex min-h-dvh overflow-hidden bg-transparent md:min-h-screen">
      <Sidebar activeKey="home" showMobileMenu={false} />
      <AssistantProvider>
        <HomeWorkspace />
      </AssistantProvider>
      <MobileTabBar />
    </div>
  );
}
