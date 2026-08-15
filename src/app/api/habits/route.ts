import { NextResponse } from "next/server";
import { createHabit, deleteHabit, listHabits, titleSuggestions, updateHabit } from "@/lib/store";
import type { MatchMode, TargetType } from "@/lib/types";

export const dynamic = "force-dynamic";

const TARGET_TYPES: TargetType[] = ["times_per_week", "days_per_week", "every_day"];
const MATCH_MODES: MatchMode[] = ["exact", "contains"];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("suggestions") !== null) {
    return NextResponse.json({ titles: titleSuggestions(params.get("calendarId") || null) });
  }
  return NextResponse.json({ habits: listHabits(true) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "A habit name is required" }, { status: 400 });
  }
  const targetType: TargetType = TARGET_TYPES.includes(body.targetType)
    ? body.targetType
    : "times_per_week";
  const habit = createHabit({
    name: body.name,
    matchTitle: typeof body.matchTitle === "string" && body.matchTitle.trim() ? body.matchTitle : body.name,
    matchMode: MATCH_MODES.includes(body.matchMode) ? body.matchMode : "exact",
    calendarId: body.calendarId ?? null,
    targetType,
    targetCount: clampTarget(body.targetCount, targetType),
    color: typeof body.color === "string" ? body.color : undefined,
  });
  return NextResponse.json({ habit }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "A habit id is required" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name;
  if (typeof body.matchTitle === "string" && body.matchTitle.trim()) patch.matchTitle = body.matchTitle;
  if (MATCH_MODES.includes(body.matchMode)) patch.matchMode = body.matchMode;
  if (body.calendarId !== undefined) patch.calendarId = body.calendarId;
  if (TARGET_TYPES.includes(body.targetType)) patch.targetType = body.targetType;
  if (body.targetCount !== undefined) {
    patch.targetCount = clampTarget(
      body.targetCount,
      (patch.targetType as TargetType) ?? "times_per_week",
    );
  }
  if (typeof body.color === "string") patch.color = body.color;
  if (typeof body.archived === "boolean") patch.archived = body.archived;

  updateHabit(body.id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A habit id is required" }, { status: 400 });
  deleteHabit(id);
  return NextResponse.json({ ok: true });
}

/** every_day is fixed at 7; the others accept 1-21 sessions a week. */
function clampTarget(value: unknown, targetType: TargetType): number {
  if (targetType === "every_day") return 7;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  const ceiling = targetType === "days_per_week" ? 7 : 21;
  return Math.min(Math.max(n, 1), ceiling);
}
