"use client";
import { useEffect, useState } from "react";

const STEP_LABELS: Record<string, string> = {
  script: "1. Roteiro",
  tts: "2. Narração",
  timing: "3. Sincronização de cenas",
  prompts: "4. Prompts de imagem",
  images: "5. Geração de imagens",
  subtitles: "6. Legendas",
  qa: "7. Checagem de qualidade",
  assemble: "8. Montagem do vídeo",
  metadata: "9. Título / descrição / tags",
};

export default function JobPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      const res = await fetch(`/api/jobs/${params.id}`);
      if (res.ok) {
        const j = await res.json();
        if (!stop) setJob(j);
        if (["done", "failed", "blocked_by_qa"].includes(j.status)) return;
      }
      if (!stop) setTimeout(poll, 2500);
    };
    poll();
    return () => { stop = true; };
  }, [params.id]);

  if (!job) return <p>Carregando...</p>;

  const statusMsg: Record<string, string> = {
    queued: "⏳ Na fila...",
    running: `⚙️ Processando: ${STEP_LABELS[job.currentStep] ?? job.currentStep}`,
    failed: `❌ Falhou: ${job.error}`,
    blocked_by_qa: `🚫 Exportação bloqueada pela checagem de qualidade: ${job.error}`,
    done: "✅ Vídeo pronto!",
  };

  return (
    <main>
      <h1>{job.input.title}</h1>
      <p style={{ fontSize: 18 }}>{statusMsg[job.status]}</p>
      <ol>
        {Object.entries(STEP_LABELS).map(([step, label]) => (
          <li key={step} style={{ margin: 4 }}>
            {job.completedSteps.includes(step) ? "✅" : job.currentStep === step ? "⚙️" : "⬜"} {label}
          </li>
        ))}
      </ol>
      {job.status === "done" && job.artifacts?.metadata && (
        <section>
          <h2>Metadados para o YouTube</h2>
          <p><b>Título:</b> {job.artifacts.metadata.title}</p>
          <p><b>Descrição:</b><br />{job.artifacts.metadata.description}</p>
          <p><b>Tags:</b> {job.artifacts.metadata.tags.join(", ")}</p>
          <p><b>Comentário fixado:</b> {job.artifacts.metadata.pinnedComment}</p>
          <p><b>Arquivo:</b> <code>{job.artifacts.export?.outputPath}</code></p>
        </section>
      )}
      <details style={{ marginTop: 20 }}>
        <summary>Logs detalhados ({job.logs.length})</summary>
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
          {job.logs.map((l: any) => `${l.ts} [${l.level}] [${l.step}] ${l.msg}`).join("\n")}
        </pre>
      </details>
    </main>
  );
}
