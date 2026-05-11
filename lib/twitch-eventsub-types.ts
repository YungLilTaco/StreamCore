/**
 * Twitch EventSub WebSocket — declarative subscription catalog + payload→activity-row mapper.
 *
 * Used by:
 *  - `app/api/twitch/eventsub/subscribe/route.ts` to register subscriptions for a client WS session
 *  - `components/dashboard/docks/useTwitchEventSub.ts` to translate notifications into UI rows
 *
 * Scopes: each entry lists `requiredAnyScope` — the user must have at least ONE of those scopes
 * granted, otherwise the subscription is skipped server-side (Twitch would 401 anyway).
 *
 * For self-channel subscriptions only — Twitch enforces broadcaster == bearer-token-user for most
 * of these types. The API route also enforces this with a 403 for cross-channel attempts.
 */

import type { ActivityFeedEventKind, ActivityFeedItemDTO } from "@/lib/twitch-activity-feed-model";

export type EventSubSubscriptionDef = {
  type: string;
  version: string;
  /** Condition builder — `broadcasterId` is the user's own Twitch user_id (== moderator for self). */
  condition: (broadcasterId: string) => Record<string, string>;
  /** Required OAuth scopes (any one). Empty = no scope required (e.g. `channel.raid` to_broadcaster). */
  requiredAnyScope: string[];
};

/** Full subscription catalog. Keep ordered by importance so a `succeeded` count in the UI is meaningful. */
export const EVENTSUB_SUBSCRIPTION_DEFS: EventSubSubscriptionDef[] = [
  {
    type: "channel.follow",
    version: "2",
    condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }),
    requiredAnyScope: ["moderator:read:followers"]
  },
  {
    type: "channel.subscribe",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:subscriptions"]
  },
  {
    type: "channel.subscription.gift",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:subscriptions"]
  },
  {
    type: "channel.subscription.message",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:subscriptions"]
  },
  {
    type: "channel.cheer",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["bits:read"]
  },
  {
    /** Incoming raids — we are the destination broadcaster. No scope required. */
    type: "channel.raid",
    version: "1",
    condition: (id) => ({ to_broadcaster_user_id: id }),
    requiredAnyScope: []
  },
  {
    type: "channel.channel_points_custom_reward_redemption.add",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:redemptions", "channel:manage:redemptions"]
  },
  {
    type: "channel.poll.begin",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:polls", "channel:manage:polls"]
  },
  {
    type: "channel.poll.end",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:polls", "channel:manage:polls"]
  },
  {
    type: "channel.prediction.begin",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:predictions", "channel:manage:predictions"]
  },
  {
    type: "channel.prediction.end",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:predictions", "channel:manage:predictions"]
  },
  {
    type: "channel.hype_train.begin",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:hype_train"]
  },
  {
    type: "channel.hype_train.end",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:hype_train"]
  },
  {
    type: "channel.goal.begin",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:goals"]
  },
  {
    type: "channel.goal.end",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id }),
    requiredAnyScope: ["channel:read:goals"]
  },
  {
    type: "channel.shoutout.create",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }),
    requiredAnyScope: ["moderator:read:shoutouts", "moderator:manage:shoutouts"]
  },
  {
    type: "channel.shoutout.receive",
    version: "1",
    condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }),
    requiredAnyScope: ["moderator:read:shoutouts", "moderator:manage:shoutouts"]
  }
];

/** Pretty tier label from Twitch tier code (`1000` | `2000` | `3000`). */
export function eventSubTierLabel(tier: string | undefined): string {
  if (tier === "3000") return "Tier 3";
  if (tier === "2000") return "Tier 2";
  return "Tier 1";
}

type EventSubNotification = {
  metadata: { message_id: string; message_timestamp: string; subscription_type?: string };
  payload: { event?: Record<string, unknown> };
};

/**
 * Convert an EventSub notification message into an `ActivityFeedItemDTO` (or null if unsupported).
 *
 * The row `id` is namespaced with `evtsub-` so it can never collide with snapshot rows from the
 * Helix-based `/api/twitch/activity-feed` endpoint. `ts` comes from the Twitch-provided message
 * timestamp so two rapid events arriving in the same tick still sort deterministically.
 */
export function eventSubPayloadToActivityRow(
  type: string,
  message: EventSubNotification
): ActivityFeedItemDTO | null {
  const ts = Date.parse(message.metadata.message_timestamp) || Date.now();
  const id = `evtsub-${message.metadata.message_id}`;
  const e = (message.payload?.event ?? {}) as Record<string, unknown>;

  const str = (k: string): string => (typeof e[k] === "string" ? (e[k] as string) : "");
  const num = (k: string): number | undefined => (typeof e[k] === "number" ? (e[k] as number) : undefined);
  const bool = (k: string): boolean => e[k] === true;

  let kind: ActivityFeedEventKind | null = null;
  let text = "";
  let actorLogin: string | undefined;
  let actorTwitchId: string | undefined;
  let actorDisplayName: string | undefined;
  let targetLogin: string | undefined;
  let targetTwitchId: string | undefined;
  let targetDisplayName: string | undefined;

  /** Pull `user_*` triplet (id/login/name) into the actor slot. */
  const captureActorFromUser = () => {
    actorTwitchId = str("user_id") || undefined;
    actorLogin = str("user_login") || undefined;
    actorDisplayName = str("user_name") || undefined;
  };

  switch (type) {
    case "channel.follow":
      kind = "follow";
      captureActorFromUser();
      text = `${actorDisplayName || actorLogin || "Someone"} followed`;
      break;
    case "channel.subscribe": {
      kind = bool("is_gift") ? "gift_sub" : "sub";
      captureActorFromUser();
      text = `${actorDisplayName || actorLogin || "Someone"} subscribed (${eventSubTierLabel(str("tier"))})`;
      break;
    }
    case "channel.subscription.gift": {
      kind = "gift_sub";
      if (!bool("is_anonymous")) captureActorFromUser();
      const gifter = bool("is_anonymous") ? "Anonymous" : actorDisplayName || actorLogin || "Someone";
      const total = num("total") ?? 1;
      text = `${gifter} gifted ${total} × ${eventSubTierLabel(str("tier"))} sub${total === 1 ? "" : "s"}`;
      break;
    }
    case "channel.subscription.message": {
      kind = "sub";
      captureActorFromUser();
      const months = num("cumulative_months");
      text = `${actorDisplayName || actorLogin || "Someone"} resubscribed (${eventSubTierLabel(str("tier"))}${months ? `, ${months} mo` : ""})`;
      break;
    }
    case "channel.cheer": {
      kind = "cheer";
      if (!bool("is_anonymous")) captureActorFromUser();
      const who = bool("is_anonymous") ? "Anonymous" : actorDisplayName || actorLogin || "Someone";
      const bits = num("bits");
      text = `${who} cheered${bits ? ` ${bits} bits` : ""}`;
      break;
    }
    case "channel.raid": {
      kind = "raid";
      actorTwitchId = str("from_broadcaster_user_id") || undefined;
      actorLogin = str("from_broadcaster_user_login") || undefined;
      actorDisplayName = str("from_broadcaster_user_name") || undefined;
      const viewers = num("viewers");
      text = `${actorDisplayName || actorLogin || "Someone"} raided${viewers ? ` with ${viewers} viewers` : ""}`;
      break;
    }
    case "channel.channel_points_custom_reward_redemption.add": {
      kind = "channel_points_redeem";
      captureActorFromUser();
      const reward = e.reward as { title?: string; cost?: number } | undefined;
      const title = reward?.title ?? "Channel Points";
      const cost = reward?.cost;
      text = `${actorDisplayName || actorLogin || "Someone"}: ${title}${typeof cost === "number" ? ` (${cost} pts)` : ""}`;
      break;
    }
    case "channel.poll.begin":
      kind = "poll";
      text = `Poll started: ${str("title") || "(untitled)"}`;
      break;
    case "channel.poll.end": {
      kind = "poll";
      const status = str("status").toLowerCase();
      text = `Poll ended: ${str("title") || "(untitled)"}${status ? ` (${status})` : ""}`;
      break;
    }
    case "channel.prediction.begin":
      kind = "prediction";
      text = `Prediction started: ${str("title") || "(untitled)"}`;
      break;
    case "channel.prediction.end": {
      kind = "prediction";
      const status = str("status").toLowerCase();
      text = `Prediction ended: ${str("title") || "(untitled)"}${status ? ` (${status})` : ""}`;
      break;
    }
    case "channel.hype_train.begin":
      kind = "hype_train";
      text = `Hype Train started (level ${num("level") ?? 1})`;
      break;
    case "channel.hype_train.end": {
      kind = "hype_train";
      const total = num("total");
      const level = num("level");
      text = `Hype Train ended${level ? ` at level ${level}` : ""}${total ? ` (${total} total)` : ""}`;
      break;
    }
    case "channel.goal.begin":
      kind = "goal";
      text = `Goal started: ${str("description") || str("type") || "goal"} → ${num("target_amount") ?? "?"}`;
      break;
    case "channel.goal.end":
      kind = "goal";
      text = `Goal ended: ${str("description") || str("type") || "goal"} (${bool("is_achieved") ? "achieved" : "not achieved"})`;
      break;
    case "channel.shoutout.create":
      kind = "shoutout";
      targetTwitchId = str("to_broadcaster_user_id") || undefined;
      targetLogin = str("to_broadcaster_user_login") || undefined;
      targetDisplayName = str("to_broadcaster_user_name") || undefined;
      text = `Shoutout sent to ${targetDisplayName || targetLogin || "Someone"}`;
      break;
    case "channel.shoutout.receive":
      kind = "shoutout";
      actorTwitchId = str("from_broadcaster_user_id") || undefined;
      actorLogin = str("from_broadcaster_user_login") || undefined;
      actorDisplayName = str("from_broadcaster_user_name") || undefined;
      text = `Shoutout received from ${actorDisplayName || actorLogin || "Someone"}`;
      break;
    default:
      return null;
  }

  if (!kind || !text) return null;
  return {
    id,
    kind,
    text,
    ts,
    actorLogin,
    actorTwitchId,
    actorDisplayName,
    targetLogin,
    targetTwitchId,
    targetDisplayName
  };
}
