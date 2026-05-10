import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PermissionsClient } from "./permissions-client";

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=%2Fapp%2Fpermissions");

  const twitchAccount = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitch" },
    select: { providerAccountId: true }
  });

  const selfChannel = {
    channelTwitchId: twitchAccount?.providerAccountId ?? "",
    channelDisplayName: session.user.name ?? "My channel"
  };

  const permissions = selfChannel.channelTwitchId
    ? await prisma.channelPermission.findMany({
        where: { channelTwitchId: selfChannel.channelTwitchId },
        include: { user: { select: { id: true, name: true, image: true } } },
        orderBy: [{ createdAt: "asc" }]
      })
    : [];

  const recentInvites = await prisma.permissionInvite.findMany({
    where: { createdByUserId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  return (
    <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="text-xs font-semibold tracking-wider text-primary/90">StreamCore</div>
        <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-white md:text-4xl">
          Permissions
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-base text-white/70">
          Generate invite links to grant editors/moderators access to your StreamCore settings.
        </p>

        <PermissionsClient
          selfChannel={selfChannel}
          permissions={permissions}
          recentInvites={recentInvites}
        />
      </div>
    </div>
  );
}

