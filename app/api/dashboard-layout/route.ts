import { auth } from "@/auth";
import {
  defaultDashboardLayouts,
  DASHBOARD_DEFAULT_VISIBLE,
  parseStoredLayouts,
  serializeLayouts
} from "@/lib/dashboard-layout-defaults";
import { prisma } from "@/lib/prisma";
import type { Layouts } from "react-grid-layout";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const channelTwitchId = url.searchParams.get("channelTwitchId");
  if (!channelTwitchId) return new Response("Missing channelTwitchId", { status: 400 });

  const row = await prisma.dashboardLayout.findUnique({
    where: { userId_channelTwitchId: { userId: session.user.id, channelTwitchId } },
    select: {
      layoutsJson: true,
      visibleJson: true,
      docksLockedJson: true,
      fillDashboardRowGaps: true,
      updatedAt: true
    }
  });

  return Response.json({ layout: row ?? null });
}

type Body =
  | {
      channelTwitchId?: string;
      layoutsJson?: string;
      layoutsPatchJson?: string;
      visibleJson?: string;
      docksLockedJson?: string;
      fillDashboardRowGaps?: boolean;
    }
  | null;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as Body;

  const channelTwitchId = body?.channelTwitchId;
  if (!channelTwitchId) return new Response("Missing channelTwitchId", { status: 400 });

  const hasLayoutsJson = typeof body?.layoutsJson === "string";
  const hasPatch = typeof body?.layoutsPatchJson === "string";
  const hasDockLocks = typeof body?.docksLockedJson === "string";
  const hasFill = typeof body?.fillDashboardRowGaps === "boolean";

  let patch: Partial<Layouts> | null = null;
  if (hasPatch) {
    try {
      patch = JSON.parse(body!.layoutsPatchJson!) as Partial<Layouts>;
      if (!patch || typeof patch !== "object") return new Response("Invalid layoutsPatchJson", { status: 400 });
    } catch {
      return new Response("Invalid layoutsPatchJson", { status: 400 });
    }
  }

  if (hasLayoutsJson) {
    try {
      JSON.parse(body!.layoutsJson!);
    } catch {
      return new Response("Invalid layoutsJson", { status: 400 });
    }
  }

  let nextDockLocksJson = "{}";
  if (hasDockLocks) {
    try {
      const parsed = JSON.parse(body!.docksLockedJson!);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        nextDockLocksJson = JSON.stringify(parsed);
      } else {
        return new Response("Invalid docksLockedJson", { status: 400 });
      }
    } catch {
      return new Response("Invalid docksLockedJson", { status: 400 });
    }
  }

  if (!hasLayoutsJson && !hasPatch && body?.visibleJson === undefined && !hasDockLocks && !hasFill) {
    return new Response("Nothing to update", { status: 400 });
  }

  const row = await prisma.dashboardLayout.findUnique({
    where: { userId_channelTwitchId: { userId: session.user.id, channelTwitchId } },
    select: {
      layoutsJson: true,
      visibleJson: true,
      docksLockedJson: true,
      fillDashboardRowGaps: true
    }
  });

  let nextVisibleJson: string;
  if (body?.visibleJson !== undefined) {
    try {
      JSON.parse(body.visibleJson);
      nextVisibleJson = body.visibleJson;
    } catch {
      return new Response("Invalid visibleJson", { status: 400 });
    }
  } else if (row) {
    nextVisibleJson = row.visibleJson;
  } else {
    nextVisibleJson = JSON.stringify(DASHBOARD_DEFAULT_VISIBLE);
  }

  if (!hasDockLocks) {
    nextDockLocksJson = row?.docksLockedJson ?? "{}";
  }

  let nextLayouts: Layouts;
  if (hasLayoutsJson) {
    nextLayouts = parseStoredLayouts(body!.layoutsJson!) ?? defaultDashboardLayouts();
  } else if (row) {
    nextLayouts = parseStoredLayouts(row.layoutsJson) ?? defaultDashboardLayouts();
  } else {
    nextLayouts = defaultDashboardLayouts();
  }

  if (patch) {
    nextLayouts = { ...nextLayouts, ...patch } as Layouts;
  }

  const layoutsJson = serializeLayouts(nextLayouts);

  const nextFill =
    hasFill && typeof body!.fillDashboardRowGaps === "boolean"
      ? body!.fillDashboardRowGaps
      : (row?.fillDashboardRowGaps ?? false);

  await prisma.dashboardLayout.upsert({
    where: { userId_channelTwitchId: { userId: session.user.id, channelTwitchId } },
    create: {
      userId: session.user.id,
      channelTwitchId,
      layoutsJson,
      visibleJson: nextVisibleJson,
      docksLockedJson: nextDockLocksJson,
      fillDashboardRowGaps: nextFill
    },
    update: {
      layoutsJson,
      visibleJson: nextVisibleJson,
      docksLockedJson: nextDockLocksJson,
      fillDashboardRowGaps: nextFill
    }
  });

  return Response.json({ ok: true });
}
