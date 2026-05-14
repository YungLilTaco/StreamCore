import { auth } from "@/auth";
import { getProviderAccessToken } from "@/lib/tokens";

/**
 * Single endpoint for the four transport commands the Spotify Bridge dock uses:
 *   POST /api/spotify/playback?action=play        → PUT  /me/player/play
 *   POST /api/spotify/playback?action=pause       → PUT  /me/player/pause
 *   POST /api/spotify/playback?action=next        → POST /me/player/next
 *   POST /api/spotify/playback?action=previous    → POST /me/player/previous
 *   POST /api/spotify/playback?action=volume&value=0..100 → PUT /me/player/volume
 *
 * Why the volume case is special — and why it lives in this route at all:
 *
 *   Spotify returns 403 NO_ACTIVE_DEVICE when the user has no active controllable device
 *   (e.g. the app is open on a phone that's idle, or only the Web Player is open but not
 *   currently rendering audio). Hitting `/volume` blindly in that state produces a generic
 *   403 with no actionable hint. We short-circuit by fetching `/me/player/devices` first; if
 *   no `is_active` device exists, we surface a structured 409 with `code: "no_active_device"`
 *   so the dock can render a helpful "open Spotify on a device, then retry" affordance instead
 *   of a raw error toast.
 */

type Action = "play" | "pause" | "next" | "previous" | "volume";

function isAction(s: string | null): s is Action {
  return s === "play" || s === "pause" || s === "next" || s === "previous" || s === "volume";
}

type DeviceRow = {
  id: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent: number | null;
};

function pickControllableDevice(devices: DeviceRow[] | undefined): DeviceRow | null {
  if (!devices?.length) return null;
  const activeUnrestricted = devices.find((d) => d.is_active && !d.is_restricted);
  if (activeUnrestricted) return activeUnrestricted;
  const anyUnrestricted = devices.find((d) => !d.is_restricted);
  return anyUnrestricted ?? null;
}

async function fetchActiveDevice(accessToken: string): Promise<{ id: string; volume: number } | null> {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    devices?: DeviceRow[];
  } | null;
  const picked = pickControllableDevice(json?.devices);
  if (!picked) return null;
  return { id: picked.id, volume: picked.volume_percent ?? 0 };
}

/** All four transport endpoints return 204 No Content on success. */
async function spotifyTransport(accessToken: string, action: Exclude<Action, "volume">) {
  const map: Record<Exclude<Action, "volume">, { method: "PUT" | "POST"; path: string }> = {
    play: { method: "PUT", path: "/me/player/play" },
    pause: { method: "PUT", path: "/me/player/pause" },
    next: { method: "POST", path: "/me/player/next" },
    previous: { method: "POST", path: "/me/player/previous" }
  };
  const { method, path } = map[action];
  return fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  if (!isAction(action)) return Response.json({ message: "Invalid action" }, { status: 400 });

  const { accessToken } = await getProviderAccessToken(session.user.id, "spotify");

  // Volume gets a device-check first so we can surface a meaningful "no active device" error
  // instead of Spotify's bare 403.
  if (action === "volume") {
    const valueRaw = url.searchParams.get("value");
    const value = Number(valueRaw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return Response.json({ message: "value must be an integer 0..100" }, { status: 400 });
    }

    const device = await fetchActiveDevice(accessToken);
    if (!device) {
      return Response.json(
        {
          message:
            "Spotify has no controllable device for volume. Open Spotify on a phone, desktop app, or web player that allows remote control (not a restricted output) and try again.",
          code: "no_active_device"
        },
        { status: 409 }
      );
    }

    const res = await fetch(
      `https://api.spotify.com/v1/me/player/volume?volume_percent=${Math.round(value)}&device_id=${encodeURIComponent(device.id)}`,
      { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json({ message: text || `Spotify ${res.status}` }, { status: res.status });
    }
    return Response.json({ ok: true });
  }

  const res = await spotifyTransport(accessToken, action);
  if (!res.ok) {
    /**
     * Spotify's 404 NO_ACTIVE_DEVICE / 403 are both surfaced as `no_active_device` when the
     * device-listing path also yields nothing. This lets the client treat any "you need a
     * device open" failure with one branch instead of three.
     */
    if (res.status === 404 || res.status === 403) {
      const device = await fetchActiveDevice(accessToken);
      if (!device) {
        return Response.json(
          {
            message: "Spotify has no active device. Open Spotify on a device that can play audio and try again.",
            code: "no_active_device"
          },
          { status: 409 }
        );
      }
    }
    const text = await res.text().catch(() => "");
    return Response.json({ message: text || `Spotify ${res.status}` }, { status: res.status });
  }
  return Response.json({ ok: true });
}
