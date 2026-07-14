from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd

from build_dataset import build_dataset, find_default_workbook
from train_baseline import CATEGORICAL_FEATURES, NUMERIC_FEATURES


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Score recent Patient Watcher rows with the trained readmission baseline."
    )
    parser.add_argument("workbook", nargs="?", type=Path, help="Path to .xlsx/.xls file.")
    parser.add_argument("--model", type=Path, default=Path("models/baseline_readmission/model.joblib"))
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--out", type=Path, default=Path("data/recent_readmission_scores.csv"))
    args = parser.parse_args()

    workbook_path = args.workbook or find_default_workbook()
    if workbook_path is None:
        raise SystemExit("No workbook found. Pass the .xlsx path as the first argument.")
    if not args.model.exists():
        raise SystemExit(f"Model not found: {args.model}. Train the baseline first.")

    dataset = pd.DataFrame(build_dataset(workbook_path))
    if dataset.empty:
        raise SystemExit("No rows found in workbook.")

    dataset["record_date"] = pd.to_datetime(dataset["record_date"], errors="coerce")
    dated = dataset.dropna(subset=["record_date"]).copy()
    if dated.empty:
        raise SystemExit("No dated rows found. Check date columns in workbook.")

    max_date = dated["record_date"].max().normalize()
    start_date = max_date - pd.Timedelta(days=args.days - 1)
    recent = dated[(dated["record_date"] >= start_date) & (dated["record_date"] <= max_date)].copy()

    # Keep the latest available record per patient in the requested window.
    recent = recent.sort_values(["patient_name", "record_date", "triage_score"])
    recent = recent.groupby("patient_name", as_index=False).tail(1)

    model = joblib.load(args.model)
    feature_columns = [col for col in NUMERIC_FEATURES + CATEGORICAL_FEATURES if col in recent.columns]
    probabilities = model.predict_proba(recent[feature_columns])[:, 1]
    predictions = model.predict(recent[feature_columns])

    scored = recent.copy()
    scored["bad_discharge_probability"] = probabilities
    scored["bad_discharge_prediction"] = predictions
    scored = scored.sort_values(
        ["bad_discharge_probability", "triage_score"],
        ascending=[False, False],
    )

    columns = [
        "record_date",
        "patient_name",
        "unit",
        "care_line",
        "news2_last",
        "news2_average_7d",
        "news2_delta_7d",
        "oxygen_saturation",
        "heart_rate",
        "acute_decompensation_flag",
        "deterioration_reversed_flag",
        "no_return_flag",
        "bad_discharge_within_10d",
        "bad_discharge_condition",
        "bad_discharge_date",
        "triage_score",
        "triage_band",
        "bad_discharge_probability",
        "bad_discharge_prediction",
        "target_label",
    ]
    scored[columns].to_csv(args.out, index=False, encoding="utf-8")

    print(f"Workbook: {workbook_path}")
    print(f"Model: {args.model}")
    print(f"Window: {start_date.date()} to {max_date.date()}")
    print(f"Recent unique patients: {len(scored)}")
    print(f"Output: {args.out}")
    print("")
    print(scored[columns].head(args.top).to_string(index=False))


if __name__ == "__main__":
    main()
