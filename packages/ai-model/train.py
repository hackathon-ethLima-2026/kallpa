"""Entrena el modelo de crédito y guarda sus pesos.

Es una regresión logística sobre las ocho señales del §6.1, ya normalizadas con los topes de
dominio. La elección no es por potencia sino por portabilidad: una regresión logística se
reduce a un producto punto más una sigmoide, y eso se puede reproducir exactamente en
aritmética de punto fijo dentro de un contrato. Un modelo más expresivo daría un AUC algo
mejor y sería imposible de verificar en cadena, que es justamente lo que hace interesante a
este proyecto.

Se entrena sobre las features **ya normalizadas** porque el contrato normaliza antes del
producto punto. Pesos y rangos son un conjunto casado: un rango que no corresponde no
"desafina" el modelo, lo invalida.

Uso:  python train.py
"""

import csv
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, confusion_matrix
from sklearn.model_selection import train_test_split

from features import FEATURES, NOMBRES, normalizar

AQUI = Path(__file__).parent
DATASET = AQUI / "dataset.csv"
PESOS = AQUI / "weights.json"
SEMILLA = 20260802


def cargar():
    with DATASET.open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    X = np.array([normalizar([float(r[n]) for n in NOMBRES]) for r in filas])
    y = np.array([int(r["incumplio"]) for r in filas])
    return X, y


def main():
    X, y = cargar()
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=SEMILLA, stratify=y
    )

    modelo = LogisticRegression(max_iter=2000, C=1.0)
    modelo.fit(X_tr, y_tr)

    p_te = modelo.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, p_te)

    print(f"AUC en el conjunto de prueba: {auc:.3f}   (meta: >= 0.80)")
    if auc < 0.80:
        print(
            "  AVISO: por debajo de la meta. Revisar el generador antes de cuantizar."
        )

    print("\nMatriz de confusión con umbral 0.5 (filas: real, columnas: predicho):")
    print(confusion_matrix(y_te, (p_te >= 0.5).astype(int)))

    print("\nPeso de cada señal (sobre features normalizadas a [0,1]):")
    for nombre, w in sorted(zip(NOMBRES, modelo.coef_[0]), key=lambda t: -abs(t[1])):
        direccion = "más riesgo" if w > 0 else "menos riesgo"
        print(f"  {nombre:>22}  {w:+.3f}   ({direccion})")
    print(f"  {'sesgo':>22}  {modelo.intercept_[0]:+.3f}")

    salida = {
        "features": [{"nombre": n, "min": lo, "max": hi} for n, lo, hi in FEATURES],
        "pesos": modelo.coef_[0].tolist(),
        "sesgo": float(modelo.intercept_[0]),
        "auc": float(auc),
        "semilla": SEMILLA,
        "nota": (
            "Los pesos aplican a features normalizadas min-max con los topes de dominio "
            "de esta misma lista. Cambiar un rango invalida los pesos."
        ),
    }
    PESOS.write_text(json.dumps(salida, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\npesos guardados en {PESOS.name}")


if __name__ == "__main__":
    main()
