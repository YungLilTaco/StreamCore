"use client";

import * as React from "react";
import { DockShell } from "@/components/dashboard/docks/DockShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useSelectedChannel } from "@/components/app/SelectedChannelProvider";

async function readJsonBody<T>(r: Response): Promise<T | null> {
  const text = await r.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (!r.ok) throw new Error(text.slice(0, 200) || `Request failed (${r.status})`);
    throw new Error("Invalid JSON from server");
  }
}

export function StreamInfoDock({
  dragHandleProps,
  onClose,
  dockLocked,
  onToggleDockLock
}: {
  dragHandleProps?: any;
  onClose?: () => void;
  dockLocked?: boolean;
  onToggleDockLock?: () => void;
}) {
  const { channelTwitchId, ready } = useSelectedChannel();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [gameName, setGameName] = React.useState("");
  const [gameId, setGameId] = React.useState<string>("");
  const [categoryQuery, setCategoryQuery] = React.useState("");
  const [categoryResults, setCategoryResults] = React.useState<{ id: string; name: string }[]>([]);

  /** Stream tags are free-form strings on Modify Channel Information (legacy tag UUID APIs are gone). */
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (!ready || !channelTwitchId) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/twitch/channel-info?channelTwitchId=${encodeURIComponent(channelTwitchId)}`, {
      cache: "no-store",
      signal: ac.signal
    })
      .then(async (r) => {
        const json = await readJsonBody<{
          channel?: { title?: string; game_name?: string; game_id?: string };
          tags?: unknown[];
        }>(r);
        if (!r.ok) {
          const msg =
            json && typeof json === "object" && json !== null && "message" in json
              ? String((json as { message?: string }).message)
              : `Request failed: ${r.status}`;
          throw new Error(msg);
        }
        return json;
      })
      .then((json) => {
        const ch = json?.channel;
        setTitle(ch?.title ?? "");
        setGameName(ch?.game_name ?? "");
        setGameId(ch?.game_id ?? "");
        setCategoryQuery(ch?.game_name ?? "");
        const rawTags = Array.isArray(json?.tags) ? json.tags : [];
        setTags(
          rawTags
            .map((t: any) => (typeof t === "string" ? t : String(t?.name ?? "")).trim())
            .filter(Boolean)
        );
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [ready, channelTwitchId]);

  React.useEffect(() => {
    if (!ready || !channelTwitchId) {
      setCategoryResults([]);
      return;
    }
    if (!categoryQuery.trim()) {
      setCategoryResults([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/twitch/search-categories?query=${encodeURIComponent(categoryQuery.trim())}`, {
        cache: "no-store",
        signal: ac.signal
      })
        .then(async (r) => {
          const json = await readJsonBody<{ data?: unknown[]; message?: string }>(r);
          if (!r.ok) {
            setCategoryResults([]);
            return;
          }
          const data = (json?.data ?? []) as any[];
          setCategoryResults(
            data.map((x) => ({ id: String(x.id), name: String(x.name) })).slice(0, 10)
          );
        })
        .catch((e) => {
          if (e?.name === "AbortError") return;
          setCategoryResults([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [categoryQuery, ready, channelTwitchId]);

  function addTagFromInput() {
    const next = tagInput.trim();
    if (!next) return;
    setTags((prev) => (prev.some((x) => x.toLowerCase() === next.toLowerCase()) ? prev : [...prev, next]));
    setTagInput("");
  }

  async function save() {
    if (!channelTwitchId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/twitch/channel-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelTwitchId,
          title,
          gameId: gameId || undefined,
          tags
        }),
        cache: "no-store"
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Save failed: ${res.status}`);
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DockShell
      title="Stream Info"
      right={
        saved ? (
          <span className="text-xs text-emerald-200">Saved</span>
        ) : null
      }
      dragHandleProps={dragHandleProps}
      onClose={onClose}
      dockLocked={dockLocked}
      onToggleDockLock={onToggleDockLock}
    >
      <div className="flex min-h-0 flex-col gap-3">
        {!ready ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            Resolving channel…
          </div>
        ) : null}
        {ready && !channelTwitchId ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/70">
            No Twitch channel is available yet. Sign in with Twitch or accept an invite so StreamCore knows which
            channel to use.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        <div>
          <div className="text-xs font-semibold tracking-wider text-white/50">Title</div>
          <div className="mt-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!ready || !channelTwitchId || loading || saving}
            />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-white/50">Category</div>
          <div className="mt-2">
            <Input
              value={categoryQuery}
              onChange={(e) => {
                setCategoryQuery(e.target.value);
                setGameName(e.target.value);
              }}
              placeholder={gameName ? gameName : "Search category..."}
              disabled={!ready || !channelTwitchId || loading || saving}
            />
            {categoryResults.length ? (
              <div className="mt-2 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2">
                {categoryResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setGameId(c.id);
                      setGameName(c.name);
                      setCategoryQuery(c.name);
                      setCategoryResults([]);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm text-white/75 hover:bg-white/[0.06] hover:text-white"
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="ml-2 font-mono text-[11px] text-white/40">{c.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold tracking-wider text-white/50">Tags</div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">
            Use short labels Twitch recognizes (e.g. language or topic). See the{" "}
            <a
              className="text-primary underline underline-offset-2"
              href="https://www.twitch.tv/directory/all/tags"
              target="_blank"
              rel="noreferrer"
            >
              Twitch tag list
            </a>
            .
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.length ? (
              tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/75 hover:bg-white/[0.06]"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  title="Click to remove"
                >
                  {t}
                </button>
              ))
            ) : (
              <div className="text-sm text-white/40">No tags yet.</div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag (e.g. English)…"
              disabled={!ready || !channelTwitchId || loading || saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTagFromInput();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="h-10 shrink-0"
              disabled={!ready || !channelTwitchId || loading || saving}
              onClick={addTagFromInput}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="mt-2 flex shrink-0 flex-wrap gap-2">
          <Button
            variant="primary"
            className="shadow-glow-purple"
            onClick={save}
            disabled={!ready || !channelTwitchId || loading || saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
          <Button
            variant="secondary"
            disabled={!ready || !channelTwitchId || loading || saving}
            onClick={() => {
              setTitle("");
              setGameName("");
              setGameId("");
              setCategoryQuery("");
              setTags([]);
              setTagInput("");
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    </DockShell>
  );
}

