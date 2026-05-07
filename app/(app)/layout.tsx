import { Sidebar } from "@/components/Sidebar";
import { AppBackground } from "@/components/AppBackground";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex relative">
      <AppBackground />
      <Sidebar />
      <main className="flex-1 min-w-0 relative z-[1] min-h-screen">
        {children}
      </main>
    </div>
  );
}
