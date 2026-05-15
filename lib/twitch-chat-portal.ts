import { twitchPopoutChatUrl } from "@/lib/twitch-popout-urls";
import { twitchPopoutRewardQueueUrl } from "@/lib/twitch-popout-urls";

export const TWITCH_CHAT_WINDOW = "TwitchChat";
export const TWITCH_REWARD_QUEUE_WINDOW = "TwitchRewardQueue";

const CHAT_FEATURES = "width=400,height=600,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";
const REWARD_FEATURES = "width=420,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";

export function openTwitchChatWindow(channelLogin: string): Window | null {
  const url = twitchPopoutChatUrl(channelLogin);
  const existing = typeof window !== "undefined" ? window.open("", TWITCH_CHAT_WINDOW) : null;
  if (existing && !existing.closed) {
    existing.location.href = url;
    existing.focus();
    return existing;
  }
  return window.open(url, TWITCH_CHAT_WINDOW, CHAT_FEATURES);
}

export function openTwitchRewardQueueWindow(channelLogin: string): Window | null {
  const url = twitchPopoutRewardQueueUrl(channelLogin);
  return window.open(url, TWITCH_REWARD_QUEUE_WINDOW, REWARD_FEATURES);
}
