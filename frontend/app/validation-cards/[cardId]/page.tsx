import { Sidebar } from "@/components/sidebar";
import { ValidationCardDetailPage } from "@/components/validation-card-detail/page";

export default function Page({ params }: { params: { cardId: string } }) {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="home" />
      <ValidationCardDetailPage cardId={params.cardId} />
    </div>
  );
}
