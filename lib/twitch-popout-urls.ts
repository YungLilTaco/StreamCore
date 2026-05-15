import { twitchParentQueryString } from "@/lib/twitch-embed-parents";

/** Twitch pop-out panel URL (user-requested). */
export function twitchPopoutChatUrl(broadcasterLogin: string): string {
  const login = broadcasterLogin.trim().toLowerCase();
  return `https://www.twitch.tv/popout/${encodeURIComponent(login)}/chat?popout=`;
}

/**
 * Official embed chat — use when pop-out iframe hits “obscured” (parent must allow typing).
 * Same live Twitch chat, with `parent=` set for your StreamCore host.
 */
export function twitchEmbedChatUrl(broadcasterLogin: string, parentQs?: string): string {
  const login = broadcasterLogin.trim().toLowerCase();
  const parents = parentQs?.trim() || twitchParentQueryString();
  return parents
    ? `https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?${parents}&darkpopout`
    : `https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?darkpopout`;
}

export function twitchPopoutRewardQueueUrl(broadcasterLogin: string): string {
  const login = broadcasterLogin.trim().toLowerCase();
  return `https://www.twitch.tv/popout/${encodeURIComponent(login)}/reward-queue?popout=`;
}
