import { FeedbackAdminPage } from "@/components/feedback-admin/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="feedback" />
      <FeedbackAdminPage />
    </div>
  );
}
