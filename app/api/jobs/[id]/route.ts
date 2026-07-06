import { NextResponse } from "next/server";
import { loadJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const job = await loadJob(params.id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json(job);
}
