import fs from "node:fs/promises";
import path from "node:path";
import { Job, JobSchema, ProjectInput } from "./schemas";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export function jobDir(id: string): string {
  return path.join(DATA_DIR, "jobs", id);
}

export async function createJob(input: ProjectInput): Promise<Job> {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id,
    createdAt: new Date().toISOString(),
    input,
    status: "queued",
    currentStep: null,
    completedSteps: [],
    error: null,
    artifacts: {},
    logs: [],
  };
  await saveJob(job);
  await fs.mkdir(path.join(jobDir(id), "assets"), { recursive: true });
  return job;
}

export async function saveJob(job: Job): Promise<void> {
  JobSchema.parse(job);
  const dir = jobDir(job.id);
  await fs.mkdir(dir, { recursive: true });
  // Atomic write so a crash never leaves a corrupt job file.
  const tmp = path.join(dir, "job.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(job, null, 2));
  await fs.rename(tmp, path.join(dir, "job.json"));
}

export async function loadJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(path.join(jobDir(id), "job.json"), "utf8");
    return JobSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function listJobs(): Promise<Job[]> {
  try {
    const ids = await fs.readdir(path.join(DATA_DIR, "jobs"));
    const jobs = await Promise.all(ids.map(loadJob));
    return jobs.filter((j): j is Job => j !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}
