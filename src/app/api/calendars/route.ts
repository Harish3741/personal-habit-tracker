import { NextResponse } from "next/server";
import { createCalendar, deleteCalendar, listCalendars, updateCalendar } from "@/lib/store";
import { normaliseFeedUrl } from "@/lib/calendar/ics";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ calendars: listCalendars() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "A calendar name is required" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !isSupportedFeedUrl(body.url)) {
    return NextResponse.json(
      { error: "Enter a published calendar URL (webcal:// or https://)" },
      { status: 400 },
    );
  }
  const calendar = createCalendar({ name: body.name, url: body.url, color: body.color });
  syncAll().catch(() => {});
  return NextResponse.json({ calendar }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "A calendar id is required" }, { status: 400 });
  }
  if (body.url !== undefined && !isSupportedFeedUrl(body.url)) {
    return NextResponse.json({ error: "Enter a valid calendar URL" }, { status: 400 });
  }
  updateCalendar(body.id, {
    name: body.name,
    url: body.url,
    color: body.color,
    enabled: body.enabled,
  });
  // A URL change invalidates the cache for that calendar.
  if (body.url !== undefined) syncAll().catch(() => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A calendar id is required" }, { status: 400 });
  deleteCalendar(id);
  return NextResponse.json({ ok: true });
}

function isSupportedFeedUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(normaliseFeedUrl(url));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
