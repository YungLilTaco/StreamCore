import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { spotifyAccountHasLibraryScopes } from "@/lib/spotify-oauth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * GET /api/spotify/link-status
 * → { linked, libraryScopesOk, scopes }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ linked: false, libraryScopesOk: false, scopes: "" });
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "spotify" },
    select: { scope: true }
  });
  if (!account) {
    return Response.json({ linked: false, libraryScopesOk: false, scopes: "" });
  }

  const scopes = account.scope ?? "";
  const libraryScopesOk = spotifyAccountHasLibraryScopes(scopes);

  try {
    await getProviderAccessToken(session.user.id, "spotify");
    return Response.json({ linked: true, libraryScopesOk, scopes });
  } catch {
    return Response.json({ linked: false, libraryScopesOk: false, scopes });
  }
}
