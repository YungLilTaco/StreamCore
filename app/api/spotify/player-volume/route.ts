import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

type DeviceRow = {
  id: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent: number | null;
};

function pickControllableDevice(devices: DeviceRow[] | undefined): DeviceRow | null {
  if (!devices?.length) return null;
  const activeOk = devices.find((d) => d.is_active && !d.is_restricted);
  if (activeOk) return activeOk;
  return devices.find((d) => !d.is_restricted) ?? null;
}

/**
 * GET /api/spotify/player-volume
 *
 * Returns `{ volumePercent: number | null, code?: "no_active_device" }` for the active Spotify device.
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
    const t = await res.text().catch(() => "");
    return Response.json({ message: t || `Spotify ${res.status}` }, { status: res.status });
  }
  const json = (await res.json().catch(() => null)) as { devices?: DeviceRow[] } | null;
  const picked = pickControllableDevice(json?.devices);
  if (!picked || typeof picked.volume_percent !== "number") {
    return Response.json({ volumePercent: null, code: "no_active_device" as const });
  }
  return Response.json({ volumePercent: picked.volume_percent });
}
