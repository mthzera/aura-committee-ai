import { NextRequest } from "next/server";
import { spawn } from "child_process";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn("python", ["training/predict_single.py"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdoutData = "";
      let stderrData = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutData += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString("utf8");
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdoutData);
        } else {
          reject(new Error(stderrData || "Process exited with error"));
        }
      });
      child.on("error", reject);

      child.stdin?.write(JSON.stringify(body), "utf8");
      child.stdin?.end();
    });

    return Response.json(JSON.parse(result), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao rodar inferência";
    return Response.json({ error: message }, { status: 500 });
  }
}
