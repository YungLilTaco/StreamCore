import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/** GET /api/spotify/link-status → { linked: boolean } */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ linked: false });
  try {
    await getProviderAccessToken(session.user.id, "spotify");
    return Response.json({ linked: true });
  } catch {
    return Response.json({ linked: false });
  }
}
