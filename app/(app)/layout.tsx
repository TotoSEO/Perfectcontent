import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex relative">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 sm:px-10 py-8 sm:py-10 relative">
        <div className="mx-auto w-full max-w-[1200px] relative z-[1]">
          {children}
        </div>
      </main>
    </div>
  );
}
