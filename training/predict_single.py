from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import joblib
import pandas as pd

from train_baseline import CATEGORICAL_FEATURES, NUMERIC_FEATURES

FINAL_EVENT_TERMS = (
    "reintern",
    "hospitaliza",
    "internacao hospitalar",
    "internação hospitalar",
    "obito",
    "óbito",
)


def ensure_model_features(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    for feature in NUMERIC_FEATURES:
        if feature not in prepared.columns:
            prepared[feature] = 0
    for feature in CATEGORICAL_FEATURES:
        if feature not in prepared.columns:
            prepared[feature] = ""
    return prepared


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def normalize_text(value: object) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", strip_accents(str(value)).lower()).strip()


def has_final_event(data: dict) -> bool:
    if data.get("final_event_flag") == 1:
        return True
    if data.get("target_readmission_event") == 1:
        return True
    if data.get("target_label") == "reinternacao_inevitavel":
        return True

    status = normalize_text(data.get("monitoring_status"))
    if not status:
        return False
    return any(normalize_text(term) in status for term in FINAL_EVENT_TERMS)


def build_final_event_explanation(data: dict) -> str:
    retrospective = data.get("retrospective")
    if isinstance(retrospective, dict) and retrospective.get("explanation"):
        return str(retrospective["explanation"])

    patient_name = data.get("patient_name", "Paciente")
    status = data.get("monitoring_status") or "evento final registrado"
    return "\n".join(
        [
            f"**Análise para {patient_name}**",
            "• **Evento já ocorrido:** reinternação, hospitalização ou óbito já está registrado neste caso.",
            f"• **Status na planilha:** {status}",
            "",
            "**Leitura para o comitê:**",
            "• Este não é um alerta preventivo de reinternação.",
            "• Use o caso para revisão retrospectiva: janela de intervenção, gatilhos perdidos e aprendizado do protocolo.",
            "• A probabilidade preventiva do modelo foi omitida de propósito para não contradizer o desfecho já conhecido.",
        ]
    )


def serialize_retrospective(data: dict) -> dict | None:
    retrospective = data.get("retrospective")
    if not isinstance(retrospective, dict):
        return None
    return retrospective


def build_predictive_explanation(
    data: dict,
    *,
    prob_readmission: float,
    prob_effective: float,
) -> str:
    aura_alerted = data.get("aura_alerted_flag", 0) == 1
    acute_decomp = data.get("acute_decompensation_flag", 0) == 1

    explanation_lines = [
        f"**Análise Preditiva para {data.get('patient_name', 'Paciente')}**",
        f"• Probabilidade de Reinternação (Inevitável): {prob_readmission:.1%}",
        f"• Probabilidade de Intervenção Efetiva: {prob_effective:.1%}",
        "",
        "**Explicação Clínica e Alertas AURA:**",
    ]

    if acute_decomp:
        explanation_lines.append(
            "• **Intercorrência:** O paciente apresentou sinais de descompensação aguda (intercorrência registrada). O modelo avaliou os sinais vitais alterados neste período."
        )
    else:
        explanation_lines.append(
            "• **Intercorrência:** Não houve registro claro de intercorrência aguda severa neste recorte."
        )

    if prob_readmission > 0.5:
        explanation_lines.append(
            "• **Risco de Reinternação:** O modelo alerta para ALTO risco de reinternação. Os dados fisiológicos (ex: NEWS2 e Delta) indicam instabilidade que historicamente resulta em retorno ao hospital."
        )
    else:
        explanation_lines.append(
            "• **Risco de Reinternação:** O risco de reinternação é BAIXO. Os sinais vitais e histórico do paciente não indicam padrão clássico de falha após alta."
        )

    if aura_alerted:
        if prob_effective > 0.5:
            explanation_lines.append(
                "• **Efetividade do Alerta AURA:** Houve alerta AURA para este paciente e o modelo indica que a intervenção TEM ALTA CHANCE DE SER EFETIVA. A equipe deve agir ou já agiu a tempo de reverter a piora."
            )
        else:
            explanation_lines.append(
                "• **Efetividade do Alerta AURA:** Houve alerta AURA, mas o modelo sugere que a intervenção teve BAIXA CHANCE de ser efetiva (risco de ser um caso sem retorno ou inevitável). A comissão deve revisar se o protocolo foi seguido rapidamente."
            )
    elif prob_effective > 0.5:
        explanation_lines.append(
            "• **Efetividade (Sem Alerta AURA):** Não houve alerta AURA disparado, mas os sinais mostram um quadro onde intervenções costumam ser efetivas. Pode ser um caso de melhora espontânea ou atuação de rotina da unidade."
        )
    else:
        explanation_lines.append(
            "• **Efetividade (Sem Alerta AURA):** Não houve alerta AURA e as métricas não indicam um perfil típico de reversão de piora ativa."
        )

    return "\n".join(explanation_lines)


def main() -> None:
    input_data = sys.stdin.read()
    if not input_data:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)

    try:
        data = json.loads(input_data)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON"}))
        sys.exit(1)

    if has_final_event(data):
        retrospective = serialize_retrospective(data)
        payload = {
            "prob_readmission": None,
            "prob_effective": None,
            "event_already_occurred": True,
            "explanation": build_final_event_explanation(data),
        }
        if retrospective:
            payload["retrospective"] = retrospective
            payload["avoidability"] = retrospective.get("avoidability")
            payload["best_action"] = retrospective.get("bestAction") or retrospective.get("best_action")
        output = json.dumps(payload, ensure_ascii=False)
        sys.stdout.buffer.write(output.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")
        return

    df = ensure_model_features(pd.DataFrame([data]))

    model_readmission_path = Path("models/baseline_readmission/model.joblib")
    model_effective_path = Path("models/baseline_effective_intervention/model.joblib")

    if not model_readmission_path.exists() or not model_effective_path.exists():
        print(json.dumps({"error": "Models not found. Please train them first."}))
        sys.exit(1)

    model_readmission = joblib.load(model_readmission_path)
    model_effective = joblib.load(model_effective_path)

    feature_columns = [col for col in NUMERIC_FEATURES + CATEGORICAL_FEATURES if col in df.columns]
    x = df[feature_columns]

    prob_readmission = float(model_readmission.predict_proba(x)[0][1])
    prob_effective = float(model_effective.predict_proba(x)[0][1])

    output = json.dumps(
        {
            "prob_readmission": prob_readmission,
            "prob_effective": prob_effective,
            "event_already_occurred": False,
            "explanation": build_predictive_explanation(
                data,
                prob_readmission=prob_readmission,
                prob_effective=prob_effective,
            ),
        },
        ensure_ascii=False,
    )
    sys.stdout.buffer.write(output.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
