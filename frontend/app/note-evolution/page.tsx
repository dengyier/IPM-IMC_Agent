import { NoteEvolutionPage } from "@/components/note-evolution/page";
import { Sidebar } from "@/components/sidebar";

export default function Page() {
  return (
    <div className="flex min-h-screen overflow-hidden bg-transparent">
      <Sidebar activeKey="notes" />
      <NoteEvolutionPage />
    </div>
  );
}
