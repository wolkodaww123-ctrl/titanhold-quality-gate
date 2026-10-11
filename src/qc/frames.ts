import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

export async function videoDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`cannot read duration of ${file}`);
  return d;
}

/** Sample `count` evenly spaced frames (as PNG, max 1024px wide) with ffmpeg. */
export async function extractFrames(file: string, count = 6): Promise<Uint8Array[]> {
  const dur = await videoDuration(file);
  const dir = await mkdtemp(join(tmpdir(), "qg-"));
  try {
    for (let i = 0; i < count; i++) {
      const t = (dur * (i + 0.5)) / count;
      await run("ffmpeg", ["-v", "error", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1",
        "-vf", "scale='min(1024,iw)':-2", join(dir, `f${String(i).padStart(3, "0")}.png`)]);
    }
    const names = (await readdir(dir)).sort();
    return Promise.all(names.map((n) => readFile(join(dir, n))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
