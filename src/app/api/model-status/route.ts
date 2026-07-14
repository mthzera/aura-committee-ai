import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MODEL_DIRS = [
  {
    id: "readmission",
    label: "Risco de alta ruim (hospitalizacao/obito)",
    folder: "baseline_readmission",
  },
  {
    id: "effective_intervention",
    label: "Intervencao efetiva",
    folder: "baseline_effective_intervention",
  },
];

export async function GET() {
  const models = await Promise.all(
    MODEL_DIRS.map(async (model) => {
      try {
        const raw = await readFile(
          path.join(process.cwd(), "models", model.folder, "metrics.json"),
          "utf-8"
        );
        const metrics = JSON.parse(raw) as {
          target: string;
          rows: number;
          accuracy: number;
          roc_auc: number;
          class_counts: Record<string, number>;
        };
        return {
          ...model,
          available: true,
          metrics,
        };
      } catch {
        return {
          ...model,
          available: false,
          metrics: null,
        };
      }
    })
  );

  return Response.json({ models });
}
