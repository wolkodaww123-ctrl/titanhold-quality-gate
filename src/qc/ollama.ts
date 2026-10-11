import { parseVerdict } from "./prompt.js";
import type { VisionBackend, FrameVerdict } from "./types.js";

export interface OllamaOptions {
  /** Default http://127.0.0.1:11434 or $OLLAMA_URL */
  url?: string;
  /** Any Ollama vision model. Default $QG_MODEL or "qwen2.5vl:7b". */
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Local vision backend: nothing leaves the machine. */
export function ollamaBackend(opts: OllamaOptions = {}): VisionBackend {
  const url = (opts.url ?? process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = opts.model ?? process.env.QG_MODEL ?? "qwen2.5vl:7b";
  const f = opts.fetchImpl ?? fetch;
  return {
    name: `ollama:${model}`,
    async inspect(png, { prompt, frame }): Promise<FrameVerdict> {
      let res: Response;
      try {
        res = await f(`${url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          options: { temperature: 0 },
          messages: [{ role: "user", content: prompt, images: [Buffer.from(png).toString("base64")] }],
        }),
        });
      } catch (e: any) {
        throw new Error(`Cannot reach Ollama at ${url} (${e?.cause?.code ?? e?.message}). Start it with \`ollama serve\` and \`ollama pull ${model}\`.`);
      }
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
      const body: any = await res.json();
      return parseVerdict(body?.message?.content ?? "", frame);
    },
  };
}
