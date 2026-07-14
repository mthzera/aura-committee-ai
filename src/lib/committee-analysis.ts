import * as XLSX from "xlsx";

export type TriageBand = "baixo" | "medio" | "alto" | "critico";

export interface TriageCase {
  id: string;
  patientName: string;
  unit: string;
  bed: string | null;
  careLine: string | null;
  age: number | null;
  riskLabel: string | null;
  news2Last: number | null;
  news2Average7d: number | null;
  news2Delta7d: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  oxygenSupport: string | null;
  systolicBp: number | null;
  heartRate: number | null;
  consciousness: string | null;
  temperature: number | null;
  completeness: number | null;
  auraAlerted: string | null;
  recurrenceFlag: string | null;
  interventionUnit: string | null;
  interventionResult: string | null;
  clinicalAlteration: string | null;
  clinicalOutcome: string | null;
  monitoringStatus: string | null;
  committeeDiscussion: string | null;
  readmissionAvoided: string | null;
  dischargeDate: string | null;
  score: number;
  band: TriageBand;
  recommendation: string;
  trainingLabel: string;
  reasons: string[];
}

export interface TrainingDatasetRow {
  patient_id: string;
  discharge_date: string;
  patient_name: string;
  unit: string;
  care_line: string;
  age: number | null;
  news2_last: number | null;
  news2_average_7d: number | null;
  news2_delta_7d: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  oxygen_support_flag: number;
  systolic_bp: number | null;
  heart_rate: number | null;
  consciousness_flag: number;
  temperature: number | null;
  completeness: number | null;
  aura_alerted_flag: number;
  acute_decompensation_flag: number;
  triage_score: number;
  triage_band: TriageBand;
  target_label: string;
  target_readmission_event: number;
  target_effective_intervention: number;
}

export interface ModelReadiness {
  trainableRows: number;
  usableFeatureCount: number;
  labelDiversity: number;
  status: "insuficiente" | "baseline_pronto" | "precisa_rotulagem";
  message: string;
}

export interface FeatureSignal {
  key: string;
  label: string;
  coverage: number;
  role: "core" | "support" | "label";
  note: string;
}

export interface LabelSignal {
  key: string;
  label: string;
  count: number;
  note: string;
}

export interface TriageSummary {
  totalCases: number;
  alertCases: number;
  highPriorityCases: number;
  activeDiscussions: number;
  finalEvents: number;
  averageNews2: number;
  averageNews2Average7d: number;
  averageDelta7d: number;
}

export interface TriageAnalysis {
  sheetName: string;
  summary: TriageSummary;
  cases: TriageCase[];
  trainingRows: TrainingDatasetRow[];
  modelReadiness: ModelReadiness;
  featureSignals: FeatureSignal[];
  labelSignals: LabelSignal[];
  notes: string[];
  generatedAt: string;
}

type Row = Record<string, unknown>;

const SHEET_CANDIDATES = ["Pct Watcher", "Registros"];

const FIELD_ALIASES: Record<string, string[]> = {
  patientName: ["paciente", "nome", "nome_do_paciente", "nome_paciente"],
  unit: ["unidade", "unidade_assistencial", "setor"],
  bed: ["leito"],
  careLine: ["linha_de_cuidado"],
  age: ["idade"],
  riskLabel: ["risco_ultimo", "risco"],
  news2Last: ["news2_ultimo", "news2", "score_news2"],
  news2Average7d: ["news2_media_7_dias", "news2_m7d", "news2_media7dias"],
  news2Delta7d: ["delta_score_m7d", "delta_score_atual_e_medio", "delta_m7d"],
  respiratoryRate: ["fr_irpm"],
  oxygenSaturation: ["so_spo2"],
  oxygenSupport: ["sup_o2"],
  systolicBp: ["pas_mmhg"],
  heartRate: ["fc_bpm"],
  consciousness: ["nc"],
  temperature: ["temp_c"],
  completeness: ["completude_de_ssvv", "ssvv_completeness"],
  auraAlerted: ["alertado_aura"],
  recurrenceFlag: ["reincidencia", "retorno"],
  interventionUnit: ["intervencao_unidade", "intervencao_da_unidade"],
  interventionResult: ["resultado_da_intervencao"],
  clinicalAlteration: ["alteracao_clinica"],
  clinicalOutcome: ["desfecho_clinico"],
  monitoringStatus: ["status"],
  committeeDiscussion: ["discussao_comite_aura"],
  readmissionAvoided: ["reinternacao_evitada"],
  dischargeDate: ["data_alta"],
};

const FEATURE_DEFS = [
  { key: "news2Last", label: "NEWS2 atual", role: "core" as const, note: "Sinal principal para priorização imediata." },
  { key: "news2Average7d", label: "Média 7 dias", role: "core" as const, note: "Ajuda a medir o basal do paciente." },
  { key: "news2Delta7d", label: "Delta 7 dias", role: "core" as const, note: "Mostra piora ou reversão recente." },
  { key: "riskLabel", label: "Risco atual", role: "support" as const, note: "Classe clínica já atribuída na planilha." },
  { key: "respiratoryRate", label: "FR", role: "support" as const, note: "Sinal vital com forte peso clínico." },
  { key: "oxygenSaturation", label: "SpO2", role: "support" as const, note: "Desaturação costuma acelerar a decisão." },
  { key: "oxygenSupport", label: "Suporte O2", role: "support" as const, note: "Indica escalada de cuidado." },
  { key: "systolicBp", label: "PA sistólica", role: "support" as const, note: "Ajuda a detectar instabilidade." },
  { key: "heartRate", label: "FC", role: "support" as const, note: "Sinal de resposta fisiológica aguda." },
  { key: "consciousness", label: "Consciência", role: "support" as const, note: "Mudança neurológica tem impacto alto." },
  { key: "temperature", label: "Temperatura", role: "support" as const, note: "Febre ou hipotermia entram na leitura." },
  { key: "completeness", label: "Completude SSVV", role: "support" as const, note: "Dados incompletos reduzem confiança." },
  { key: "auraAlerted", label: "Alertado AURA", role: "label" as const, note: "Marca o alvo da comissão." },
  { key: "interventionUnit", label: "Intervenção unidade", role: "label" as const, note: "Mostra se houve resposta local." },
  { key: "interventionResult", label: "Resultado intervenção", role: "label" as const, note: "Útil para reversão e desfecho." },
  { key: "clinicalOutcome", label: "Desfecho clínico", role: "label" as const, note: "Ajuda a construir o alvo do modelo." },
  { key: "committeeDiscussion", label: "Discussão comitê", role: "label" as const, note: "Campo candidato a rótulo assistido." },
  { key: "readmissionAvoided", label: "Reinternação evitada", role: "label" as const, note: "Sinal de sucesso do fluxo." },
] as const;

const LABEL_DEFS = [
  { key: "reinternacao_evitada", label: "Reinternação evitada", note: "Melhor caso de resposta efetiva." },
  { key: "reversao_piora", label: "Reversão de piora", note: "Houve melhora após atuação." },
  { key: "sem_retorno", label: "Sem retorno", note: "Sem evidência de resposta após alerta." },
  { key: "reinternacao_inevitavel", label: "Reinternação/óbito", note: "Evento final explícito, sem assumir que toda alta é ruim." },
  { key: "monitoramento_ativo", label: "Monitoramento ativo", note: "Caso em acompanhamento, ainda aberto." },
] as const;

const FINAL_EVENT_TERMS = ["reintern", "hospitaliza", "internacao hospitalar", "internação hospitalar", "obito", "óbito"];
const ACUTE_TERMS = ["descompensacao aguda", "descompensação aguda"];

export function analyzeWorkbook(buffer: Buffer): TriageAnalysis {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: true,
    cellDates: true,
  });

  const sheetName = SHEET_CANDIDATES.find((name) => workbook.SheetNames.includes(name)) ?? workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("A planilha está vazia.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
  const rows = rawRows.map(normalizeRow);

  if (rows.length === 0) {
    throw new Error("Não encontrei linhas úteis na planilha.");
  }

  const cases = rows.map((row, index) => buildCase(row, index));
  const summary = buildSummary(cases);
  const trainingRows = buildTrainingRows(cases);
  const featureSignals = buildFeatureSignals(rows);
  const labelSignals = buildLabelSignals(cases);
  const modelReadiness = buildModelReadiness(trainingRows, featureSignals, labelSignals);
  const notes = buildNotes(rows, cases);

  return {
    sheetName,
    summary,
    cases: cases.sort((a, b) => b.score - a.score || a.patientName.localeCompare(b.patientName, "pt-BR")),
    trainingRows,
    modelReadiness,
    featureSignals,
    labelSignals,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[normalizeKey(key)] = value;
  }
  return out;
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-\/()]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(row: Row, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = row[alias];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function text(row: Row, aliases: string[]): string | null {
  const value = pick(row, aliases);
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function numberValue(row: Row, aliases: string[]): number | null {
  const value = pick(row, aliases);
  return parseNumber(value);
}

function validDateText(row: Row, aliases: string[]): string | null {
  const value = pick(row, aliases);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(value));
    return excelEpoch.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const str = String(value).trim();
  if (!str) return null;
  const match = str.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isYes(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return [
    "sim",
    "s",
    "yes",
    "y",
    "true",
    "1",
    "alerta",
    "alto",
    "critico",
    "crítico",
  ].includes(normalized);
}

function includesAny(value: string | null, terms: string[]): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function isAcuteDecompensation(value: string | null): boolean {
  return includesAny(value, ACUTE_TERMS);
}

function buildCase(row: Row, index: number): TriageCase {
  const patientName = text(row, FIELD_ALIASES.patientName) ?? `Paciente ${index + 1}`;
  const unit = text(row, FIELD_ALIASES.unit) ?? "Sem unidade";
  const bed = text(row, FIELD_ALIASES.bed);
  const careLine = text(row, FIELD_ALIASES.careLine);
  const age = numberValue(row, FIELD_ALIASES.age);
  const riskLabel = text(row, FIELD_ALIASES.riskLabel);
  const news2Last = numberValue(row, FIELD_ALIASES.news2Last);
  const news2Average7d = numberValue(row, FIELD_ALIASES.news2Average7d);
  const news2Delta7d = numberValue(row, FIELD_ALIASES.news2Delta7d);
  const respiratoryRate = numberValue(row, FIELD_ALIASES.respiratoryRate);
  const oxygenSaturation = numberValue(row, FIELD_ALIASES.oxygenSaturation);
  const oxygenSupport = text(row, FIELD_ALIASES.oxygenSupport);
  const systolicBp = numberValue(row, FIELD_ALIASES.systolicBp);
  const heartRate = numberValue(row, FIELD_ALIASES.heartRate);
  const consciousness = text(row, FIELD_ALIASES.consciousness);
  const temperature = numberValue(row, FIELD_ALIASES.temperature);
  const completeness = numberValue(row, FIELD_ALIASES.completeness);
  const auraAlerted = text(row, FIELD_ALIASES.auraAlerted);
  const recurrenceFlag = text(row, FIELD_ALIASES.recurrenceFlag);
  const interventionUnit = text(row, FIELD_ALIASES.interventionUnit);
  const interventionResult = text(row, FIELD_ALIASES.interventionResult);
  const clinicalAlteration = text(row, FIELD_ALIASES.clinicalAlteration);
  const clinicalOutcome = text(row, FIELD_ALIASES.clinicalOutcome);
  const monitoringStatus = text(row, FIELD_ALIASES.monitoringStatus);
  const committeeDiscussion = text(row, FIELD_ALIASES.committeeDiscussion);
  const readmissionAvoided = text(row, FIELD_ALIASES.readmissionAvoided);
  const dischargeDate = validDateText(row, FIELD_ALIASES.dischargeDate);

  const reasons: string[] = [];
  let score = 0;

  if (news2Last !== null) {
    score += news2Last * 1.15;
    if (news2Last >= 7) reasons.push("NEWS2 alto");
  }

  if (news2Average7d !== null && news2Last !== null) {
    const deltaFromBasal = news2Last - news2Average7d;
    if (deltaFromBasal > 0) {
      score += deltaFromBasal * 1.8;
      reasons.push("piora em relação ao basal de 7 dias");
    } else if (deltaFromBasal < 0) {
      score -= Math.min(Math.abs(deltaFromBasal), 2) * 0.6;
      reasons.push("melhora em relação ao basal de 7 dias");
    }
  }

  if (news2Delta7d !== null) {
    score += news2Delta7d * 1.1;
    if (news2Delta7d >= 2) reasons.push("delta 7 dias positivo");
    if (news2Delta7d <= -2) reasons.push("delta 7 dias em reversão");
  }

  if (isYes(auraAlerted)) {
    score += 1.5;
    reasons.push("alerta AURA ativo");
  }

  if (includesAny(riskLabel, ["alto", "critico", "crítico"])) {
    score += 1.4;
    reasons.push("risco clínico elevado");
  } else if (includesAny(riskLabel, ["medio", "médio"])) {
    score += 0.6;
  }

  if (respiratoryRate !== null && respiratoryRate >= 24) {
    score += 1.5;
    reasons.push("frequência respiratória elevada");
  }
  if (oxygenSaturation !== null && oxygenSaturation < 92) {
    score += 1.8;
    reasons.push("saturação baixa");
  }
  if (systolicBp !== null && (systolicBp <= 90 || systolicBp >= 180)) {
    score += 1.2;
    reasons.push("pressão arterial crítica");
  }
  if (heartRate !== null && (heartRate >= 120 || heartRate <= 45)) {
    score += 1.2;
    reasons.push("frequência cardíaca crítica");
  }
  if (temperature !== null && (temperature >= 38 || temperature <= 35.5)) {
    score += 0.9;
    reasons.push("temperatura fora do basal");
  }
  if (consciousness && !includesAny(consciousness, ["alerta", "consciente", "normal"])) {
    score += 1.1;
    reasons.push("nível de consciência alterado");
  }

  if (completeness !== null) {
    if (completeness < 0.7) {
      score -= 0.8;
      reasons.push("baixa completude de sinais");
    } else if (completeness < 0.9) {
      score -= 0.3;
    }
  }

  if (monitoringStatus && includesAny(monitoringStatus, FINAL_EVENT_TERMS)) {
    score += 2.2;
    reasons.push("evento final já registrado");
  }
  if (isYes(readmissionAvoided)) {
    score -= 1.1;
    reasons.push("caso com reinternação evitada");
  }

  if (interventionUnit && includesAny(interventionUnit, ["sem retorno"])) {
    score += 1.2;
    reasons.push("sem retorno após intervenção");
  }

  const band = score >= 10 ? "critico" : score >= 7 ? "alto" : score >= 4 ? "medio" : "baixo";
  const recommendation = deriveRecommendation({
    auraAlerted,
    news2Last,
    news2Average7d,
    news2Delta7d,
    interventionUnit,
    interventionResult,
    clinicalOutcome,
    monitoringStatus,
    committeeDiscussion,
    readmissionAvoided,
  });
  const trainingLabel = deriveTrainingLabel({
    interventionResult,
    clinicalOutcome,
    monitoringStatus,
    committeeDiscussion,
    readmissionAvoided,
    interventionUnit,
  });

  const trimmedReasons = reasons.slice(0, 4);
  if (trimmedReasons.length === 0) {
    trimmedReasons.push("sem sinal de piora imediata");
  }

  return {
    id: `${patientName}-${index + 1}`,
    patientName,
    unit,
    bed,
    careLine,
    age,
    riskLabel,
    news2Last,
    news2Average7d,
    news2Delta7d,
    respiratoryRate,
    oxygenSaturation,
    oxygenSupport,
    systolicBp,
    heartRate,
    consciousness,
    temperature,
    completeness,
    auraAlerted,
    recurrenceFlag,
    interventionUnit,
    interventionResult,
    clinicalAlteration,
    clinicalOutcome,
    monitoringStatus,
    committeeDiscussion,
    readmissionAvoided,
    dischargeDate,
    score: round(score),
    band,
    recommendation,
    trainingLabel,
    reasons: trimmedReasons,
  };
}

function deriveRecommendation(input: {
  auraAlerted: string | null;
  news2Last: number | null;
  news2Average7d: number | null;
  news2Delta7d: number | null;
  interventionUnit: string | null;
  interventionResult: string | null;
  clinicalOutcome: string | null;
  monitoringStatus: string | null;
  committeeDiscussion: string | null;
  readmissionAvoided: string | null;
}): string {
  const { auraAlerted, news2Last, news2Average7d, news2Delta7d, interventionUnit, interventionResult, clinicalOutcome, monitoringStatus, committeeDiscussion, readmissionAvoided } = input;

  if (isYes(readmissionAvoided)) return "Caso de sucesso: registrar aprendizado e consolidar o gatilho que evitou a reinternação.";
  if (monitoringStatus && includesAny(monitoringStatus, FINAL_EVENT_TERMS)) {
    return "Caso com reinternação/óbito explícito: revisar janela de intervenção e marcar como referência para treino.";
  }
  if (interventionUnit && includesAny(interventionUnit, ["sem retorno"])) {
    return "Prioridade alta: sem retorno após atuação, subir para discussão do comitê.";
  }
  if (committeeDiscussion && includesAny(committeeDiscussion, ["discut", "avaliar"])) {
    return "Caso já discutido: verificar se a decisão ficou estável ou se precisa reabertura.";
  }
  if (news2Last !== null && news2Average7d !== null && news2Last - news2Average7d >= 2) {
    return "Piora acima do basal de 7 dias: revisar sinais vitais, causa e resposta esperada.";
  }
  if (news2Delta7d !== null && news2Delta7d <= -2) {
    return "Tendência de reversão: confirmar se a melhora já é sustentada.";
  }
  if (isYes(auraAlerted)) {
    return "Atuar agora: checar sinais, comunicação da unidade e resposta à comissão.";
  }
  if (interventionResult || clinicalOutcome) {
    return "Conferir desfecho e usar o caso como rótulo assistido para o modelo base.";
  }
  return "Caso em monitoramento: manter observação e completar os campos faltantes.";
}

function deriveTrainingLabel(input: {
  interventionResult: string | null;
  clinicalOutcome: string | null;
  monitoringStatus: string | null;
  committeeDiscussion: string | null;
  readmissionAvoided: string | null;
  interventionUnit: string | null;
}): string {
  const { interventionResult, clinicalOutcome, monitoringStatus, committeeDiscussion, readmissionAvoided, interventionUnit } = input;
  const combined = [interventionResult, clinicalOutcome, monitoringStatus, committeeDiscussion, interventionUnit].filter(Boolean).join(" | ").toLowerCase();

  if (isYes(readmissionAvoided) || combined.includes("evit")) return "reinternacao_evitada";
  if (combined.includes("revers") || combined.includes("melhora") || combined.includes("estavel") || combined.includes("estável")) return "reversao_piora";
  if (combined.includes("sem retorno")) return "sem_retorno";
  if (includesAny(combined, FINAL_EVENT_TERMS)) return "reinternacao_inevitavel";
  return "monitoramento_ativo";
}

function buildSummary(cases: TriageCase[]): TriageSummary {
  const totalCases = cases.length;
  const alertCases = cases.filter((item) => isYes(item.auraAlerted)).length;
  const highPriorityCases = cases.filter((item) => item.band === "alto" || item.band === "critico").length;
  const activeDiscussions = cases.filter((item) => !!item.committeeDiscussion).length;
  const finalEvents = cases.filter((item) => item.monitoringStatus !== null && includesAny(item.monitoringStatus, FINAL_EVENT_TERMS)).length;

  return {
    totalCases,
    alertCases,
    highPriorityCases,
    activeDiscussions,
    finalEvents,
    averageNews2: average(cases.map((item) => item.news2Last)),
    averageNews2Average7d: average(cases.map((item) => item.news2Average7d)),
    averageDelta7d: average(cases.map((item) => item.news2Delta7d)),
  };
}

function buildFeatureSignals(rows: Row[]): FeatureSignal[] {
  const total = rows.length || 1;
  return FEATURE_DEFS.map((feature) => {
    const coverage = rows.filter((row) => {
      const value = pick(row, FIELD_ALIASES[feature.key as keyof typeof FIELD_ALIASES] ?? [feature.key]);
      return value !== null && value !== undefined && String(value).trim() !== "";
    }).length;
    return {
      key: feature.key,
      label: feature.label,
      coverage: round((coverage / total) * 100),
      role: feature.role,
      note: feature.note,
    };
  });
}

function buildLabelSignals(cases: TriageCase[]): LabelSignal[] {
  const counts = new Map<string, number>();
  for (const item of cases) {
    counts.set(item.trainingLabel, (counts.get(item.trainingLabel) ?? 0) + 1);
  }

  return LABEL_DEFS.map((label) => ({
    key: label.key,
    label: label.label,
    count: counts.get(label.key) ?? 0,
    note: label.note,
  }));
}

function buildTrainingRows(cases: TriageCase[]): TrainingDatasetRow[] {
  return cases.map((item) => ({
    patient_id: item.id,
    discharge_date: item.dischargeDate ?? "",
    patient_name: item.patientName,
    unit: item.unit,
    care_line: item.careLine ?? "",
    age: item.age,
    news2_last: item.news2Last,
    news2_average_7d: item.news2Average7d,
    news2_delta_7d: item.news2Delta7d,
    respiratory_rate: item.respiratoryRate,
    oxygen_saturation: item.oxygenSaturation,
    oxygen_support_flag: item.oxygenSupport && !includesAny(item.oxygenSupport, ["nao", "não", "ar ambiente"]) ? 1 : 0,
    systolic_bp: item.systolicBp,
    heart_rate: item.heartRate,
    consciousness_flag: item.consciousness && !includesAny(item.consciousness, ["alerta", "consciente", "normal"]) ? 1 : 0,
    temperature: item.temperature,
    completeness: item.completeness,
    aura_alerted_flag: isYes(item.auraAlerted) ? 1 : 0,
    acute_decompensation_flag: isAcuteDecompensation(item.clinicalAlteration) ? 1 : 0,
    triage_score: item.score,
    triage_band: item.band,
    target_label: item.trainingLabel,
    target_readmission_event: item.trainingLabel === "reinternacao_inevitavel" ? 1 : 0,
    target_effective_intervention: ["reinternacao_evitada", "reversao_piora"].includes(item.trainingLabel) ? 1 : 0,
  }));
}

function buildModelReadiness(
  trainingRows: TrainingDatasetRow[],
  featureSignals: FeatureSignal[],
  labelSignals: LabelSignal[]
): ModelReadiness {
  const usableFeatureCount = featureSignals.filter(
    (item) => item.role !== "label" && item.coverage >= 65
  ).length;
  const labelDiversity = labelSignals.filter((item) => item.count > 0).length;
  const trainableRows = trainingRows.filter(
    (item) => item.news2_last !== null && item.news2_average_7d !== null
  ).length;

  if (trainableRows < 100 || usableFeatureCount < 4) {
    return {
      trainableRows,
      usableFeatureCount,
      labelDiversity,
      status: "insuficiente",
      message: "Ainda falta volume ou cobertura de variáveis para treinar um baseline confiável.",
    };
  }

  if (labelDiversity < 3) {
    return {
      trainableRows,
      usableFeatureCount,
      labelDiversity,
      status: "precisa_rotulagem",
      message: "A base tem sinais suficientes, mas os rótulos precisam de revisão clínica para evitar viés.",
    };
  }

  return {
    trainableRows,
    usableFeatureCount,
    labelDiversity,
    status: "baseline_pronto",
    message: "A base já permite treinar um primeiro modelo tabular e medir desempenho.",
  };
}

function buildNotes(rows: Row[], cases: TriageCase[]): string[] {
  const notes = [
    "Base preparada a partir da aba Pct Watcher, que já traz NEWS2, basal de 7 dias e campos de decisão do comitê.",
  ];
  const alertRate = cases.length ? cases.filter((item) => isYes(item.auraAlerted)).length / cases.length : 0;
  if (alertRate > 0.7) {
    notes.push("A maior parte da base já está marcada como alerta, então o modelo base tende a aprender melhor o refinamento do risco do que a detecção inicial.");
  }
  const missingSignalRows = rows.filter((row) => !pick(row, FIELD_ALIASES.news2Last) || !pick(row, FIELD_ALIASES.news2Average7d)).length;
  if (missingSignalRows > 0) {
    notes.push(`${missingSignalRows} linhas ainda estão sem NEWS2 atual ou média de 7 dias; isso precisa de validação antes do treino supervisionado.`);
  }
  notes.push("Os rótulos derivados aqui são heurísticos e servem como ponto de partida para uma primeira base de treino, não como verdade final.");
  return notes;
}

function average(values: Array<number | null>): number {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return 0;
  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
