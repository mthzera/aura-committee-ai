from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd

from train_baseline import CATEGORICAL_FEATURES, NUMERIC_FEATURES


def ensure_model_features(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    for feature in NUMERIC_FEATURES:
        if feature not in prepared.columns:
            prepared[feature] = 0
    for feature in CATEGORICAL_FEATURES:
        if feature not in prepared.columns:
            prepared[feature] = ""
    return prepared


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

    output = json.dumps(
        {
            "prob_readmission": prob_readmission,
            "prob_effective": prob_effective,
            "explanation": "\n".join(explanation_lines),
        },
        ensure_ascii=False,
    )
    sys.stdout.buffer.write(output.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")


if __name__ == "__main__":
    main()
