import { ReviewPage } from "@/components/review/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="review" />
      <ReviewPage />
    </div>
  );
}
