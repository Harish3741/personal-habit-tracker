import { NextResponse } from "next/server";
import { createLocalEvent, moveOccurrence, deleteLocalEvent, updateLocalEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Create a local event. These live only in this app — never sent to iCloud. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "A title is required" }, { status: 400 });
  }
  if (!YMD.test(body.ymd ?? "")) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  const allDay = body.allDay === true || body.startMin == null;
  const id = createLocalEvent({
    title: body.title,
    ymd: body.ymd,
    calendarId: body.calendarId ?? null,
    startMin: allDay ? null : Number(body.startMin),
    endMin: allDay || body.endMin == null ? null : Number(body.endMin),
    endYmd: YMD.test(body.endYmd ?? "") ? body.endYmd : body.ymd,
    allDay,
    notes: body.notes ?? null,
  });
  return NextResponse.json({ id, key: `local:${id}` }, { status: 201 });
}

/** Update or move an event. Moving an iCloud event detaches a local copy. */
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string") {
    return NextResponse.json({ error: "An event key is required" }, { status: 400 });
  }

  try {
    if (typeof body.toYmd === "string") {
      if (!YMD.test(body.toYmd)) {
        return NextResponse.json({ error: "Invalid target date" }, { status: 400 });
      }
      const toStartMin =
        body.toStartMin === undefined || body.toStartMin === null
          ? undefined
          : Math.min(Math.max(Math.round(Number(body.toStartMin)), 0), 24 * 60 - 15);
      if (toStartMin !== undefined && !Number.isFinite(toStartMin)) {
        return NextResponse.json({ error: "Invalid target time" }, { status: 400 });
      }
      const result = moveOccurrence(body.key, body.toYmd, toStartMin);
      return NextResponse.json(result);
    }

    if (!body.key.startsWith("local:")) {
      return NextResponse.json(
        { error: "iCloud events are read-only here — drag it to a new day to edit a local copy." },
        { status: 409 },
      );
    }

    const allDay = body.allDay === true || (body.allDay === undefined ? undefined : false);
    updateLocalEvent(body.key.slice("local:".length), {
      title: body.title,
      ymd: body.ymd,
      startMin: body.allDay === true ? null : body.startMin,
      endMin: body.allDay === true ? null : body.endMin,
      endYmd: body.endYmd,
      allDay,
      notes: body.notes,
      calendarId: body.calendarId,
    });
    return NextResponse.json({ key: body.key });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update event" },
      { status: 400 },
    );
  }
}

/** Delete a local event. Detached copies restore the hidden iCloud original. */
export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("local:")) {
    return NextResponse.json(
      { error: "Only events created here can be deleted. Delete iCloud events in Calendar." },
      { status: 409 },
    );
  }
  deleteLocalEvent(key.slice("local:".length));
  return NextResponse.json({ ok: true });
}
