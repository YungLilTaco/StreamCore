"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function InviteClient({
  token,
  channelDisplayName,
  role,
  expired,
  used
}: {
  token: string;
  channelDisplayName: string;
  role: string;
  expired: boolean;
  used: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setDone(null);
    try {
      const res = await fetch("/api/permissions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (!res.ok) throw new Error(await res.text());
      setDone("Accepted. You can close this tab.");
      window.location.href = "/app/dashboard";
    } catch {
      setDone("Failed to accept invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="relative sv-bg">
        <div className="pointer-events-none absolute inset-0 sv-grid opacity-[0.18]" />
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-16">
          <Card className="w-full p-6 md:p-8">
            <div className="text-xs font-semibold tracking-wider text-primary/90">StreamCore</div>
            <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Permission Invite
            </h1>
            <p className="mt-3 text-white/70">
              You&apos;ve been invited to manage{" "}
              <span className="font-semibold text-white">{channelDisplayName}</span> with role{" "}
              <span className="font-semibold text-white">{role}</span>.
            </p>

            {expired ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                This invite has expired.
              </div>
            ) : used ? (
              <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                This invite was already used.
              </div>
            ) : (
              <div className="mt-6 flex gap-3">
                <Button variant="primary" className="h-11 shadow-glow-purple" disabled={busy} onClick={accept}>
                  Accept invite
                </Button>
                <Button variant="secondary" className="h-11" onClick={() => (window.location.href = "/")}>
                  Cancel
                </Button>
              </div>
            )}

            {done ? <div className="mt-4 text-sm text-white/65">{done}</div> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

