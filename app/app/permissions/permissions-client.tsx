"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Copy, Link2, Pencil, ShieldCheck, Trash2 } from "lucide-react";

type Role = "BASIC_EDITOR" | "EDITOR" | "FULL_CONTROL";

export function PermissionsClient({
  selfChannel,
  permissions,
  recentInvites
}: {
  selfChannel: { channelTwitchId: string; channelDisplayName: string };
  permissions: Array<{
    id: string;
    role: Role;
    user: { id: string; name: string | null; image: string | null };
  }>;
  recentInvites: Array<{
    id: string;
    token: string;
    channelDisplayName: string;
    role: Role;
    usedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }>;
}) {
  const [role, setRole] = useState<Role>("EDITOR");
  const [expiresInHours, setExpiresInHours] = useState("168"); // 7 days default
  const [generated, setGenerated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permBusyId, setPermBusyId] = useState<string | null>(null);

  const canGenerate = Boolean(selfChannel.channelTwitchId);

  const roleLabel = useMemo(() => {
    switch (role) {
      case "BASIC_EDITOR":
        return "Basic Editor";
      case "EDITOR":
        return "Editor";
      case "FULL_CONTROL":
        return "Full Control";
    }
  }, [role]);

  async function generate() {
    setBusy(true);
    setGenerated(null);
    try {
      const res = await fetch("/api/permissions/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          expiresInHours: Number(expiresInHours || 0) || null
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { url: string };
      setGenerated(json.url);
    } catch (e) {
      setGenerated("Failed to generate link. Check server logs.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  function initials(name: string) {
    return (
      name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join("") || "SC"
    );
  }

  async function revokePermission(permissionId: string) {
    setPermBusyId(permissionId);
    try {
      const res = await fetch("/api/permissions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionId })
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setPermBusyId(null);
    }
  }

  async function updatePermission(permissionId: string, nextRole: Role) {
    setPermBusyId(permissionId);
    try {
      const res = await fetch("/api/permissions/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionId, role: nextRole })
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setPermBusyId(null);
    }
  }

  function origin() {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }

  return (
    <div className="mt-8 grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Permission Link Generator
            </div>
            <div className="mt-2 text-sm text-white/65">
              Generates a unique URL you can send to a moderator/editor.
            </div>
          </div>
          <div className="text-xs font-semibold text-white/60">
            {canGenerate ? "Ready" : "Missing Twitch channel id"}
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <div className="grid gap-2">
            <div className="text-xs font-semibold tracking-wider text-white/55">Role</div>
            <div className="flex flex-wrap gap-2">
              {(["BASIC_EDITOR", "EDITOR", "FULL_CONTROL"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm transition",
                    role === r
                      ? "border-primary/35 bg-primary/[0.10] text-white"
                      : "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"
                  ].join(" ")}
                >
                  {r === "BASIC_EDITOR" ? "Basic Editor" : r === "EDITOR" ? "Editor" : "Full Control"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs font-semibold tracking-wider text-white/55">Expires in hours</div>
            <Input
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(e.target.value)}
              placeholder="168"
            />
            <div className="text-xs text-white/50">
              Tip: set to 0/empty for no expiry (not recommended).
            </div>
          </div>

          <Button
            variant="primary"
            className="h-11 shadow-glow-purple"
            disabled={!canGenerate || busy}
            onClick={generate}
          >
            <Link2 className="h-4 w-4" />
            Generate Link ({roleLabel})
          </Button>

          {generated ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold tracking-wider text-white/55">Invite URL</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/75">
                  {generated}
                </div>
                <Button
                  variant="secondary"
                  className="h-9"
                  onClick={() => copy(generated)}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-semibold text-white">Channel permissions</div>
        <p className="mt-2 text-sm text-white/65">
          People who can manage <span className="font-semibold text-white">{selfChannel.channelDisplayName}</span>.
        </p>

        <div className="mt-4 space-y-2">
          {permissions.length ? (
            permissions.map((p) => {
              const name = p.user.name ?? "Unknown user";
              const img = p.user.image ?? undefined;
              const disabled = permBusyId === p.id;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={img} alt={name} />
                      <AvatarFallback>{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white/85">{name}</div>
                      <div className="text-xs text-white/55">{p.role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={disabled}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
                          aria-label="Edit permission"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                          value={p.role}
                          onValueChange={(v) => updatePermission(p.id, v as Role)}
                        >
                          <DropdownMenuRadioItem value="BASIC_EDITOR">Basic Editor</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="EDITOR">Editor</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="FULL_CONTROL">Full Control</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-200 focus:text-red-100"
                          onSelect={() => revokePermission(p.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Revoke access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => revokePermission(p.id)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-red-200 hover:bg-white/[0.06] disabled:opacity-50"
                      aria-label="Revoke access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-white/60">No permissions granted yet.</div>
          )}
        </div>
      </Card>
      </div>

      <Card className="p-6">
        <div className="text-sm font-semibold text-white">Recent invites</div>
        <p className="mt-2 text-sm text-white/65">Single-use links you generated.</p>
        <div className="mt-4 space-y-2">
          {recentInvites.length ? (
            recentInvites.map((inv) => {
              const url = `${origin()}/invite/${inv.token}`;
              return (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">
                      {inv.channelDisplayName} • <span className="text-white/65">{inv.role}</span>
                    </div>
                    <div className="text-xs text-white/45">
                      {inv.usedAt ? "Used" : "Unused"} • {new Date(inv.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button variant="secondary" className="h-9" onClick={() => copy(url)}>
                    <Copy className="h-4 w-4" />
                    Copy URL
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-white/60">No invites yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

