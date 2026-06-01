import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { RightPanel } from "@/components/right-panel";
import { AssistantProvider } from "@/components/assistant-context";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="home" />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Topbar />

          <AssistantProvider>
            <div className="mt-6">
              <RightPanel />
            </div>
          </AssistantProvider>
        </main>

        <footer className="flex items-center justify-center gap-3 px-8 py-5 text-[12px] text-slate-400">
          <span>© 2025 智策科技有限公司. All rights reserved.</span>
          <span className="text-gray-300">|</span>
          <a href="#" className="hover:text-brand">隐私政策</a>
          <a href="#" className="hover:text-brand">服务条款</a>
        </footer>
      </div>
    </div>
  );
}
