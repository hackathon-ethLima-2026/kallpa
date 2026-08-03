"""El mismo cálculo del score que corre dentro del contrato, reimplementado en Python.

Este archivo existe para una sola cosa: poder afirmar que el score es verificable. Si esta
reimplementación y el contrato coinciden sobre un conjunto de vectores, entonces cualquiera
puede reproducir fuera de la cadena lo que la cadena computó, y el "lo calculó Arbitrum"
deja de ser una promesa.

Todo es aritmética entera. **No se usa punto flotante en ninguna parte**, porque el punto
flotante no es reproducible bit a bit entre plataformas y la comparación perdería sentido.

Hay un detalle que parece menor y no lo es: la división entera de Rust **trunca hacia cero**
(`-7 / 2 == -3`) mientras que la de Python **redondea hacia abajo** (`-7 // 2 == -4`). Sobre
un producto punto que puede ser negativo, esa diferencia mueve el score, y el fallo no se
parece en nada a su causa. Por eso todas las divisiones de este archivo pasan por `div_rust`.
"""

SCALE = 1_000_000

# Rango de log-odds sobre el que se reparte la escala del score.
#
# Fuera de estos límites el modelo ya está tan seguro que la diferencia deja de importar
# para decidir un crédito, así que el score satura.
Z_MIN = -6
Z_MAX = 6


def div_rust(numerador, denominador):
    """División entera con la semántica de Rust: trunca hacia cero.

    Se fuerzan los operandos a entero a propósito. Que aquí entre un flotante sería un
    error silencioso: el resultado dejaría de ser reproducible y la comparación contra el
    contrato perdería todo su valor, que es precisamente lo que este módulo existe para
    sostener.
    """
    numerador = int(numerador)
    denominador = int(denominador)
    q = abs(numerador) // abs(denominador)
    return -q if (numerador < 0) != (denominador < 0) else q


def normalizar(valor, minimo, maximo):
    """Lleva una feature a `[0, SCALE]` con min-max y saturación.

    La saturación es la barrera contra entradas fuera de rango: un valor absurdo se queda
    en el borde en lugar de propagarse multiplicado por su peso.
    """
    if maximo <= minimo:
        return 0
    x = div_rust((int(valor) - minimo) * SCALE, maximo - minimo)
    return max(0, min(SCALE, x))


def puntuar(z):
    """Convierte log-odds en un score de 0 a 1000.

    La relación es lineal: cada unidad de log-odds vale siempre la misma cantidad de
    puntos. Es la convención de las tarjetas de puntaje crediticio de toda la vida, y se
    eligió sobre el complemento de la probabilidad por una razón medible.

    Con el complemento de la probabilidad, el 85% de la población caía en el tramo superior
    y los tramos intermedios quedaban vacíos: el score estaba bien calibrado como
    estimación de riesgo, pero como instrumento de crédito era prácticamente binario. En
    escala de log-odds ese mismo conjunto se reparte con una mediana de 804 y un tercio de
    la gente en los tramos del medio.

    Además elimina la sigmoide del cálculo, que era la única aproximación que quedaba: aquí
    no hay curva que muestrear, así que tampoco hay error que acotar.
    """
    ancho = (Z_MAX - Z_MIN) * SCALE
    score = div_rust((Z_MAX * SCALE - z) * 1000, ancho)
    return max(0, min(1000, score))


def calcular_score(features, pesos, minimos, maximos, sesgo):
    """Devuelve el score 0–1000 de un vector de features crudas.

    Un score alto significa buen comportamiento. El modelo predice la probabilidad de
    incumplir, así que el score es su complemento: cuanto menos probable es que falles, más
    alto puntúas.
    """
    acumulado = 0
    for valor, peso, lo, hi in zip(features, pesos, minimos, maximos):
        acumulado += peso * normalizar(valor, lo, hi)

    z = div_rust(acumulado, SCALE) + sesgo
    return puntuar(z)
