import { Sidebar } from "@/components/sidebar";
import { DataCenterPage } from "@/components/data-center/page";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="data-center" />
      <DataCenterPage />
    </div>
  );
}
