import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Fapp%2Fsettings");

  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    select: { provider: true, scope: true, expires_at: true }
  });

  const consents = await prisma.userConsent.findMany({
    where: { userId: session.user.id },
    orderBy: { grantedAt: "desc" },
    take: 10
  });

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="text-xs font-semibold tracking-wider text-primary/90">StreamCore</div>
        <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
          Settings
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base text-white/70">
          Link providers for your dashboard. We request the minimum scopes required for StreamCore
          features. You can unlink at any time by deleting the account row (UI coming in Phase 2.5).
        </p>

        <SettingsClient accounts={accounts} consents={consents} />
      </div>
    </div>
  );
}

