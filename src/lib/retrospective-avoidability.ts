export type AvoidabilityVerdict =
  | "provavelmente_evitavel"
  | "possivelmente_evitavel"
  | "provavelmente_inevitavel"
  | "sem_sinal_previo";

export type AvoidabilityConfidence = "baixa" | "media" | "alta";

export type EffectivenessReason =
  | "sem_retorno"
  | "retorno_estavel"
  | "retorno_desfavoravel"
  | "retorno_favoravel_reinternou"
  | "outros";

export interface PriorAlertSummary {
  date: string;
  unit: string;
  news2Last: number | null;
  news2Delta7d: number | null;
  clinicalAlteration: string | null;
  auraAlerted: string | null;
  interventionUnit: string | null;
  interventionResult: string | null;
  clinicalOutcome: string | null;
  committeeDiscussion: string | null;
  daysBeforeEvent: number;
  acted: boolean;
  effectivenessReason: EffectivenessReason;
}

export interface PhysiologySummary {
  registroRowsInWindow: number;
  maxNews2: number | null;
  maxDeltaLabel: string | null;
  notifiedCount: number;
  eligibleAuraCount: number;
  scoreAtRiskCount: number;
  hadEscalation: boolean;
}

export interface News2Reading {
  peakScore: number | null;
  peakBand: News2Band | null;
  peakMeaning: string | null;
  riseSummary: string | null;
  guide: string[];
}

export interface ClinicalReference {
  label: string;
  detail: string;
}

export interface RetrospectiveAvoidability {
  avoidability: AvoidabilityVerdict;
  confidence: AvoidabilityConfidence;
  eventSummary: string;
  eventDate: string | null;
  priorAlerts: PriorAlertSummary[];
  physiologySummary: PhysiologySummary;
  missedTriggers: string[];
  bestAction: string;
  actionPlan: string[];
  learningPoints: string[];
  clinicalImpression: string;
  news2Reading: News2Reading;
  references: ClinicalReference[];
  explanation: string;
}

export type News2Band = "baixo" | "baixo_medio" | "medio" | "alto" | "critico";

export interface WatcherHistoryRow {
  patientName: string;
  date: string | null;
  unit: string;
  news2Last: number | null;
  news2Delta7d: number | null;
  clinicalAlteration: string | null;
  auraAlerted: string | null;
  interventionUnit: string | null;
  interventionResult: string | null;
  clinicalOutcome: string | null;
  committeeDiscussion: string | null;
  monitoringStatus: string | null;
  trrTriggered: string | null;
}

export interface RegistroHistoryRow {
  patientName: string;
  date: string | null;
  news2Last: number | null;
  deltaLabel: string | null;
  notified: string | null;
  eligibleAura: string | null;
  scoreAtRisk: string | null;
}

const PRIOR_ALERT_DAYS = 10;

const AVOIDABILITY_LABELS: Record<AvoidabilityVerdict, string> = {
  provavelmente_evitavel: "Provavelmente evitável",
  possivelmente_evitavel: "Possivelmente evitável",
  provavelmente_inevitavel: "Provavelmente inevitável",
  sem_sinal_previo: "Sem sinal prévio claro",
};

const REASON_LABELS: Record<EffectivenessReason, string> = {
  sem_retorno: "sem retorno da unidade",
  retorno_estavel: "retorno estável",
  retorno_desfavoravel: "retorno desfavorável",
  retorno_favoravel_reinternou: "retorno aparentemente favorável, mas reinternou depois",
  outros: "retorno sem desfecho claro",
};

export function normalizePatientName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function daysBetween(fromISO: string, toISO: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function buildRetrospectiveAvoidability(input: {
  patientName: string;
  unit: string;
  monitoringStatus: string | null;
  clinicalOutcome: string | null;
  committeeDiscussion: string | null;
  interventionUnit: string | null;
  eventDate: string | null;
  watcherHistory: WatcherHistoryRow[];
  registroHistory: RegistroHistoryRow[];
}): RetrospectiveAvoidability {
  const patientKey = normalizePatientName(input.patientName);
  const eventDate = input.eventDate;

  const priorAlerts = input.watcherHistory
    .filter((row) => normalizePatientName(row.patientName) === patientKey)
    .filter((row) => isAuraAlert(row.auraAlerted))
    .filter((row) => {
      if (!eventDate || !row.date) return true;
      const diff = daysBetween(row.date, eventDate);
      return diff >= 0 && diff <= PRIOR_ALERT_DAYS;
    })
    .map((row) => toPriorAlert(row, eventDate))
    .sort((a, b) => b.daysBeforeEvent - a.daysBeforeEvent); // oldest first for narrative timeline

  const registrosInWindow = input.registroHistory
    .filter((row) => normalizePatientName(row.patientName) === patientKey)
    .filter((row) => {
      if (!eventDate || !row.date) return true;
      const diff = daysBetween(row.date, eventDate);
      return diff >= 0 && diff <= PRIOR_ALERT_DAYS;
    });

  const physiologySummary = summarizePhysiology(registrosInWindow);
  const patientWatcherRows = input.watcherHistory.filter(
    (row) => normalizePatientName(row.patientName) === patientKey
  );
  const hadTrr = patientWatcherRows.some((row) => isYesLoose(row.trrTriggered));

  const committeeText = normalizeText(
    [input.committeeDiscussion, input.clinicalOutcome, input.monitoringStatus].filter(Boolean).join(" | ")
  );

  const hadAuraAlert = priorAlerts.length > 0;
  const anySemRetorno = priorAlerts.some((alert) => !alert.acted || alert.effectivenessReason === "sem_retorno");
  const anyActedUnfavorable = priorAlerts.some(
    (alert) =>
      alert.acted &&
      (alert.effectivenessReason === "retorno_desfavoravel" ||
        alert.effectivenessReason === "retorno_favoravel_reinternou")
  );
  const committeeAvoidable = includesAny(committeeText, ["evitavel", "evitável"]);
  const committeeInevitable = includesAny(committeeText, ["inevitavel", "inevitável", "finitude"]);
  const isDeath = includesAny(committeeText, ["obito", "óbito"]);
  const sameDayOnly =
    hadAuraAlert && priorAlerts.every((alert) => alert.daysBeforeEvent === 0) && !physiologySummary.hadEscalation;

  let avoidability: AvoidabilityVerdict;
  let confidence: AvoidabilityConfidence;

  if (committeeInevitable || (isDeath && sameDayOnly)) {
    avoidability = "provavelmente_inevitavel";
    confidence = committeeInevitable ? "alta" : "media";
  } else if (committeeAvoidable || (hadAuraAlert && anySemRetorno)) {
    avoidability = "provavelmente_evitavel";
    confidence = committeeAvoidable || priorAlerts.length >= 2 ? "alta" : "media";
  } else if (
    (hadAuraAlert && anyActedUnfavorable) ||
    (!hadAuraAlert && physiologySummary.hadEscalation)
  ) {
    avoidability = "possivelmente_evitavel";
    confidence = "media";
  } else if (!hadAuraAlert && !physiologySummary.hadEscalation) {
    avoidability = "sem_sinal_previo";
    confidence = registrosInWindow.length > 0 ? "media" : "baixa";
  } else {
    avoidability = "possivelmente_evitavel";
    confidence = "baixa";
  }

  const narrative = buildCaseNarrative({
    patientName: input.patientName,
    unit: input.unit,
    eventDate,
    monitoringStatus: input.monitoringStatus,
    clinicalOutcome: input.clinicalOutcome,
    committeeDiscussion: input.committeeDiscussion,
    avoidability,
    confidence,
    priorAlerts,
    physiologySummary,
    hadTrr,
  });

  const eventSummary = [
    input.monitoringStatus || "evento final",
    input.clinicalOutcome ? `desfecho: ${input.clinicalOutcome}` : null,
    eventDate ? `data ref.: ${formatDateBr(eventDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Keep chronological for UI cards (closest to event first, matching previous UI)
  const alertsForUi = [...priorAlerts].sort((a, b) => a.daysBeforeEvent - b.daysBeforeEvent);

  return {
    avoidability,
    confidence,
    eventSummary,
    eventDate,
    priorAlerts: alertsForUi.slice(0, 8),
    physiologySummary,
    missedTriggers: narrative.missedTriggers,
    bestAction: narrative.bestAction,
    actionPlan: narrative.actionPlan,
    learningPoints: narrative.whyPoints,
    clinicalImpression: narrative.clinicalImpression,
    news2Reading: narrative.news2Reading,
    references: narrative.references,
    explanation: narrative.explanation,
  };
}

function buildCaseNarrative(input: {
  patientName: string;
  unit: string;
  eventDate: string | null;
  monitoringStatus: string | null;
  clinicalOutcome: string | null;
  committeeDiscussion: string | null;
  avoidability: AvoidabilityVerdict;
  confidence: AvoidabilityConfidence;
  priorAlerts: PriorAlertSummary[];
  physiologySummary: PhysiologySummary;
  hadTrr: boolean;
}): {
  whyPoints: string[];
  missedTriggers: string[];
  bestAction: string;
  actionPlan: string[];
  clinicalImpression: string;
  news2Reading: News2Reading;
  references: ClinicalReference[];
  explanation: string;
} {
  const { priorAlerts, physiologySummary: phys, eventDate } = input;
  const whyPoints: string[] = [];
  const missedTriggers: string[] = [];
  const shouldDo: string[] = [];

  const earliest = priorAlerts[0] ?? null;
  const peakAlert = priorAlerts.reduce<PriorAlertSummary | null>((best, alert) => {
    if (alert.news2Last === null) return best;
    if (!best || best.news2Last === null || alert.news2Last > best.news2Last) return alert;
    return best;
  }, null);

  const falseSafety = priorAlerts.find((a) => a.effectivenessReason === "retorno_favoravel_reinternou");
  const noReturn = priorAlerts.find((a) => !a.acted || a.effectivenessReason === "sem_retorno");
  const unfavorable = priorAlerts.find((a) => a.effectivenessReason === "retorno_desfavoravel");
  const news2Rise =
    earliest?.news2Last !== null &&
    earliest?.news2Last !== undefined &&
    peakAlert?.news2Last !== null &&
    peakAlert?.news2Last !== undefined &&
    peakAlert.news2Last - earliest.news2Last >= 2
      ? { from: earliest.news2Last, to: peakAlert.news2Last, fromDate: earliest.date, toDate: peakAlert.date }
      : null;

  const peakScore = peakAlert?.news2Last ?? phys.maxNews2;
  const news2Reading = buildNews2Reading({ peakScore, news2Rise, phys });

  // --- Clinical argument (compact, physician tone) ---
  if (earliest && earliest.daysBeforeEvent > 0 && earliest.news2Last !== null) {
    whyPoints.push(
      `Em ${formatDateBr(earliest.date)}, ${earliest.daysBeforeEvent} dia(s) antes da reinternação, o paciente já apresentava NEWS2 ${earliest.news2Last} (${describeNews2Band(earliest.news2Last)})` +
        (earliest.clinicalAlteration ? `, classificado como ${earliest.clinicalAlteration}` : "") +
        `. Houve ${describeIntervention(earliest).toLowerCase()}, com registro de ${REASON_LABELS[earliest.effectivenessReason]}.`
    );
  } else if (earliest && earliest.daysBeforeEvent === 0) {
    whyPoints.push(
      `O alerta AURA só aparece no dia do evento (${formatDateBr(earliest.date)})` +
        (earliest.news2Last !== null
          ? `, já com NEWS2 ${earliest.news2Last} (${describeNews2Band(earliest.news2Last)})`
          : "") +
        `. Do ponto de vista assistencial, isso sugere reconhecimento tardio da deterioração.`
    );
  }

  if (falseSafety && peakAlert && news2Rise) {
    whyPoints.push(
      `A reavaliação de ${formatDateBr(falseSafety.date)} gerou falsa segurança clínica (“melhora”), mas a trajetória fisiológica contradiz essa impressão: o NEWS2 evoluiu de ${news2Rise.from} para ${news2Rise.to} em ${formatDateBr(news2Rise.toDate)}. Em linguagem prática: houve melhora pontual de exame/conduta, sem estabilização sustentada.`
    );
    missedTriggers.push(
      `Falsa segurança em ${formatDateBr(falseSafety.date)} (NEWS2 ${falseSafety.news2Last ?? "n/a"}) sem vigília até NEWS2 ${peakAlert.news2Last}`
    );
  } else if (falseSafety) {
    whyPoints.push(
      `Em ${formatDateBr(falseSafety.date)} registrou-se melhora clínica, porém o desfecho foi reinternação. Melhora isolada sem critérios de estabilidade (NEWS2 em queda sustentada, diurese, SatO₂, nível de consciência) não autoriza encerrar o alerta.`
    );
    missedTriggers.push(`Melhora pontual em ${formatDateBr(falseSafety.date)} sem critérios de estabilidade`);
  }

  if (noReturn) {
    whyPoints.push(
      `No alerta de ${formatDateBr(noReturn.date)}` +
        (noReturn.news2Last !== null ? ` (NEWS2 ${noReturn.news2Last})` : "") +
        ` não houve fechamento de loop pela unidade. Sem retorno, não há como afirmar que a deterioração foi reavaliada a tempo.`
    );
    missedTriggers.push(`Alerta de ${formatDateBr(noReturn.date)} sem retorno da unidade`);
  }

  if (unfavorable?.news2Last !== null && unfavorable && unfavorable.daysBeforeEvent === 0) {
    whyPoints.push(
      `No dia da reinternação, o NEWS2 ${unfavorable.news2Last} já configurava emergência fisiológica (${describeNews2Band(unfavorable.news2Last)}). Intervir nesse momento tende a ser dano-controle, não prevenção.`
    );
  }

  if (news2Rise && !input.hadTrr && news2Rise.to >= 7) {
    whyPoints.push(
      `A subida ${news2Rise.from}→${news2Rise.to} ultrapassa o limiar de resposta emergencial do NEWS2 (≥7). Nestes casos, a conduta esperada não é apenas reavaliação local: é escalada (TRR/time de resposta rápida) e discussão formal de suporte.`
    );
    missedTriggers.push(`NEWS2 ${news2Rise.to} sem TRR (escalada ${news2Rise.from}→${news2Rise.to})`);
  } else if (peakScore !== null && peakScore >= 7 && !input.hadTrr) {
    whyPoints.push(
      `NEWS2 máximo ${peakScore} sem TRR documentado. Pelo protocolo NEWS2, esse patamar exige resposta emergencial.`
    );
    missedTriggers.push(`NEWS2 ${peakScore} sem TRR acionado`);
  }

  if (phys.eligibleAuraCount >= 3 && phys.notifiedCount < Math.max(1, Math.floor(phys.eligibleAuraCount * 0.35))) {
    whyPoints.push(
      `Na série de Registros havia sinal persistente de risco (${phys.scoreAtRiskCount} coletas em risco; ${phys.eligibleAuraCount} elegíveis AURA), mas só ${phys.notifiedCount} notificação(ões). Ou seja: o corpo “avisou” várias vezes; o sistema de alerta não acompanhou na mesma intensidade.`
    );
    missedTriggers.push(
      `Subnotificação: ${phys.eligibleAuraCount} elegíveis AURA vs ${phys.notifiedCount} notificados`
    );
  }

  if (priorAlerts.length === 0 && phys.hadEscalation) {
    whyPoints.push(
      `Não há alerta AURA em Pct Watcher, mas Registros mostram deterioração (NEWS2 máx ${phys.maxNews2 ?? "n/a"}). Há evidência fisiológica prévia sem entrada no fluxo do comitê.`
    );
    missedTriggers.push("Escalada em Registros sem alerta AURA em Pct Watcher");
  }

  if (priorAlerts.length === 0 && !phys.hadEscalation) {
    whyPoints.push(
      `Não há alerta prévio nem escalada clara em Registros. Pode ter sido evento súbito — ou falha de registro/completude de sinais vitais.`
    );
  }

  if (input.committeeDiscussion && includesAny(input.committeeDiscussion, ["evitavel", "evitável"])) {
    whyPoints.push(`A discussão do comitê já sinalizou evitabilidade: “${input.committeeDiscussion}”.`);
  }
  if (input.committeeDiscussion && includesAny(input.committeeDiscussion, ["inevitavel", "inevitável", "finitude"])) {
    whyPoints.push(
      `A discussão aponta inevitabilidade/finitude (“${input.committeeDiscussion}”). Neste cenário, o foco é adequação de plano e comunicação, não falha de protocolo.`
    );
  }

  if (whyPoints.length === 0) {
    whyPoints.push(
      `Com os dados atuais, não há um único gatilho dominante. Recomenda-se revisão clínica da linha do tempo de ${input.patientName}.`
    );
  }

  // --- Action plan (nursing-facing, concrete) ---
  if (noReturn) {
    shouldDo.push(
      `Fechar o loop no alerta de ${formatDateBr(noReturn.date)}: retorno da enfermagem/médico em até 1–2h, conduta registrada e reescala ao comitê se não houver resposta.`
    );
  }
  if (falseSafety) {
    shouldDo.push(
      `Após “melhora” em ${formatDateBr(falseSafety.date)}: manter o paciente em vigília estreita 24–48h (SSVV mais frequentes). Só encerrar alerta com NEWS2 em queda sustentada e estabilidade clínica documentada — não por impressão pontual.`
    );
  }
  if ((peakScore ?? 0) >= 7 && !input.hadTrr) {
    shouldDo.push(
      `Com NEWS2 ${peakScore} (${describeNews2Band(peakScore!)}): acionar TRR/time de resposta rápida de imediato, conforme limiar NEWS2 ≥7 (RCP, 2017). Não deixar a decisão só na reavaliação da unidade.`
    );
  }
  if (news2Rise && earliest && earliest.daysBeforeEvent >= 2) {
    shouldDo.push(
      `Na trajetória ${news2Rise.from}→${news2Rise.to} (${formatDateBr(news2Rise.fromDate)} a ${formatDateBr(news2Rise.toDate)}): investigar causa da descompensação (infecção, hipoxemia, volume, dor, medicação) e levar ao comitê AURA antes da reinternação.`
    );
  }
  if (phys.eligibleAuraCount > phys.notifiedCount && phys.eligibleAuraCount >= 3) {
    shouldDo.push(
      `Protocolar notificação AURA em toda elegibilidade com Score ≥4 / Delta 2+ (neste caso: ${phys.eligibleAuraCount} elegíveis e ${phys.notifiedCount} notificados).`
    );
  }
  if (input.avoidability === "provavelmente_inevitavel") {
    shouldDo.push(
      "Documentar como finitude/inevitabilidade: alinhar plano paliativo e comunicação com família, sem classificar como falha operacional."
    );
  }
  if (input.avoidability === "sem_sinal_previo") {
    shouldDo.push(
      "Auditar completude de SSVV e cobertura de turnos; se o evento foi súbito, registrar formalmente para não distorcer o protocolo."
    );
  }
  if (shouldDo.length === 0) {
    shouldDo.push(
      `Revisar a linha do tempo no comitê e fixar escalada clara: NEWS2 ≥5 resposta urgente; NEWS2 ≥7 TRR/emergência.`
    );
  }

  const actionPlan = shouldDo.slice(0, 3);
  const bestAction = actionPlan[0];
  const references = buildClinicalReferences(peakScore);
  const eventLabel = input.monitoringStatus || input.clinicalOutcome || "reinternação";

  const clinicalImpression =
    `${AVOIDABILITY_LABELS[input.avoidability]}. ` +
    (input.avoidability === "provavelmente_inevitavel"
      ? `O quadro de ${input.patientName} comporta leitura de inevitabilidade/finitude; a prioridade é adequação de plano, não buscar falha operacional.`
      : input.avoidability === "sem_sinal_previo"
        ? `Não há sinal prévio claro na janela analisada para ${input.patientName}; a reinternação pode ter sido súbita ou mal documentada.`
        : `Havia janela assistencial antes da reinternação de ${input.patientName}` +
          (eventDate ? ` (${formatDateBr(eventDate)})` : "") +
          (peakScore !== null
            ? `, com deterioração até NEWS2 ${peakScore}/20 (${describeNews2Band(peakScore)})`
            : "") +
          `. A conduta registrada não foi proporcional ao risco fisiológico.`);

  const lines = [
    `**Parecer clínico retrospectivo — ${input.patientName}**`,
    `• **Impressão:** ${clinicalImpression}`,
    `• **Evento:** ${eventLabel}` +
      (eventDate ? ` em ${formatDateBr(eventDate)}` : "") +
      (input.unit ? ` · ${input.unit}` : "") +
      `.`,
    "",
    "**Por que esta conclusão (resumo clínico):**",
    ...whyPoints.slice(0, 4).map((point) => `• ${point}`),
    "",
    "**Como ler o NEWS2 neste caso:**",
    `• ${news2Reading.peakMeaning ?? "Sem NEWS2 pico disponível na janela."}`,
    ...(news2Reading.riseSummary ? [`• ${news2Reading.riseSummary}`] : []),
    "• Escala oficial: 0–20. **≥5** = resposta urgente; **≥7** = resposta emergencial (time crítico/TRR).",
    "",
    "**Conduta esperada (para convencer a equipe de enfermagem):**",
    ...actionPlan.map((step, index) => `• ${index + 1}. ${step}`),
    "",
    "**Referências de apoio:**",
    ...references.map((ref) => `• ${ref.label} — ${ref.detail}`),
  ];

  return {
    whyPoints: whyPoints.slice(0, 4),
    missedTriggers,
    bestAction,
    actionPlan,
    clinicalImpression,
    news2Reading,
    references,
    explanation: lines.join("\n"),
  };
}

/** NEWS2 clinical bands (Royal College of Physicians NEWS2, 2017). */
export function news2Band(score: number): News2Band {
  if (score >= 12) return "critico";
  if (score >= 7) return "alto";
  if (score >= 5) return "medio";
  if (score >= 1) return "baixo_medio";
  return "baixo";
}

export function describeNews2Band(score: number): string {
  const band = news2Band(score);
  switch (band) {
    case "critico":
      return "risco crítico — deterioração grave / falência fisiológica avançada";
    case "alto":
      return "alto risco — resposta emergencial indicada (NEWS2 ≥7)";
    case "medio":
      return "risco médio — resposta urgente indicada (NEWS2 ≥5)";
    case "baixo_medio":
      return "risco baixo-médio — vigilância aumentada";
    default:
      return "baixo risco";
  }
}

function buildNews2Reading(input: {
  peakScore: number | null;
  news2Rise: { from: number; to: number; fromDate: string; toDate: string } | null;
  phys: PhysiologySummary;
}): News2Reading {
  const peakScore = input.peakScore;
  const peakBand = peakScore !== null ? news2Band(peakScore) : null;
  const peakMeaning =
    peakScore === null
      ? null
      : `O pico de NEWS2 neste caso foi ${peakScore}/20 (${describeNews2Band(peakScore)}). ` +
        (peakScore >= 12
          ? "Valores ≥12 são raros na prática diária e indicam instabilidade extrema — compatível com reinternação/UTI se não houver suporte imediato."
          : peakScore >= 7
            ? "A partir de 7, o protocolo internacional pede resposta emergencial, não só observação de rotina."
            : peakScore >= 5
              ? "A partir de 5, já se recomenda resposta urgente da equipe."
              : "Neste patamar, o foco é vigilância e tendência (delta), não só o número absoluto.");

  const riseSummary = input.news2Rise
    ? `Houve piora documentada de NEWS2 ${input.news2Rise.from} → ${input.news2Rise.to} entre ${formatDateBr(input.news2Rise.fromDate)} e ${formatDateBr(input.news2Rise.toDate)}. Essa trajetória importa tanto quanto o valor absoluto: deterioração progressiva é gatilho de escalada.`
    : input.phys.maxDeltaLabel
      ? `Registros marcaram ${input.phys.maxDeltaLabel} na janela — sinal de piora em relação ao basal.`
      : null;

  return {
    peakScore,
    peakBand,
    peakMeaning,
    riseSummary,
    guide: [
      "NEWS2 soma pontos de FR, SpO₂, O₂, PAS, FC, consciência e temperatura (0–20).",
      "0: baixo · 1–4: baixo-médio · 5–6: médio (urgente) · ≥7: alto (emergencial).",
      "≥12: extremamente grave — quase sempre exige suporte avançado imediato.",
    ],
  };
}

function buildClinicalReferences(peakScore: number | null): ClinicalReference[] {
  const refs: ClinicalReference[] = [
    {
      label: "Royal College of Physicians (RCP) — NEWS2, 2017",
      detail:
        "Padrão internacional de alerta precoce. NEWS2 ≥5 recomenda resposta urgente; ≥7 recomenda resposta emergencial por time clínico crítico.",
    },
    {
      label: "Escalonamento por limiar fisiológico",
      detail:
        "A decisão de TRR/comitê deve seguir o número e a tendência (delta), não apenas a impressão de “melhora” em uma reavaliação pontual.",
    },
  ];
  if (peakScore !== null && peakScore >= 12) {
    refs.push({
      label: "Interpretação de NEWS2 muito elevado (≥12)",
      detail:
        "Scores nessa faixa são incomuns fora de choque, insuficiência respiratória grave ou falência multiorgânica. Exigem reavaliação imediata e suporte avançado.",
    });
  } else if (peakScore !== null && peakScore >= 7) {
    refs.push({
      label: "Resposta a NEWS2 ≥7",
      detail:
        "Indica alto risco de deterioração grave. Conduta esperada: avaliação presencial rápida, oxigenoterapia/suporte conforme causa e acionamento de time de resposta rápida.",
    });
  }
  refs.push({
    label: "Princípio de closed-loop (enfermagem)",
    detail:
      "Alerta sem retorno documentado ou “alta” precoce do monitoramento após melhora pontual são falhas clássicas de segurança do paciente.",
  });
  return refs;
}

function describeIntervention(alert: PriorAlertSummary): string {
  if (!alert.acted) {
    return alert.interventionUnit ? `sem retorno efetivo (${alert.interventionUnit})` : "sem retorno da unidade";
  }
  return alert.interventionUnit || alert.interventionResult || "intervenção registrada";
}

export function formatDateBr(value: string | null | undefined): string {
  if (!value) return "sem data";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return value;
}

function toPriorAlert(row: WatcherHistoryRow, eventDate: string | null): PriorAlertSummary {
  const { acted, reason } = classifyEffectiveness(row);
  const daysBeforeEvent =
    eventDate && row.date ? Math.max(0, daysBetween(row.date, eventDate)) : 0;

  return {
    date: row.date ?? "",
    unit: row.unit,
    news2Last: row.news2Last,
    news2Delta7d: row.news2Delta7d,
    clinicalAlteration: row.clinicalAlteration,
    auraAlerted: row.auraAlerted,
    interventionUnit: row.interventionUnit,
    interventionResult: row.interventionResult,
    clinicalOutcome: row.clinicalOutcome,
    committeeDiscussion: row.committeeDiscussion,
    daysBeforeEvent,
    acted,
    effectivenessReason: reason,
  };
}

function classifyEffectiveness(row: WatcherHistoryRow): {
  acted: boolean;
  reason: EffectivenessReason;
} {
  const acted = hasActedIntervention(row.interventionUnit);
  if (!acted) {
    return { acted: false, reason: "sem_retorno" };
  }

  const combined = normalizeText(
    [row.committeeDiscussion, row.clinicalOutcome, row.interventionResult].filter(Boolean).join(" ")
  );

  const isWell =
    includesAny(combined, ["melhora", "basal", "bem", "normal", "sem alteracao", "sem alteração"]);
  const isStable = includesAny(combined, ["estavel", "estável", "estabiliz"]);
  const isUnwell = includesAny(combined, [
    "mal",
    "deterior",
    "piora",
    "finitude",
    "reintern",
    "obito",
    "óbito",
  ]);

  if (isWell && !isUnwell) return { acted: true, reason: "retorno_favoravel_reinternou" };
  if (isStable && !isUnwell) return { acted: true, reason: "retorno_estavel" };
  if (isUnwell) return { acted: true, reason: "retorno_desfavoravel" };
  return { acted: true, reason: "outros" };
}

function summarizePhysiology(rows: RegistroHistoryRow[]): PhysiologySummary {
  let maxNews2: number | null = null;
  let maxDeltaLabel: string | null = null;
  let notifiedCount = 0;
  let eligibleAuraCount = 0;
  let scoreAtRiskCount = 0;

  for (const row of rows) {
    if (row.news2Last !== null) {
      maxNews2 = maxNews2 === null ? row.news2Last : Math.max(maxNews2, row.news2Last);
    }
    if (row.deltaLabel && includesAny(normalizeText(row.deltaLabel), ["delta 2", "delta2", "critico", "crítico"])) {
      maxDeltaLabel = row.deltaLabel;
    } else if (row.deltaLabel && !maxDeltaLabel) {
      maxDeltaLabel = row.deltaLabel;
    }
    if (isTruthyFlag(row.notified)) notifiedCount += 1;
    if (isYesLoose(row.eligibleAura) || normalizeText(row.eligibleAura) === "s") eligibleAuraCount += 1;
    if (includesAny(normalizeText(row.scoreAtRisk), ["risco"])) scoreAtRiskCount += 1;
  }

  const hadEscalation =
    (maxNews2 !== null && maxNews2 >= 5) ||
    notifiedCount > 0 ||
    scoreAtRiskCount > 0 ||
    Boolean(maxDeltaLabel && includesAny(normalizeText(maxDeltaLabel), ["delta 2", "delta2", "critico", "crítico"]));

  return {
    registroRowsInWindow: rows.length,
    maxNews2,
    maxDeltaLabel,
    notifiedCount,
    eligibleAuraCount,
    scoreAtRiskCount,
    hadEscalation,
  };
}

function isAuraAlert(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  if (includesAny(normalized, ["nao", "não", "n/a", "na"])) return false;
  if (includesAny(normalized, ["repeticao", "repetição"])) return false;
  return isYesLoose(value) || normalized === "sim" || normalized.includes("alert");
}

function hasActedIntervention(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  if (includesAny(normalized, ["sem retorno", "nao", "não", "n/a"])) return false;
  return includesAny(normalized, ["sim", "reavali", "interven", "acao", "ação", "trr"]);
}

function isYesLoose(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  return ["sim", "s", "yes", "y", "true", "1", "alerta", "alto", "critico", "crítico"].includes(normalized);
}

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  return normalized === "1" || normalized === "sim" || normalized === "s" || normalized === "true";
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string | null | undefined, terms: string[]): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

export function avoidabilityLabel(verdict: AvoidabilityVerdict): string {
  return AVOIDABILITY_LABELS[verdict];
}

export function effectivenessReasonLabel(reason: EffectivenessReason): string {
  return REASON_LABELS[reason];
}
