import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/sections/Header";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Fdashboard");

  return (
    <div className="min-h-screen bg-[#0F0F0F]">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <Header mode="app" />

        <div className="mx-auto flex w-full max-w-[1480px] gap-0 px-4">
          <DashboardSidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

