import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppProviders } from "@/components/app/AppProviders";
import { AppShellLayout } from "@/components/app/AppShellLayout";
import { Header } from "@/components/sections/Header";
import { Footer } from "@/components/sections/Footer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side protection (production-grade).
  // Redirect unauthenticated users to /login.
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Fapp");

  return (
    <Suspense fallback={null}>
      <AppProviders>
        <div className="min-h-screen bg-black">
          <div className="relative sv-bg">
            <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
            <Header mode="app" />

            <AppShellLayout>{children}</AppShellLayout>

            <Footer />
          </div>
        </div>
      </AppProviders>
    </Suspense>
  );
}

