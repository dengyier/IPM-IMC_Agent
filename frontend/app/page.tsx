import { Sidebar } from "@/components/sidebar";
import { HomeRouter } from "@/components/home-router";

export default function DashboardPage() {
  return (
    <div className="flex min-h-dvh overflow-hidden bg-transparent md:min-h-screen">
      <Sidebar activeKey="home" showMobileMenu={false} />
      <HomeRouter />
    </div>
  );
}
