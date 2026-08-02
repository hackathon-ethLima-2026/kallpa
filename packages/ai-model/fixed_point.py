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

# Sigmoide muestreada cada medio punto entre -6 y 6, en punto fijo.
#
# Se aproxima por tramos rectos en vez de calcularla de verdad porque una exponencial no
# existe en aritmética entera, y aproximarla dentro del contrato costaría gas y precisión.
#
# El paso es de medio punto y no de uno entero por una razón medible: interpolando en
# intervalos de una unidad, el score en cadena llegaba a apartarse doce puntos del modelo
# entrenado, justo en la zona donde la curva más se dobla. Al partir el paso a la mitad ese
# error cae a un tercio, y el precio son doce constantes más y ninguna diferencia de gas
# apreciable. Importa porque la afirmación del proyecto es que el score es reproducible: un
# desvío de doce puntos sobre mil es un flanco innecesario.
#
# Fuera del intervalo la sigmoide ya está a menos de tres milésimas de sus extremos, así que
# satura sin pérdida apreciable.
SIGMOIDE = [
    2473, 4070, 6693, 10987, 17986, 29312, 47426, 75858, 119203, 182426, 268941,
    377541, 500000, 622459, 731059, 817574, 880797, 924142, 952574, 970688, 982014,
    989013, 993307, 995930, 997527,
]
PASO = SCALE // 2  # separación entre dos puntos consecutivos de la tabla
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


def sigmoide(z):
    """Sigmoide por tramos rectos. `z` y el resultado están en punto fijo."""
    if z <= Z_MIN * SCALE:
        return SIGMOIDE[0]
    if z >= Z_MAX * SCALE:
        return SIGMOIDE[-1]

    desplazado = z - Z_MIN * SCALE  # siempre >= 0, así que no hay ambigüedad de signo
    indice = desplazado // PASO
    fraccion = desplazado - indice * PASO
    izquierda = SIGMOIDE[indice]
    derecha = SIGMOIDE[indice + 1]
    return izquierda + div_rust((derecha - izquierda) * fraccion, PASO)


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
    p_incumplir = sigmoide(z)
    return div_rust((SCALE - p_incumplir) * 1000, SCALE)
