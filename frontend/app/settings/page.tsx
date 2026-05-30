import { SettingsPage } from "@/components/settings/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="settings" />
      <SettingsPage />
    </div>
  );
}
