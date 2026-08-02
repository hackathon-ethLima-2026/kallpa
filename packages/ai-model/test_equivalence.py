"""Comprueba que el score del contrato se puede reproducir fuera de la cadena.

Es la prueba que sostiene la afirmación central del proyecto. Si alguien tiene que creernos
que un número salió del contrato, no hay nada verificable; si puede recalcularlo por su
cuenta y le da exactamente igual, la afirmación se sostiene sola.

Lee `rust_scores.csv`, que produce la suite de pruebas del contrato, y recalcula cada score
con el espejo en Python. La tolerancia declarada en el diseño es de ±5 puntos, pero la
expectativa real es **cero**: ambos lados corren la misma aritmética entera sobre las mismas
constantes, así que cualquier diferencia significa que algo se desincronizó.

Uso:
    cd packages/stylus/contracts/score_engine && cargo test --lib   # genera el CSV
    cd packages/ai-model && python test_equivalence.py
"""

import csv
import json
import sys
from pathlib import Path

from features import MAXIMOS, MINIMOS, NOMBRES, SCALE
from fixed_point import calcular_score

AQUI = Path(__file__).parent
SCORES_RUST = AQUI / "rust_scores.csv"
PESOS = AQUI / "weights.json"
TOLERANCIA = 5


def main():
    if not SCORES_RUST.exists():
        print(f"No se encontró {SCORES_RUST.name}.")
        print("Genéralo primero con:  cargo test --lib   (en contracts/score_engine)")
        return 1

    modelo = json.loads(PESOS.read_text(encoding="utf-8"))
    pesos = [int(round(w * SCALE)) for w in modelo["pesos"]]
    sesgo = int(round(modelo["sesgo"] * SCALE))

    with SCORES_RUST.open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))

    fallos = []
    peor = 0
    for i, fila in enumerate(filas):
        features = [int(fila[n]) for n in NOMBRES]
        esperado = int(fila["score"])
        obtenido = calcular_score(features, pesos, MINIMOS, MAXIMOS, sesgo)
        diferencia = abs(obtenido - esperado)
        peor = max(peor, diferencia)
        if diferencia > TOLERANCIA:
            fallos.append((i, features, esperado, obtenido, diferencia))

    print(f"{len(filas)} vectores comparados entre el contrato y el espejo en Python")
    print(f"diferencia máxima: {peor} puntos   (tolerancia: {TOLERANCIA})")

    if fallos:
        print(f"\n{len(fallos)} vectores fuera de tolerancia:")
        for i, features, esperado, obtenido, d in fallos[:10]:
            print(f"  fila {i}: contrato={esperado} python={obtenido} (Δ{d})")
            print(f"           {features}")
        print(
            "\nLa causa más probable es que las constantes del contrato y weights.json "
            "dejaron de corresponder: regenera weights_fixed.rs.txt con quantize.py y "
            "cópialo a score_engine/src/weights.rs."
        )
        return 1

    if peor == 0:
        print("\nCoincidencia exacta. El score es reproducible fuera de la cadena.")
    else:
        print(
            f"\nDentro de tolerancia, pero no exacto. Ambos lados deberían dar el mismo "
            f"número: una diferencia de {peor} puntos apunta a que alguna división redondea "
            f"distinto en un lado y en el otro."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
