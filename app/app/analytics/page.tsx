import { AppPage } from "@/components/app/AppPage";
import { auth } from "@/auth";

export default async function Page({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const sp = (await searchParams) ?? {};
  const channel = typeof sp.channel === "string" ? sp.channel : null;

  return (
    <AppPage
      title="Analytics"
      description="Performance insights that matter: retention, conversion, and what drives chat velocity."
    >
      <div className="text-sm text-white/70">
        Current channel context:{" "}
        <span className="font-mono text-white/85">{channel ?? session?.user?.name ?? "Unknown"}</span>
      </div>
    </AppPage>
  );
}

