import { CanvasDiagnosisPage } from "@/components/canvas-diagnosis/page";
import { Sidebar } from "@/components/sidebar";
import { MobileTabBar } from "@/components/mobile/tab-bar";

export default function Page() {
  return (
    <div className="flex min-h-dvh overflow-hidden bg-transparent md:min-h-screen">
      <Sidebar activeKey="canvas" showMobileMenu={false} />
      <CanvasDiagnosisPage />
      <MobileTabBar />
    </div>
  );
}
