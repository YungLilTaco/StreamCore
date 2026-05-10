import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InviteClient } from "./invite-client";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Finvite");

  const { token } = await params;

  const invite = await prisma.permissionInvite.findUnique({
    where: { token }
  });

  if (!invite) {
    return (
      <div className="min-h-screen bg-black">
        <div className="mx-auto max-w-2xl px-4 py-16 text-white">
          <div className="text-xl font-semibold">Invite not found</div>
          <div className="mt-2 text-white/70">This invite link is invalid.</div>
        </div>
      </div>
    );
  }

  const expired = invite.expiresAt ? invite.expiresAt.getTime() < Date.now() : false;
  const used = Boolean(invite.usedAt);

  return (
    <InviteClient
      token={token}
      channelDisplayName={invite.channelDisplayName}
      role={invite.role}
      expired={expired}
      used={used}
    />
  );
}

