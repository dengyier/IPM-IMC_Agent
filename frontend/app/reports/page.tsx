import { ReportsPage } from "@/components/reports/page";
import { Sidebar } from "@/components/sidebar";

export default function Page({
  searchParams,
}: {
  searchParams?: { reportId?: string };
}) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="reports" showMobileMenu={false} />
      <ReportsPage initialReportId={searchParams?.reportId ?? null} />
    </div>
  );
}
