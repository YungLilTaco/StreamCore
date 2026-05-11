"use client";

/**
 * Dashboard-scoped state container.
 *
 * Lifts two pieces of state out of individual docks so the user profile popover (which can be
 * triggered from chat OR activity feed) can read them without re-mounting the WebSocket:
 *
 *   1. Twitch IRC chat — owned here, consumed by `LiveChatDock` and any popover. Means the WS
 *      stays alive even if the user removes the chat dock from the grid (cheap to keep open,
 *      keeps the popover's "Messages" tab populated either way).
 *   2. Per-user moderation actions performed during this dashboard session — Twitch does not
 *      expose a "get my moderation history" API, so warnings / timeouts / bans visible in the
 *      popover are necessarily session-local. Records are namespaced by lowercase login.
 *
 * Mount once at the top of the dashboard route (`/app/dashboard/page.tsx`).
 */

import * as React from "react";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import {
  useTwitchChat,
  type ChatMessage,
  type ChatStatus
} from "@/components/dashboard/docks/useTwitchChat";

export type ModActionType = "ban" | "timeout" | "unban" | "warn";

export type ModAction = {
  id: string;
  type: ModActionType;
  /** Set for `timeout` only. */
  durationSec?: number;
  reason?: string;
  /** Epoch ms when the action was recorded locally. */
  ts: number;
};

type DashboardSessionCtx = {
  chatStatus: ChatStatus;
  chatMessages: ChatMessage[];
  chatSend: (text: string) => boolean;
  /** Append an action to the session log for the given login (case-insensitive). */
  recordAction: (login: string, action: Omit<ModAction, "id" | "ts"> & { ts?: number }) => void;
  /** Session-local action log for the given login, most recent first. */
  actionsFor: (login: string) => ModAction[];
};

const Ctx = React.createContext<DashboardSessionCtx | null>(null);

/** Throws when used outside the provider — call sites that may render on marketing pages should use `useMaybeDashboardSession`. */
export function useDashboardSession(): DashboardSessionCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useDashboardSession must be used within <DashboardSessionProvider>");
  return ctx;
}

export function useMaybeDashboardSession(): DashboardSessionCtx | null {
  return React.useContext(Ctx);
}

const ACTIONS_PER_USER_CAP = 100;

export function DashboardSessionProvider({ children }: { children: React.ReactNode }) {
  const { channelTwitchId, ready } = useSelectedChannel();
  const { status, messages, send } = useTwitchChat({
    enabled: ready && !!channelTwitchId,
    channelTwitchId
  });

  const [actions, setActions] = React.useState<Record<string, ModAction[]>>({});

  const recordAction = React.useCallback<DashboardSessionCtx["recordAction"]>((login, action) => {
    const key = login.toLowerCase();
    const entry: ModAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: action.type,
      durationSec: action.durationSec,
      reason: action.reason,
      ts: action.ts ?? Date.now()
    };
    setActions((prev) => {
      const list = prev[key] ?? [];
      return { ...prev, [key]: [entry, ...list].slice(0, ACTIONS_PER_USER_CAP) };
    });
  }, []);

  const actionsFor = React.useCallback<DashboardSessionCtx["actionsFor"]>(
    (login) => actions[login.toLowerCase()] ?? [],
    [actions]
  );

  const value = React.useMemo<DashboardSessionCtx>(
    () => ({
      chatStatus: status,
      chatMessages: messages,
      chatSend: send,
      recordAction,
      actionsFor
    }),
    [status, messages, send, recordAction, actionsFor]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
