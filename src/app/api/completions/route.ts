import { NextResponse } from "next/server";
import { setCompletion } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Tick or untick an event. This is the only way a habit gets credited — there
 * is deliberately no habit-level "mark done" endpoint.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.key !== "string" || typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "key and completed are required" }, { status: 400 });
  }
  try {
    setCompletion(body.key, body.completed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update completion" },
      { status: 400 },
    );
  }
}
