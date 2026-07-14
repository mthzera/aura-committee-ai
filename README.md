# AURA Committee AI

MVP para apoiar a reunião do comitê AURA com triagem de pacientes, dataset supervisionado e baselines tabulares auditáveis.

## Fluxo atual

1. A interface recebe a planilha Patient Watcher em `.xlsx`.
2. A rota `/api/analyze` lê a aba `Pct Watcher` ou `Registros`.
3. O motor calcula score clínico com NEWS2 atual, basal de 7 dias, delta, sinais vitais, alerta AURA e campos de intervenção.
4. A análise gera uma fila de priorização e uma tabela `trainingRows`.
5. Os scripts em `training/` geram CSV e treinam modelos baseline.

## Rodar a aplicação

```bash
npm install
npm run dev -- --port 3001
```

Abra `http://localhost:3001`.

## Gerar dataset de treino

O script procura automaticamente uma planilha `.xlsx` na pasta da aplicação ou na pasta pai.

```bash
npm run dataset
```

Saída padrão:

```text
data/training_dataset.csv
```

Também é possível passar um arquivo explicitamente:

```bash
python training/build_dataset.py "C:\caminho\arquivo.xlsx" --out data/training_dataset.csv
```

## Treinar baselines

Instale dependências Python, se necessário:

```bash
pip install -r training/requirements.txt
```

Modelo para evento de reinternação:

```bash
python training/train_baseline.py --out-dir models/baseline_readmission
```

Modelo para intervenção efetiva:

```bash
python training/train_baseline.py --target target_effective_intervention --out-dir models/baseline_effective_intervention
```

Cada treino salva:

```text
models/<nome>/model.joblib
models/<nome>/metrics.json
```

## Importante

Os rótulos atuais são heurísticos. Eles servem para começar o ciclo de IA, mas precisam ser revisados com a equipe clínica antes de qualquer decisão assistencial real.

O modelo de reinternação tende a ficar desbalanceado porque há poucos exemplos positivos. O alvo `target_effective_intervention` é mais estável para o primeiro baseline.
