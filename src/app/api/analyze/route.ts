import { NextRequest } from "next/server";
import { analyzeWorkbook } from "@/lib/committee-analysis";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Envie a planilha em multipart/form-data." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Nenhum arquivo enviado no campo file." },
      { status: 400 }
    );
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return Response.json(
      { error: "A aplicação aceita apenas arquivos .xlsx ou .xls." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const analysis = analyzeWorkbook(buffer);
    return Response.json({
      ...analysis,
      sourceFileName: file.name,
      sizeBytes: buffer.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao analisar a planilha.";
    return Response.json({ error: message }, { status: 422 });
  }
}
