from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


NUMERIC_FEATURES = [
    "age",
    "news2_last",
    "news2_average_7d",
    "news2_delta_7d",
    "respiratory_rate",
    "oxygen_saturation",
    "oxygen_support_flag",
    "systolic_bp",
    "heart_rate",
    "consciousness_flag",
    "temperature",
    "completeness",
    "aura_alerted_flag",
    "acute_decompensation_flag",
    "triage_score",
]

CATEGORICAL_FEATURES = [
    "unit",
    "care_line",
    "triage_band",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a baseline tabular model for AURA committee triage.")
    parser.add_argument("--data", type=Path, default=Path("data/training_dataset.csv"))
    parser.add_argument("--target", default="target_readmission_event")
    parser.add_argument("--out-dir", type=Path, default=Path("models/baseline"))
    parser.add_argument("--test-size", type=float, default=0.25)
    args = parser.parse_args()

    if not args.data.exists():
        raise SystemExit(f"Dataset not found: {args.data}. Run training/build_dataset.py first.")

    df = pd.read_csv(args.data)
    if args.target not in df.columns:
        raise SystemExit(f"Target column not found: {args.target}")

    available_numeric_features = [
        feature for feature in NUMERIC_FEATURES if feature in df.columns and not df[feature].isna().all()
    ]
    available_categorical_features = [
        feature for feature in CATEGORICAL_FEATURES if feature in df.columns and not df[feature].isna().all()
    ]
    dropped_features = sorted(
        set(NUMERIC_FEATURES + CATEGORICAL_FEATURES)
        - set(available_numeric_features + available_categorical_features)
    )

    model_df = df[available_numeric_features + available_categorical_features + [args.target]].copy()
    model_df = model_df.dropna(subset=[args.target])

    class_counts = model_df[args.target].value_counts().to_dict()
    if len(class_counts) < 2:
        raise SystemExit(
            f"Target {args.target} has only one class ({class_counts}). "
            "Use --target target_effective_intervention or revise labels."
        )

    x = model_df[available_numeric_features + available_categorical_features]
    y = model_df[args.target].astype(int)

    stratify = y if min(class_counts.values()) >= 2 else None
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=args.test_size,
        random_state=42,
        stratify=stratify,
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), available_numeric_features),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                available_categorical_features,
            ),
        ]
    )

    model = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=250,
                    min_samples_leaf=4,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )

    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, 1]

    metrics = {
        "target": args.target,
        "rows": int(len(model_df)),
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "class_counts": {str(k): int(v) for k, v in class_counts.items()},
        "accuracy": float(accuracy_score(y_test, predictions)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "classification_report": classification_report(y_test, predictions, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        "numeric_features": available_numeric_features,
        "categorical_features": available_categorical_features,
        "dropped_features": dropped_features,
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, args.out_dir / "model.joblib")
    with (args.out_dir / "metrics.json").open("w", encoding="utf-8") as fh:
        json.dump(metrics, fh, ensure_ascii=False, indent=2)

    print(f"Saved model: {args.out_dir / 'model.joblib'}")
    print(f"Saved metrics: {args.out_dir / 'metrics.json'}")
    print(json.dumps({k: metrics[k] for k in ("target", "rows", "accuracy", "roc_auc", "class_counts")}, indent=2))


if __name__ == "__main__":
    main()
