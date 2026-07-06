# 🎬 Fábrica de Vídeos para YouTube

Sistema completo que transforma um título (ou roteiro colado) em um vídeo longo pronto para o YouTube: roteiro otimizado para retenção, narração, cenas sincronizadas com o áudio real, imagens únicas com animação de câmera, legendas, música de fundo, checagem de qualidade e metadados (título, descrição, tags, comentário fixado).

## Como usar (usuário leigo)

1. `npm install`
2. `npm run dev`
3. Abra http://localhost:3000
4. Preencha título, nicho, duração, estilo visual e voz → clique **Gerar vídeo**
5. Acompanhe o progresso das 9 etapas na tela; ao final, o arquivo `final.mp4` e os metadados aparecem.

## Configuração

Crie um `.env.local`:

```env
TOGETHER_API_KEY=...         # imagens via FLUX.1 na Together AI (e LLM, se não houver chave OpenAI)
OPENAI_API_KEY=sk-...        # LLM + narração TTS (a Together não tem TTS)
# PROVIDER_MODE=mock         # roda tudo com mocks (sem custo, para testar o fluxo)
# IMAGE_MODEL=black-forest-labs/FLUX.1-schnell   # ou FLUX.1-dev / FLUX.1.1-pro
# FLUX_STEPS=4               # 4 para schnell; 28+ para dev
# LLM_MODEL=gpt-4o           # ou um modelo da Together
# TTS_MODEL=tts-1-hd
# BGM_PATH=/caminho/musica.mp3   # música de fundo (opcional, com ducking automático)
```

### Consistência de personagem (FLUX.1)

O pipeline gera uma **ficha de personagem** (descrição fixa em inglês) uma única vez por vídeo e a repete palavra por palavra no início de todos os prompts — é isso que mantém o mesmo rosto/roupa em todas as imagens sem LoRA. Além disso: rotação obrigatória de enquadramento (wide / medium / close nas mãos / over-the-shoulder / perfil / low angle, nunca dois iguais seguidos), personagem sempre executando a ação da frase com as mãos visíveis, e proibição de texto legível nas imagens. O QA compara os prompts ignorando o prefixo compartilhado, então a ficha fixa nunca mascara uma duplicata real.

**FFmpeg** precisa estar instalado na máquina para a renderização final (`apt install ffmpeg` / `brew install ffmpeg`). Sem FFmpeg, o pipeline roda até o fim e salva o comando pronto em `assets/ffmpeg-command.json` para renderizar depois.

## Arquitetura do pipeline

```
INPUT → SCRIPT → TTS → TIMING → PROMPTS → IMAGES → SUBTITLES → QA GATE → ASSEMBLE → METADATA
```

Cada etapa: valida entrada/saída com schemas Zod rígidos (`src/lib/schemas.ts`), usa retry com backoff exponencial em toda chamada de API, persiste o estado do job em disco (`data/jobs/<id>/job.json`) e registra logs estruturados visíveis na UI.

### Garantias de qualidade (QA gate — bloqueia exportações ruins)

- Timeline do vídeo cobre exatamente a **duração real medida do áudio** (nunca estimada).
- Cada cena e cada shot têm timestamps contíguos (sem buracos nem sobreposição).
- Cada imagem é vinculada a uma frase específica do roteiro.
- Média de ~1 imagem a cada 4s; máximo absoluto de 5s por imagem.
- Prompts genéricos são rejeitados; similaridade > 90% entre prompts bloqueia o export.
- Animação de câmera (Ken Burns) diferente entre shots consecutivos.
- Legendas SRT dentro da duração do áudio.

### Módulos

| Módulo | Responsabilidade |
|---|---|
| `src/lib/schemas.ts` | Contratos JSON rígidos (Zod) de todo o pipeline |
| `src/lib/pipeline/script.ts` | Geração/normalização do roteiro com proteção anti-roteiro-curto |
| `src/lib/pipeline/timing.ts` | Cenas sincronizadas à duração real do áudio; janelas de shots |
| `src/lib/pipeline/prompts.ts` | Prompts únicos por frase + anti-repetição (Jaccard) + variação visual |
| `src/lib/pipeline/subtitles.ts` | Legendas SRT |
| `src/lib/pipeline/qa.ts` | QA gate bloqueante |
| `src/lib/pipeline/assemble.ts` | Builder do comando FFmpeg (zoompan, concat, subtitles, ducking) |
| `src/lib/pipeline/metadata.ts` | Título, descrição, tags, comentário fixado |
| `src/lib/pipeline/run.ts` | Orquestrador com estado persistente e logs |
| `src/lib/providers/` | Adaptadores de LLM/TTS/imagem (OpenAI ou mock) — trocar de vendor não toca o pipeline |
| `src/lib/jobs.ts` | Job store em disco com escrita atômica |

## Testes

```bash
npm test        # 19 testes: timing, prompts, QA, FFmpeg builder e pipeline e2e com mocks
npm run typecheck
```
