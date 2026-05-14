/**
 * Persist which Channel Points redemption IDs we already turned into song requests so a dashboard
 * refresh does not re-process rows replayed from EventSub localStorage.
 */
const keyFor = (channelTwitchId: string) => `sv_song_rq_cp_done_v1_${channelTwitchId}`;
const CAP = 3000;

export function isCpRedemptionAlreadyQueued(channelTwitchId: string, redemptionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(keyFor(channelTwitchId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) && arr.includes(redemptionId);
  } catch {
    return false;
  }
}

export function markCpRedemptionQueued(channelTwitchId: string, redemptionId: string): void {
  if (typeof window === "undefined") return;
  try {
    const k = keyFor(channelTwitchId);
    const raw = localStorage.getItem(k);
    let arr: string[] = [];
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        arr = parsed;
      }
    }
    if (arr.includes(redemptionId)) return;
    arr.push(redemptionId);
    if (arr.length > CAP) arr = arr.slice(-CAP);
    localStorage.setItem(k, JSON.stringify(arr));
  } catch {
    /* ignore quota */
  }
}
