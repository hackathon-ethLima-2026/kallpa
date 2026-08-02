"""Genera el dataset sintético con el que se entrena el modelo de crédito.

**No se usó ningún dato real de personas.** Todo lo que sale de aquí es simulado, y el
proceso completo es reproducible con la semilla fija de abajo.

La simulación no inventa las ocho columnas de forma independiente: recrea el ciclo de vida
de un miembro dentro de una junta y deja que las señales *emerjan* de ahí. Esa diferencia
importa. Si se generaran columnas sueltas con correlaciones puestas a mano, el modelo
aprendería relaciones que el contrato jamás va a producir —por ejemplo, alguien con más
cuotas pagadas que ciclos vencidos, que es imposible— y el score entrenado no se parecería
al score servido.

El comportamiento de cada miembro lo gobierna una sola variable latente, su *fiabilidad*,
que nunca se observa. Las ocho features son las huellas que esa fiabilidad deja en la
cadena, y la etiqueta es si el miembro termina incumpliendo. Eso es justamente lo que el
modelo tiene que aprender a inferir.

Uso:  python generate_dataset.py
"""

import csv
import math
import random
from pathlib import Path

from features import NOMBRES, SCALE

SEMILLA = 20260802
# Más filas de las que pedía el plan original. No cuesta nada y reduce la varianza del
# ajuste: con mil filas y un 13% de incumplimiento quedaban apenas un centenar de casos
# positivos para entrenar, y el modelo dependía demasiado de cuáles cayeran en la partición.
N_MIEMBROS = 5000
TAMANO_JUNTA = 8

SALIDA = Path(__file__).parent / "dataset.csv"


def simular_miembro(rng):
    """Simula la vida de un miembro en una junta y devuelve `(features, incumplio)`."""

    # La fiabilidad es la variable latente: la propensión a cumplir. No se observa nunca;
    # el modelo tiene que deducirla de las huellas.
    fiabilidad = rng.betavariate(5, 2)

    # Cuántos ciclos han vencido para este miembro. Se inclina hacia juntas ya avanzadas
    # porque es el caso que importa: de alguien con un solo ciclo de historia no hay nada
    # que inferir, y llenar la muestra de esos casos solo agrega ruido irreducible.
    ciclos = rng.choices(
        range(TAMANO_JUNTA + 1),
        weights=[1, 2, 4, 7, 10, 12, 13, 14, 14],
    )[0]
    turno = rng.randrange(TAMANO_JUNTA)  # en qué posición le toca cobrar
    ya_cobro = turno < ciclos

    # Quien ya se llevó el pozo pierde el incentivo de seguir aportando: ese es el riesgo
    # propio de una junta y la razón por la que la mora posterior al cobro se mide aparte
    # de la mora a secas (ADR-0007).
    #
    # La caída no es igual para todos, y eso importa más de lo que parece. Una penalización
    # fija para todo el que cobra hace que la señal se invierta: a igualdad de
    # incumplimientos totales, quien los acumula *después* de cobrar resulta ser el más
    # fiable de base, y el modelo aprende que la mora post-cobro protege. Distinguir a la
    # minoría oportunista —la que toma el pozo y desaparece— es lo que le devuelve a esa
    # columna el sentido que tiene en la vida real.
    es_oportunista = rng.random() < 0.25
    caida_tras_cobro = (0.85 if es_oportunista else 0.05) if ya_cobro else 0.0

    puntuales = 0
    atrasados = 0
    pagadas = 0
    defaults_al_cobrar = None
    peor_atraso = 0.0

    for ciclo in range(ciclos):
        if defaults_al_cobrar is None and ciclo == turno:
            defaults_al_cobrar = ciclo - pagadas

        efectiva = fiabilidad
        if ya_cobro and ciclo >= turno:
            efectiva = max(0.0, fiabilidad - caida_tras_cobro)

        sorteo = rng.random()
        if sorteo < efectiva:
            puntuales += 1
            pagadas += 1
        elif sorteo < efectiva + (1 - efectiva) * 0.45:
            # Paga, pero tarde. Cuanto menos fiable, más se demora.
            atrasados += 1
            pagadas += 1
            atraso = rng.uniform(0.05, 3.0) * (1.2 - fiabilidad)
            peor_atraso = max(peor_atraso, min(atraso, 3.0))
        # else: no paga en ese ciclo, y queda como cuota vencida

    if defaults_al_cobrar is None:
        defaults_al_cobrar = 0

    defaults = max(0, ciclos - pagadas)
    defaults_tras_cobro = max(0, defaults - defaults_al_cobrar) if ya_cobro else 0

    tasa = SCALE if ciclos == 0 else min(SCALE, int(pagadas * SCALE / ciclos))

    # Las disputas son raras y se concentran en los menos fiables.
    disputas = 0
    if rng.random() < (1 - fiabilidad) * 0.25:
        disputas = rng.randint(1, 3)

    # La etiqueta: ¿incumple de aquí en adelante? La gobierna la misma fiabilidad latente
    # que produjo las huellas, más el incentivo que se pierde al haber cobrado ya el pozo y
    # el antecedente de las disputas.
    #
    # Se usa un enlace logístico y no una probabilidad lineal por una razón que se paga
    # después: con una lineal, la mitad de la etiqueta termina siendo una moneda al aire y
    # ningún modelo —ni el nuestro ni uno perfecto— puede superar ese techo. El ruido
    # irreducible se mantiene, pero sin ahogar la señal.
    # Los coeficientes están calibrados para dos cosas a la vez: una tasa global de
    # incumplimiento cercana al 12%, y un techo de predictibilidad razonable. El techo se
    # midió aparte: con estos valores, un oráculo que conociera la fiabilidad latente
    # alcanza un AUC de 0.91, así que el margen entre lo que logra el modelo y ese número
    # dice cuánta señal pierden las ocho columnas por el camino.
    riesgo = 13.0 * (1 - fiabilidad) + 6.0 * caida_tras_cobro + 0.35 * disputas
    p_incumplir = 1 / (1 + math.exp(-(riesgo - 8.4)))
    incumplio = 1 if rng.random() < p_incumplir else 0

    features = [
        tasa,
        puntuales,
        atrasados,
        defaults,
        int(peor_atraso * SCALE),
        defaults_tras_cobro,
        ciclos,  # antigüedad: todos entran al crear la junta
        disputas,
    ]
    return features, incumplio


def main():
    rng = random.Random(SEMILLA)
    filas = []
    for _ in range(N_MIEMBROS):
        features, etiqueta = simular_miembro(rng)
        filas.append(features + [etiqueta])

    with SALIDA.open("w", newline="", encoding="utf-8") as f:
        escritor = csv.writer(f)
        escritor.writerow(NOMBRES + ["incumplio"])
        escritor.writerows(filas)

    incumplen = sum(r[-1] for r in filas)
    print(f"{len(filas)} miembros simulados -> {SALIDA.name}")
    print(f"tasa de incumplimiento: {incumplen / len(filas):.1%}")
    print(f"semilla: {SEMILLA} (reproducible)")


if __name__ == "__main__":
    main()
