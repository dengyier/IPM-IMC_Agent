import { CanvasDiagnosisPage } from "@/components/canvas-diagnosis/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="canvas" />
      <CanvasDiagnosisPage />
    </div>
  );
}
