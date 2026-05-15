import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderAccessToken } from "@/lib/tokens";

/** GET → { login: string } — Twitch login for the signed-in broadcaster account. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });
  if (!account?.providerAccountId) {
    return Response.json({ message: "No Twitch account linked" }, { status: 404 });
  }

  const { accessToken } = await getProviderAccessToken(session.user.id, "twitch");
  const res = await fetch(
    `https://api.twitch.tv/helix/users?id=${encodeURIComponent(account.providerAccountId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID ?? ""
      },
      cache: "no-store"
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ message: text || `Twitch ${res.status}` }, { status: res.status });
  }

  const json = (await res.json()) as { data?: { login?: string }[] };
  const login = json.data?.[0]?.login?.trim().toLowerCase();
  if (!login) {
    return Response.json({ message: "Broadcaster login not found" }, { status: 404 });
  }

  return Response.json({ login });
}
