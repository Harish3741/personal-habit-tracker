import { NextResponse } from "next/server";
import { syncAll, syncStatus } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sync: syncStatus() });
}

/** Manual refresh. Concurrent calls share one in-flight run. */
export async function POST() {
  const results = await syncAll();
  return NextResponse.json({ results, sync: syncStatus() });
}
