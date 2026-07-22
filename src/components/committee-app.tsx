"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  Brain,
  Download,
  FileSpreadsheet,
  FileDown,
  Play,
  ShieldAlert,
  Sparkles,
  Upload,
  Users,
  Clock3,
  FileText,
} from "lucide-react";
import type {
  FeatureSignal,
  LabelSignal,
  RetrospectiveAvoidability,
  TrainingDatasetRow,
  TriageAnalysis,
  TriageCase,
} from "@/lib/committee-analysis";
import {
  avoidabilityLabel,
  describeNews2Band,
  effectivenessReasonLabel,
  formatDateBr,
} from "@/lib/retrospective-avoidability";

type PredictionResult = {
  prob_readmission: number | null;
  prob_effective: number | null;
  event_already_occurred?: boolean;
  avoidability?: RetrospectiveAvoidability["avoidability"];
  best_action?: string;
  retrospective?: RetrospectiveAvoidability;
  explanation: string;
};

type ApiResponse = TriageAnalysis & {
  sourceFileName: string;
  sizeBytes: number;
};

type ModelStatus = {
  models: Array<{
    id: string;
    label: string;
    available: boolean;
    metrics: {
      target: string;
      rows: number;
      accuracy: number;
      roc_auc: number;
      class_counts: Record<string, number>;
    } | null;
  }>;
};

const formatter = new Intl.NumberFormat("pt-BR");

export function CommitteeApp() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ApiResponse | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadModelStatus() {
      try {
        const response = await fetch("/api/model-status");
        if (response.ok && !ignore) {
          setModelStatus((await response.json()) as ModelStatus);
        }
      } catch {
        // Non-blocking: the upload/analyze flow still works without model files.
      }
    }

    loadModelStatus();

    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Selecione a planilha do paciente antes de analisar.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = new FormData();
      data.append("file", file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: data,
      });

      const json = (await response.json()) as ApiResponse | { error: string };
      if (!response.ok) {
        setError("error" in json ? json.error : "Falha ao analisar a planilha.");
        setAnalysis(null);
      } else {
        setAnalysis(json as ApiResponse);
      }
    } catch {
      setError("Falha de rede ao enviar a planilha.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  function handleAnalyzePatient(patientId: string) {
    if (!analysis) return;
    const trainingRow = analysis.trainingRows.find(r => r.patient_id === patientId);
    const triageCase = analysis.cases.find((item) => item.id === patientId);
    if (!trainingRow) return;

    setSelectedPatientId(patientId);
    setPrediction(null);
    setLoadingPrediction(true);

    // Casos com evento final já trazem a análise de evitabilidade do /analyze.
    if (triageCase?.retrospective) {
      setPrediction({
        prob_readmission: null,
        prob_effective: null,
        event_already_occurred: true,
        avoidability: triageCase.retrospective.avoidability,
        best_action: triageCase.retrospective.bestAction,
        retrospective: triageCase.retrospective,
        explanation: triageCase.retrospective.explanation,
      });
      setLoadingPrediction(false);
      return;
    }

    fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trainingRow),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPrediction(data);
      })
      .catch(err => {
        console.error(err);
        setPrediction({
          prob_readmission: null,
          prob_effective: null,
          event_already_occurred: false,
          explanation: "Erro ao gerar explicação. Verifique se os modelos foram treinados."
        });
      })
      .finally(() => {
        setLoadingPrediction(false);
      });
  }

  function handleDownload() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aura-training-base-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTrainingCsv() {
    if (!analysis) return;
    const blob = new Blob([toCsv(analysis.trainingRows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aura-training-dataset-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
              <Brain className="h-3.5 w-3.5" />
              AURA committee AI
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Triagem clínica para apoiar a decisão do comitê
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Carregue a planilha do Patient Watcher e receba uma priorização dos
              pacientes, sinais de basal versus piora recente e uma base inicial
              para treino do modelo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 sm:grid-cols-4">
            <StatMini icon={<Activity className="h-4 w-4" />} label="casos" value={analysis ? formatter.format(analysis.summary.totalCases) : "0"} />
            <StatMini icon={<Users className="h-4 w-4" />} label="alertas" value={analysis ? formatter.format(analysis.summary.alertCases) : "0"} />
            <StatMini icon={<ShieldAlert className="h-4 w-4" />} label="prioridade alta" value={analysis ? formatter.format(analysis.summary.highPriorityCases) : "0"} />
            <StatMini icon={<Clock3 className="h-4 w-4" />} label="comitês ativos" value={analysis ? formatter.format(analysis.summary.activeDiscussions) : "0"} />
          </div>
        </header>

        <main className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_18px_80px_rgba(2,6,23,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-50">Entrada da planilha</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  O MVP lê a aba <span className="text-slate-200">Pct Watcher</span> e transforma os campos já existentes em sinais clínicos e rótulos de treino.
                </p>
              </div>
              <FileSpreadsheet className="mt-0.5 h-5 w-5 text-cyan-300" />
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <label className="block rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-4 transition hover:border-cyan-500/60 hover:bg-slate-950">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                    setError(null);
                  }}
                />
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2 text-cyan-200">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-100">
                      {file ? file.name : "Selecionar planilha .xlsx"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Carregue o arquivo do Patient Watcher para gerar priorização, rótulos e base de treino.
                    </p>
                  </div>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !file}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  <Play className="h-4 w-4" />
                  {loading ? "Analisando..." : "Analisar planilha"}
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-200 transition hover:border-slate-600 hover:bg-slate-900"
                  title="Escolher arquivo"
                >
                  <Upload className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="mt-5 space-y-3 border-t border-slate-800 pt-4">
              <InfoRow title="Base principal" value="Aba Pct Watcher" />
              <InfoRow title="Features iniciais" value="NEWS2 atual, basal 7d, delta, sinais vitais e completude" />
              <InfoRow title="Rótulos base" value="evitada, reversão, sem retorno, inevitável, em monitoramento" />
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-900/70 bg-rose-950/40 p-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            {analysis && (
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTrainingCsv}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                >
                  <FileDown className="h-4 w-4" />
                  Baixar dataset de treino CSV
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-cyan-500/50 hover:text-cyan-200"
                >
                  <Download className="h-4 w-4" />
                  Baixar análise completa JSON
                </button>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Casos analisados"
                value={analysis ? formatter.format(analysis.summary.totalCases) : "0"}
                hint="linhas úteis na aba principal"
              />
              <MetricCard
                label="Pacientes de alta prioridade"
                value={analysis ? formatter.format(analysis.summary.highPriorityCases) : "0"}
                hint="score alto ou crítico"
              />
              <MetricCard
                label="Eventos finais"
                value={analysis ? formatter.format(analysis.summary.finalEvents) : "0"}
                hint="reinternação, óbito ou encerramento"
              />
              <MetricCard
                label="Discussões ativas"
                value={analysis ? formatter.format(analysis.summary.activeDiscussions) : "0"}
                hint="campo de comitê preenchido"
              />
            </div>

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-50">Leitura clínica rápida</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Como a planilha está se comportando em cima do basal e do NEWS2.
                  </p>
                </div>
                <Sparkles className="h-5 w-5 text-amber-300" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <MiniPanel
                  title="Média NEWS2 atual"
                  value={analysis ? fmtNum(analysis.summary.averageNews2) : "0"}
                  caption="média dos valores atuais"
                />
                <MiniPanel
                  title="Média NEWS2 7 dias"
                  value={analysis ? fmtNum(analysis.summary.averageNews2Average7d) : "0"}
                  caption="proxy do basal"
                />
                <MiniPanel
                  title="Delta 7 dias"
                  value={analysis ? fmtNum(analysis.summary.averageDelta7d) : "0"}
                  caption="tendência recente"
                />
              </div>

              {analysis?.notes?.length ? (
                <div className="mt-4 space-y-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-100">
                  {analysis.notes.map((note) => (
                    <p key={note}>• {note}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm leading-6 text-slate-400">
                  Após o upload, este painel mostra a leitura do basal, o peso dos sinais vitais e o que parece útil para treinar o primeiro modelo.
                </p>
              )}
            </section>

            {analysis && (
              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-50">
                      Prontidão do modelo base
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Leitura automática da base antes de treinar o primeiro classificador.
                    </p>
                  </div>
                  <ReadinessPill status={analysis.modelReadiness.status} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MiniPanel
                    title="linhas treináveis"
                    value={formatter.format(analysis.modelReadiness.trainableRows)}
                    caption="com NEWS2 atual e basal 7d"
                  />
                  <MiniPanel
                    title="features úteis"
                    value={formatter.format(analysis.modelReadiness.usableFeatureCount)}
                    caption="cobertura acima de 65%"
                  />
                  <MiniPanel
                    title="rótulos ativos"
                    value={formatter.format(analysis.modelReadiness.labelDiversity)}
                    caption="classes com exemplos"
                  />
                </div>

                <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm leading-6 text-slate-300">
                  {analysis.modelReadiness.message}
                </p>
              </section>
            )}

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-50">
                    Baselines treinados
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Modelos tabulares salvos localmente a partir do dataset supervisionado.
                  </p>
                </div>
                <Brain className="h-5 w-5 text-cyan-300" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(modelStatus?.models ?? []).map((model) => (
                  <ModelCard key={model.id} model={model} />
                ))}
                {!modelStatus && (
                  <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-500">
                    Carregando métricas dos modelos...
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-50">Casos priorizados</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Lista ordenada por score para a comissão discutir primeiro os casos mais quentes.
                  </p>
                </div>
                <FileText className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.18em] text-slate-400">
                      <tr>
                        <Th>Paciente</Th>
                        <Th>Unidade</Th>
                        <Th>Score</Th>
                        <Th>Leitura</Th>
                        <Th>Recomendação</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                      {(analysis?.cases ?? []).slice(0, 12).map((item) => (
                        <CaseRow 
                          key={item.id} 
                          item={item} 
                          onAnalyze={() => handleAnalyzePatient(item.id)}
                          isLoading={selectedPatientId === item.id && loadingPrediction}
                          prediction={selectedPatientId === item.id ? prediction : null}
                        />
                      ))}
                      {!analysis && (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                            Nenhuma planilha analisada ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <SignalsPanel
                title="Features para treino"
                subtitle="O que já serve como entrada do modelo base"
                items={analysis?.featureSignals ?? []}
              />
              <SignalsPanel
                title="Rótulos derivados"
                subtitle="Como a base pode ser transformada em aprendizado supervisionado"
                items={analysis?.labelSignals ?? []}
              />
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}

function ModelCard({ model }: { model: ModelStatus["models"][number] }) {
  if (!model.available || !model.metrics) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <p className="text-sm font-medium text-slate-100">{model.label}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Modelo ainda não treinado. Rode o script de treino para gerar métricas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-100">{model.label}</p>
          <p className="mt-1 text-xs text-slate-500">{model.metrics.target}</p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
          treinado
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <MiniMetric label="AUC" value={model.metrics.roc_auc.toFixed(3)} />
        <MiniMetric label="Acurácia" value={`${Math.round(model.metrics.accuracy * 100)}%`} />
        <MiniMetric label="Linhas" value={formatter.format(model.metrics.rows)} />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Classes: {Object.entries(model.metrics.class_counts).map(([key, value]) => `${key}=${value}`).join(", ")}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function ReadinessPill({ status }: { status: "insuficiente" | "baseline_pronto" | "precisa_rotulagem" }) {
  const styles =
    status === "baseline_pronto"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : status === "precisa_rotulagem"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  const label =
    status === "baseline_pronto"
      ? "baseline pronto"
      : status === "precisa_rotulagem"
      ? "revisar rótulos"
      : "insuficiente";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] ${styles}`}>
      {label}
    </span>
  );
}

function StatMini({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
      <div className="flex items-center gap-2 text-slate-300">
        {icon}
        <span className="text-[11px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-50">{value}</div>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{hint}</p>
    </div>
  );
}

function MiniPanel({ title, value, caption }: { title: string; value: string; caption: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{caption}</p>
    </div>
  );
}

function SignalsPanel({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: FeatureSignal[] | LabelSignal[];
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h2 className="text-base font-semibold text-slate-50">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>

      <div className="mt-4 space-y-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{item.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.note}</p>
                </div>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
                  {"coverage" in item ? `${item.coverage}%` : formatter.format(item.count)}
                </span>
              </div>
              {"coverage" in item ? (
                <div className="mt-3 h-2 rounded-full bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${item.role === "core" ? "bg-cyan-400" : item.role === "support" ? "bg-emerald-400" : "bg-amber-400"}`}
                    style={{ width: `${Math.max(2, item.coverage)}%` }}
                  />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-500">
            Envie uma planilha para visualizar os sinais de treino.
          </p>
        )}
      </div>
    </section>
  );
}

function CaseRow({ 
  item, 
  onAnalyze, 
  isLoading, 
  prediction 
}: { 
  item: TriageCase;
  onAnalyze?: () => void;
  isLoading?: boolean;
  prediction?: PredictionResult | null;
}) {
  const alreadyOccurred = prediction?.event_already_occurred === true;
  const retrospective = prediction?.retrospective ?? item.retrospective;
  const avoidability = prediction?.avoidability ?? retrospective?.avoidability;
  const bestAction = prediction?.best_action ?? retrospective?.bestAction;

  return (
    <>
      <tr className="align-top">
        <td className="px-4 py-3">
          <div className="font-medium text-slate-100">{item.patientName}</div>
          <div className="mt-1 text-xs text-slate-500">{item.careLine ?? "Sem linha de cuidado"}</div>
          {item.retrospective && (
            <div className="mt-2 inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
              {avoidabilityLabel(item.retrospective.avoidability)}
            </div>
          )}
          {onAnalyze && (
            <button
              onClick={onAnalyze}
              disabled={isLoading}
              className="mt-3 flex items-center gap-1.5 rounded bg-indigo-500/20 px-2 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/30 disabled:opacity-50"
            >
              <Brain className="h-3.5 w-3.5" />
              {isLoading
                ? "Consultando IA..."
                : item.retrospective
                  ? "Ver evitabilidade"
                  : "Explicar com IA"}
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-slate-300">
          <div>{item.unit}</div>
          <div className="mt-1 text-xs text-slate-500">{item.bed ?? "Leito não informado"}</div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <BandPill band={item.band} />
            <span className="text-slate-100">{item.score.toFixed(1)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            NEWS2 {fmtMaybe(item.news2Last)} · basal 7d {fmtMaybe(item.news2Average7d)}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="text-sm text-slate-200">{item.recommendation}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.reasons.map((reason) => (
              <span key={reason} className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-300">
                {reason}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="space-y-1 text-xs text-slate-400">
            <div>Rótulo: <span className="text-slate-200">{labelName(item.trainingLabel)}</span></div>
            <div>Status: <span className="text-slate-200">{item.monitoringStatus ?? "n/a"}</span></div>
            <div>Intervenção: <span className="text-slate-200">{item.interventionResult ?? item.interventionUnit ?? "n/a"}</span></div>
          </div>
        </td>
      </tr>
      {prediction && (
        <tr>
          <td
            colSpan={5}
            className={
              alreadyOccurred
                ? "border-t border-amber-500/20 bg-amber-950/10 px-4 py-4"
                : "border-t border-indigo-500/20 bg-indigo-950/10 px-4 py-4"
            }
          >
            <div className="flex items-start gap-3">
              <Sparkles
                className={
                  alreadyOccurred
                    ? "mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                    : "mt-0.5 h-5 w-5 shrink-0 text-indigo-400"
                }
              />
              <div
                className={
                  alreadyOccurred
                    ? "w-full space-y-3 text-sm leading-relaxed text-amber-100"
                    : "space-y-2 text-sm leading-relaxed text-indigo-100"
                }
              >
                {alreadyOccurred && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-200">
                      Parecer clínico retrospectivo
                    </span>
                    {avoidability && (
                      <span className="inline-flex rounded border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-100">
                        {avoidabilityLabel(avoidability)}
                      </span>
                    )}
                  </div>
                )}

                {alreadyOccurred && retrospective?.clinicalImpression && (
                  <div className="rounded-lg border border-amber-500/30 bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-amber-300/80">
                      Impressão clínica
                    </div>
                    <div className="mt-1 text-sm text-amber-50">{retrospective.clinicalImpression}</div>
                  </div>
                )}

                {alreadyOccurred && retrospective?.news2Reading && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-sky-300/80">
                      Como ler o NEWS2 neste caso
                    </div>
                    {retrospective.news2Reading.peakScore !== null && (
                      <div className="mt-2 text-sm text-sky-50">
                        Pico <span className="font-semibold">{retrospective.news2Reading.peakScore}/20</span>
                        {" — "}
                        {describeNews2Band(retrospective.news2Reading.peakScore)}
                      </div>
                    )}
                    {retrospective.news2Reading.peakMeaning && (
                      <p className="mt-2 text-sm text-sky-100/90">{retrospective.news2Reading.peakMeaning}</p>
                    )}
                    {retrospective.news2Reading.riseSummary && (
                      <p className="mt-2 text-sm text-sky-100/90">{retrospective.news2Reading.riseSummary}</p>
                    )}
                    <ul className="mt-3 space-y-1 border-t border-sky-500/20 pt-2 text-xs text-sky-100/70">
                      {retrospective.news2Reading.guide.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {alreadyOccurred && retrospective && (retrospective.actionPlan?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">
                      Conduta esperada
                    </div>
                    <ol className="mt-2 list-decimal space-y-2 pl-4 text-sm text-emerald-50">
                      {(retrospective.actionPlan ?? [bestAction].filter(Boolean)).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {alreadyOccurred && retrospective && retrospective.missedTriggers.length > 0 && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-rose-300/80">
                      Falhas na janela
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-rose-50/90">
                      {retrospective.missedTriggers.slice(0, 3).map((trigger) => (
                        <li key={trigger}>{trigger}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {alreadyOccurred && retrospective && retrospective.priorAlerts.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wide text-amber-300/80">
                      Linha do tempo dos alertas
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {retrospective.priorAlerts.slice(0, 4).map((alert) => (
                        <div
                          key={`${alert.date}-${alert.unit}-${alert.daysBeforeEvent}`}
                          className="rounded border border-amber-500/20 bg-slate-950/50 px-3 py-2 text-xs text-amber-100/90"
                        >
                          <div className="font-medium text-amber-50">
                            {formatDateBr(alert.date)} · −{alert.daysBeforeEvent}d
                          </div>
                          <div className="mt-1 text-amber-100/70">
                            NEWS2 {alert.news2Last ?? "n/a"}
                            {alert.news2Last !== null ? ` (${describeNews2Band(alert.news2Last)})` : ""}
                          </div>
                          <div className="mt-1 text-amber-100/70">
                            {alert.interventionUnit ?? "sem intervenção"} · {effectivenessReasonLabel(alert.effectivenessReason)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {alreadyOccurred && retrospective?.references && retrospective.references.length > 0 && (
                  <div className="rounded-lg border border-slate-600/40 bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      Referências de apoio à decisão
                    </div>
                    <ul className="mt-2 space-y-2 text-xs text-slate-300">
                      {retrospective.references.map((ref) => (
                        <li key={ref.label}>
                          <span className="font-medium text-slate-100">{ref.label}</span>
                          <span className="mt-0.5 block text-slate-400">{ref.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!alreadyOccurred && <ExplanationText text={prediction.explanation} />}
                {alreadyOccurred && !retrospective?.clinicalImpression && (
                  <ExplanationText text={prediction.explanation} />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ExplanationText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => {
        if (!line.trim()) {
          return <div key={index} className="h-2" />;
        }

        const isTitle = line.startsWith("**") && line.endsWith("**");
        if (isTitle) {
          return (
            <p key={index} className="font-semibold text-indigo-50">
              {line.slice(2, -2)}
            </p>
          );
        }

        const content = line.startsWith("• ") ? line.slice(2) : line;
        const parts = content.split(/(\*\*[^*]+\*\*)/g);

        return (
          <p key={index} className="flex gap-2">
            {line.startsWith("• ") && <span className="text-indigo-300">•</span>}
            <span>
              {parts.map((part, partIndex) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={partIndex} className="font-semibold text-indigo-50">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={partIndex}>{part}</span>
                )
              )}
            </span>
          </p>
        );
      })}
    </>
  );
}

function BandPill({ band }: { band: TriageCase["band"] }) {
  const styles =
    band === "critico"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : band === "alto"
      ? "border-orange-500/30 bg-orange-500/10 text-orange-200"
      : band === "medio"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-slate-700 bg-slate-900 text-slate-300";

  return <span className={`rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${styles}`}>{band}</span>;
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

function InfoRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</span>
      <span className="max-w-[200px] text-right text-sm text-slate-200">{value}</span>
    </div>
  );
}

function fmtNum(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0";
}

function fmtMaybe(value: number | null) {
  return value === null || Number.isNaN(value) ? "n/a" : value.toFixed(1);
}

function labelName(label: string) {
  const map: Record<string, string> = {
    reinternacao_evitada: "Reinternação evitada",
    reversao_piora: "Reversão de piora",
    sem_retorno: "Sem retorno",
    reinternacao_inevitavel: "Reinternação inevitável",
    monitoramento_ativo: "Monitoramento ativo",
  };
  return map[label] ?? label;
}

function toCsv(rows: TrainingDatasetRow[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]) as Array<keyof TrainingDatasetRow>;
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          const text = String(value).replace(/"/g, '""');
          return /[",\n\r]/.test(text) ? `"${text}"` : text;
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}
