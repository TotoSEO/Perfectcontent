import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 sm:px-8 py-7 sm:py-9">
        <div className="mx-auto w-full max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  );
}
