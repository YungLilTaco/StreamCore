import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * Returns the list of Spotify devices the user can play on, with the active one flagged.
 *
 * The Spotify Bridge dock uses this in two places:
 *   1. On initial mount, to set the volume slider's starting value.
 *   2. After the playback route returns `no_active_device`, to render a helpful list of
 *      target devices the user can wake up.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ message: text || `Spotify ${res.status}` }, { status: res.status });
  }
  const json = (await res.json().catch(() => null)) as {
    devices?: {
      id: string;
      name: string;
      type: string;
      is_active: boolean;
      is_restricted: boolean;
      volume_percent: number;
    }[];
  } | null;

  return Response.json({ devices: json?.devices ?? [] });
}
