import { BachDetailPage } from "@/components/bach-detail/page";
import { Sidebar } from "@/components/sidebar";

export default function Page({ params }: { params: { cardId: string } }) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="home" />
      <BachDetailPage cardId={params.cardId} />
    </div>
  );
}
