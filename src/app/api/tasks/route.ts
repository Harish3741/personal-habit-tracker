import { NextResponse } from "next/server";
import { createTask, deleteTask, updateTask } from "@/lib/store";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Board to-dos. These are not events: they never reach the calendar grid and
 * never reach iCloud.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "A title is required" }, { status: 400 });
  }
  if (!YMD.test(body.ymd ?? "")) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }
  return NextResponse.json({ task: createTask({ ymd: body.ymd, title: body.title }) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "A task id is required" }, { status: 400 });
  }
  if (body.ymd !== undefined && !YMD.test(body.ymd)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) {
    return NextResponse.json({ error: "A title cannot be empty" }, { status: 400 });
  }
  updateTask(body.id, { title: body.title, done: body.done, ymd: body.ymd });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A task id is required" }, { status: 400 });
  deleteTask(id);
  return NextResponse.json({ ok: true });
}
