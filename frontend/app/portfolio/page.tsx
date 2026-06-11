import { PortfolioPage } from "@/components/portfolio/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="portfolio" />
      <PortfolioPage />
    </div>
  );
}
