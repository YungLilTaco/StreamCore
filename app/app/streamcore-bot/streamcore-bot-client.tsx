"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Radio, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";
import { cn } from "@/components/lib/cn";
import { BUILTIN_BOT_COMMANDS, BOT_TEMPLATE_VARIABLES_DOC } from "@/lib/streamcore-bot-docs";

/**
 * Wire-format types shared with the API routes. Kept inline so this file stays self-contained;
 * the routes are the source of truth and the shape rarely changes.
 */
type BotCommandDTO = {
  id: string;
  trigger: string;
  response: string;
  enabled: boolean;
  cooldownSec: number;
  modOnly: boolean;
  updatedAt: string | null;
};

type BotSettingsDTO = {
  enabled: boolean;
  prefix: string;
  prefixRepliesAsHelper: boolean;
  greetingEnabled: boolean;
  greetingMessage: string | null;
  updatedAt: string | null;
};

export function StreamCoreBotClient() {
  const { channelTwitchId, ready } = useSelectedChannel();

  return (
    <div className="space-y-8">
      {!ready ? (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/65">
          Resolving channel…
        </div>
      ) : !channelTwitchId ? (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-white/65">
          Select your channel from the header menu to manage the bot.
        </div>
      ) : (
        <>
          <EngineRuntimeBanner />
          <BotSettingsSection channelTwitchId={channelTwitchId} />
          <BuiltinCommandsSection />
          <TemplateVariablesSection />
          <BotCommandsSection channelTwitchId={channelTwitchId} />
        </>
      )}
    </div>
  );
}

/**
 * The bot runtime is an in-browser engine that piggybacks on the dashboard's authenticated IRC
 * connection (see BotEngineProvider). Editing commands here doesn't run anything by itself —
 * the user needs to keep the live dashboard tab open for the engine to answer chatters.
 */
function EngineRuntimeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.08] p-4 text-sm text-white/85">
      <Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="leading-relaxed">
        <div className="font-semibold text-white">Engine runs from the live dashboard tab.</div>
        StreamCoreHelper executes commands in-browser using your broadcaster IRC connection. Edits saved here are
        live the moment your <Link href="/app/dashboard" className="underline decoration-primary/50 hover:text-white">live dashboard</Link>{" "}
        tab refreshes the catalog (within 30 seconds). Closing the dashboard tab pauses the bot.
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-white/55">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function BuiltinCommandsSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Built-in commands"
        subtitle="Handled by the engine even if they are not in your custom list. If you add a custom command with the same trigger, the custom one takes over."
      />
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-white/55">
            <tr>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">What it does</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {BUILTIN_BOT_COMMANDS.map((r) => (
              <tr key={r.trigger} className="bg-black/20">
                <td className="px-3 py-2 font-mono text-primary">{r.trigger}</td>
                <td className="px-3 py-2 text-white/75">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-white/45">
        In chat, use your configured <span className="font-mono text-white/60">Trigger prefix</span> before the trigger
        (default <span className="font-mono text-white/60">!</span>, e.g. <span className="font-mono text-white/60">!help</span>
        ).
      </p>
      <p className="text-xs text-white/45">
        <span className="font-mono text-white/60">!volume</span> who can run it (subs/VIPs/mods/everyone) is configured on the{" "}
        <Link href="/app/song-requests" className="text-primary/90 underline decoration-primary/40 hover:text-white">
          Song requests
        </Link>{" "}
        page — same style of role gates as song requests, separate from the list below.
      </p>
    </section>
  );
}

function TemplateVariablesSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Template variables"
        subtitle="Reference for the “Bot message” field and the greeting. Syntax must match exactly (including curly braces)."
      />
      <textarea
        readOnly
        rows={16}
        value={BOT_TEMPLATE_VARIABLES_DOC}
        className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-white/80 outline-none"
        spellCheck={false}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Bot runtime settings (master enabled, prefix, greeting)                     *
 * -------------------------------------------------------------------------- */

function BotSettingsSection({ channelTwitchId }: { channelTwitchId: string }) {
  const [settings, setSettings] = React.useState<BotSettingsDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/channel/bot-settings?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "no-store"
    })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.json().catch(() => null))))
      .then((j: { settings: BotSettingsDTO }) => {
        if (!cancelled) {
          setSettings({
            ...j.settings,
            prefixRepliesAsHelper: Boolean(j.settings.prefixRepliesAsHelper)
          });
          setDirty(false);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e?.message === "string" ? e.message : "Could not load bot settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelTwitchId]);

  function patch(next: Partial<BotSettingsDTO>) {
    setSettings((cur) => (cur ? { ...cur, ...next } : cur));
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/channel/bot-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          channelTwitchId,
          enabled: settings.enabled,
          prefix: settings.prefix,
          prefixRepliesAsHelper: settings.prefixRepliesAsHelper,
          greetingEnabled: settings.greetingEnabled,
          greetingMessage: settings.greetingMessage
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Save failed (${res.status})`);
      setSettings({
        ...(json.settings as BotSettingsDTO),
        prefixRepliesAsHelper: Boolean((json.settings as BotSettingsDTO).prefixRepliesAsHelper)
      });
      setDirty(false);
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Bot runtime"
        subtitle="Global on/off, trigger prefix, and the optional greeting StreamCoreHelper says when chat first comes online."
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : settings ? (
        <div className="space-y-4 rounded-lg border border-white/10 bg-black/30 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/85">
              <span className="font-semibold text-white">Bot enabled</span>
              <span className="ml-2 text-xs text-white/55">Run StreamCoreHelper on this channel.</span>
            </span>
            <Toggle checked={settings.enabled} onChange={(v) => patch({ enabled: v })} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
            <label htmlFor="bot-prefix" className="text-xs font-medium uppercase tracking-wide text-white/55">
              Trigger prefix
            </label>
            <Input
              id="bot-prefix"
              value={settings.prefix}
              maxLength={3}
              onChange={(e) => patch({ prefix: e.target.value })}
              placeholder="!"
              className="max-w-[120px]"
            />
          </div>

          <label className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <span className="text-sm text-white/85">
              <span className="font-semibold text-white">Post replies as raw broadcaster</span>
              <span className="ml-2 block text-xs text-white/55">
                <strong className="text-white/80">Off (default):</strong> each bot line is prefixed with{" "}
                <span className="font-mono text-white/70">StreamCoreHelper ·</span> so chat can tell automation apart.{" "}
                <strong className="text-white/80">On:</strong> messages are sent without that label (still from{" "}
                <strong className="text-white/80">your</strong> Twitch account over IRC — not a separate bot login).
              </span>
            </span>
            <Toggle
              checked={settings.prefixRepliesAsHelper}
              onChange={(v) => patch({ prefixRepliesAsHelper: v })}
            />
          </label>

          <div className="space-y-2 border-t border-white/10 pt-4">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-white/85">
                <span className="font-semibold text-white">Greeting on join</span>
                <span className="ml-2 text-xs text-white/55">Sent the first time the bot connects each session.</span>
              </span>
              <Toggle
                checked={settings.greetingEnabled}
                onChange={(v) => patch({ greetingEnabled: v })}
              />
            </label>
            <Input
              value={settings.greetingMessage ?? ""}
              disabled={!settings.greetingEnabled}
              placeholder="Hey chat! StreamCoreHelper online — type !help for commands."
              maxLength={500}
              onChange={(e) => patch({ greetingMessage: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            {error ? <span className="text-xs text-rose-300">{error}</span> : null}
            <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-rose-300">{error ?? "Could not load bot settings."}</div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- *
 * Bot commands CRUD                                                           *
 * -------------------------------------------------------------------------- */

function BotCommandsSection({ channelTwitchId }: { channelTwitchId: string }) {
  const [commands, setCommands] = React.useState<BotCommandDTO[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{
    trigger: string;
    response: string;
    cooldownSec: number;
    modOnly: boolean;
  }>({ trigger: "", response: "", cooldownSec: 5, modOnly: false });
  const [adding, setAdding] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/channel/bot-commands?channelTwitchId=${encodeURIComponent(channelTwitchId)}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Load failed (${res.status})`);
      setCommands(json.commands as BotCommandDTO[]);
      setError(null);
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [channelTwitchId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    const trigger = draft.trigger.replace(/^!+/, "").trim();
    if (!trigger || !draft.response.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/channel/bot-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          channelTwitchId,
          trigger,
          response: draft.response.trim(),
          cooldownSec: draft.cooldownSec,
          modOnly: draft.modOnly,
          enabled: true
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Save failed (${res.status})`);
      setDraft({ trigger: "", response: "", cooldownSec: 5, modOnly: false });
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Save failed.");
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(cmd: BotCommandDTO) {
    try {
      const res = await fetch("/api/channel/bot-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          channelTwitchId,
          trigger: cmd.trigger,
          response: cmd.response,
          cooldownSec: cmd.cooldownSec,
          modOnly: cmd.modOnly,
          enabled: !cmd.enabled
        })
      });
      if (!res.ok) throw new Error(`Toggle failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Toggle failed.");
    }
  }

  async function remove(cmd: BotCommandDTO) {
    if (!confirm(`Delete command !${cmd.trigger}?`)) return;
    try {
      const url = `/api/channel/bot-commands?channelTwitchId=${encodeURIComponent(channelTwitchId)}&trigger=${encodeURIComponent(cmd.trigger)}`;
      const res = await fetch(url, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      await refresh();
    } catch (e) {
      setError(typeof (e as Error)?.message === "string" ? (e as Error).message : "Delete failed.");
    }
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Chat commands"
        subtitle="Templates can reference inline variables: ${user}, ${target}, ${streamer}, ${random:1-100}."
      />

      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <p className="mb-3 text-xs text-white/55">
          Trigger the bot in chat using <span className="font-mono text-white/75">!</span> followed by your command
          name (you don&apos;t type the <span className="font-mono text-white/75">!</span> in the field below — it is
          added automatically).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,120px)_auto] sm:items-end">
          <div className="space-y-1">
            <label htmlFor="bot-cmd-trigger" className="text-xs font-medium text-white/70">
              Command trigger
            </label>
            <Input
              id="bot-cmd-trigger"
              placeholder="e.g. hug"
              value={draft.trigger}
              onChange={(e) => {
                let v = e.target.value;
                if (v.startsWith("!")) v = v.slice(1);
                setDraft((d) => ({ ...d, trigger: v }));
              }}
              maxLength={32}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bot-cmd-message" className="text-xs font-medium text-white/70">
              Bot message
            </label>
            <Input
              id="bot-cmd-message"
              placeholder='e.g. "${user} hugs ${target} 🤗"'
              value={draft.response}
              onChange={(e) => setDraft((d) => ({ ...d, response: e.target.value }))}
              maxLength={500}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="bot-cmd-cooldown" className="text-xs font-medium text-white/70">
              Cooldown (seconds)
            </label>
            <Input
              id="bot-cmd-cooldown"
              type="number"
              min={0}
              max={3600}
              placeholder="5"
              value={String(draft.cooldownSec)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cooldownSec: Math.max(0, Math.min(3600, Number(e.target.value) || 0)) }))
              }
            />
          </div>
          <Button variant="primary" disabled={adding} onClick={() => void add()} className="sm:mb-0.5">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-white/65">
          <input
            type="checkbox"
            checked={draft.modOnly}
            onChange={(e) => setDraft((d) => ({ ...d, modOnly: e.target.checked }))}
            className="h-4 w-4 accent-primary"
          />
          Restrict to moderators
        </label>
      </div>

      {error ? <div className="text-xs text-rose-300">{error}</div> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading commands…
        </div>
      ) : (commands?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/55">
          No custom commands yet. Built-in <span className="font-mono text-white/70">help</span> /{" "}
          <span className="font-mono text-white/70">commands</span> still work — add your own above when you are ready.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Response template</th>
                <th className="px-3 py-2">Cooldown</th>
                <th className="px-3 py-2">Mod only</th>
                <th className="px-3 py-2">Enabled</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {commands!.map((c) => (
                <tr key={c.id} className="bg-black/20 hover:bg-white/[0.03]">
                  <td className="px-3 py-2 font-mono text-primary">!{c.trigger}</td>
                  <td className="px-3 py-2 text-white/80">{c.response}</td>
                  <td className="px-3 py-2 tabular-nums text-white/65">{c.cooldownSec}s</td>
                  <td className="px-3 py-2 text-white/65">{c.modOnly ? "Yes" : "—"}</td>
                  <td className="px-3 py-2">
                    <Toggle checked={c.enabled} onChange={() => void toggleEnabled(c)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(c)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/60 transition hover:bg-rose-500/15 hover:text-rose-200"
                      aria-label={`Delete !${c.trigger}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-50",
        checked ? "border-primary/60 bg-primary/30" : "border-white/15 bg-white/[0.04]"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full transition",
          checked ? "left-5 bg-primary shadow-[0_0_10px_rgba(168,85,247,0.6)]" : "left-0.5 bg-white/70"
        )}
      />
    </button>
  );
}
