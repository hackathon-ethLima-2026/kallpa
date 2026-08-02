"""Definición compartida del vector de features.

Este archivo es el espejo en Python del §6.1 del build spec y del `struct Features` del
contrato. Si el orden, los tipos o los rangos cambian en un lado y no en el otro, el score
sale mal y nadie sabrá por qué: el entrenamiento y la inferencia estarían mirando columnas
distintas con el mismo nombre.

Los rangos son **topes de dominio**, no el mínimo y el máximo observados en la muestra. Esa
distinción importa: un rango tomado de los datos cambia cada vez que se regenera el dataset,
y con él se invalidan los pesos, que se entrenaron sobre features ya normalizadas.
"""

SCALE = 1_000_000
"""Escala del punto fijo. Un valor real `v` se representa como `v * SCALE`."""

# (nombre, min, max) en el orden exacto del §6.1. El orden ES la interfaz.
FEATURES = [
    ("tasa_cumplimiento", 0, SCALE),
    ("pagos_puntuales", 0, 12),
    ("pagos_atrasados", 0, 12),
    ("defaults", 0, 12),
    ("atraso_max_periodos", 0, 3 * SCALE),
    ("defaults_tras_cobro", 0, 12),
    ("antiguedad_periodos", 0, 12),
    ("disputas_perdidas", 0, 5),
]

NOMBRES = [n for n, _, _ in FEATURES]
MINIMOS = [lo for _, lo, _ in FEATURES]
MAXIMOS = [hi for _, _, hi in FEATURES]

UMBRAL_POSITIVO = 400
"""Score a partir del cual la reputación es positiva.

Es el mismo corte con el que el Pool concede su primer tramo de crédito (ADR-0010): un solo
número gobierna "¿le prestamos?" y "¿su reputación es positiva?", de modo que no puede
existir un miembro con reputación positiva al que el Pool le niegue el préstamo.
"""


def normalizar(fila):
    """Lleva cada feature a [0,1] con min-max y saturación.

    Es exactamente lo que hace el contrato antes del producto punto. La saturación no es un
    detalle de limpieza: es la barrera que impide que un valor absurdo —cuarenta atrasos, o
    el resultado de un error— se propague multiplicado por su peso y devuelva un score
    arbitrario con cara de válido.
    """
    salida = []
    for valor, (_, lo, hi) in zip(fila, FEATURES):
        if hi == lo:
            salida.append(0.0)
            continue
        x = (valor - lo) / (hi - lo)
        salida.append(min(1.0, max(0.0, x)))
    return salida
