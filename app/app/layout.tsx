import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Header } from "@/components/sections/Header";
import { Sidebar } from "@/components/sections/Sidebar";
import { Footer } from "@/components/sections/Footer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side protection (production-grade).
  // Redirect unauthenticated users to /login.
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Fapp");

  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <Header mode="app" />

        <div className="mx-auto flex w-full max-w-[1480px] gap-0 px-4">
          <Sidebar />
          {children}
        </div>

        <Footer />
      </div>
    </div>
  );
}

