import { NextRequest, NextResponse } from "next/server";
import { ProjectInputSchema } from "@/lib/schemas";
import { createJob, listJobs } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline/run";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = ProjectInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const job = await createJob(parsed.data);
  // Fire-and-forget: the job persists its own state; the client polls GET /api/jobs/:id.
  void runPipeline(job);
  return NextResponse.json({ id: job.id }, { status: 201 });
}

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(
    jobs.map((j) => ({ id: j.id, status: j.status, currentStep: j.currentStep, createdAt: j.createdAt, title: j.input.title })),
  );
}
