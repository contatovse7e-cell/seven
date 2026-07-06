"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const pasted = String(f.get("pastedScript") || "").trim();
    const body = {
      title: f.get("title"),
      niche: f.get("niche"),
      targetMinutes: Number(f.get("targetMinutes")),
      visualStyle: f.get("visualStyle"),
      voiceId: f.get("voiceId"),
      language: f.get("language"),
      ...(pasted ? { pastedScript: pasted } : {}),
    };
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error === "invalid input" ? "Verifique os campos: " + JSON.stringify(json.details.fieldErrors) : "Erro ao criar o vídeo.");
      setBusy(false);
      return;
    }
    router.push(`/jobs/${json.id}`);
  }

  const label = { display: "block", marginTop: 14, fontWeight: 600 } as const;
  const input = { width: "100%", padding: 8, marginTop: 4, boxSizing: "border-box" } as const;

  return (
    <main>
      <h1>🎬 Fábrica de Vídeos</h1>
      <p>Preencha os campos e o sistema gera o vídeo completo: roteiro, narração, imagens, legendas e exportação.</p>
      <form onSubmit={submit}>
        <label style={label}>Título do vídeo<input style={input} name="title" required minLength={3} placeholder="Ex: A história secreta do Império Romano" /></label>
        <label style={label}>Nicho<input style={input} name="niche" required placeholder="Ex: história, finanças, curiosidades" /></label>
        <label style={label}>Duração desejada (minutos)<input style={input} name="targetMinutes" type="number" min={1} max={120} defaultValue={10} required /></label>
        <label style={label}>Estilo visual<input style={input} name="visualStyle" required placeholder="Ex: pintura digital épica, tons quentes, realista" /></label>
        <label style={label}>Voz<input style={input} name="voiceId" required defaultValue="onyx" placeholder="Ex: onyx, nova, alloy" /></label>
        <label style={label}>Idioma<input style={input} name="language" defaultValue="pt-BR" /></label>
        <label style={label}>Roteiro pronto (opcional — deixe vazio para gerar automaticamente)
          <textarea style={{ ...input, height: 120 }} name="pastedScript" placeholder="Cole seu roteiro aqui se já tiver um" />
        </label>
        <button disabled={busy} style={{ marginTop: 18, padding: "10px 24px", fontSize: 16, cursor: "pointer" }}>
          {busy ? "Criando..." : "Gerar vídeo"}
        </button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </main>
  );
}
