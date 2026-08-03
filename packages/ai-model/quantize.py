"""Convierte el modelo entrenado en constantes listas para pegar en el contrato.

Emite **un solo archivo**, `weights_fixed.rs.txt`, con los pesos y los rangos juntos. Que
vayan juntos no es comodidad: el modelo se entrenó sobre features ya normalizadas con esos
rangos, así que pesos y rangos son un conjunto casado. Un rango que no corresponde no
"desafina" el modelo — lo invalida, y en silencio.

También compara el modelo original en punto flotante contra su versión entera, para saber
cuánto se pierde al cuantizar antes de que ese error aparezca en la cadena.

Uso:  python quantize.py
"""

import csv
import json
from pathlib import Path

from eth_hash.auto import keccak

from features import MAXIMOS, MINIMOS, NOMBRES
from fixed_point import SCALE, Z_MAX, Z_MIN, calcular_score

AQUI = Path(__file__).parent
PESOS_JSON = AQUI / "weights.json"
DATASET = AQUI / "dataset.csv"
SALIDA = AQUI / "weights_fixed.rs.txt"


def cuantizar(valor):
    """Lleva un número real a punto fijo, redondeando al entero más cercano."""
    return int(round(valor * SCALE))


def score_en_flotante(features, pesos, sesgo):
    """El score tal como lo daría el modelo original, sin cuantizar.

    Usa la misma escala de log-odds que el contrato, así que la diferencia entre ambos mide
    únicamente lo que se pierde al pasar los pesos a enteros — que es justo lo que interesa
    saber antes de que ese error aparezca en la cadena.
    """
    z = sesgo
    for valor, peso, lo, hi in zip(features, pesos, MINIMOS, MAXIMOS):
        x = 0.0 if hi <= lo else (valor - lo) / (hi - lo)
        z += peso * min(1.0, max(0.0, x))
    ancho = Z_MAX - Z_MIN
    score = (Z_MAX - z) * 1000 / ancho
    return int(max(0, min(1000, score)))


def main():
    modelo = json.loads(PESOS_JSON.read_text(encoding="utf-8"))
    pesos = modelo["pesos"]
    sesgo = modelo["sesgo"]

    pesos_fijos = [cuantizar(w) for w in pesos]
    sesgo_fijo = cuantizar(sesgo)

    # La huella del modelo: cambia si cambia cualquier peso, sesgo o rango. El contrato la
    # lleva como constante y la incluye en cada attestation, de modo que una credencial
    # emitida diga con qué modelo exacto se calculó.
    material = json.dumps(
        {
            "pesos": pesos_fijos,
            "sesgo": sesgo_fijo,
            "min": MINIMOS,
            "max": MAXIMOS,
            "z_min": Z_MIN,
            "z_max": Z_MAX,
            "escala": SCALE,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    model_hash = "0x" + keccak(material).hex()

    # Cuánto se pierde al pasar a enteros, medido sobre el dataset completo.
    with DATASET.open(encoding="utf-8") as f:
        filas = [[int(r[n]) for n in NOMBRES] for r in csv.DictReader(f)]
    diferencias = [
        abs(
            calcular_score(fila, pesos_fijos, MINIMOS, MAXIMOS, sesgo_fijo)
            - score_en_flotante(fila, pesos, sesgo)
        )
        for fila in filas
    ]
    peor = max(diferencias)
    promedio = sum(diferencias) / len(diferencias)

    print(f"AUC del modelo: {modelo['auc']:.3f}")
    print(f"modelHash: {model_hash}")
    print(
        f"pérdida por cuantización sobre {len(filas)} vectores: "
        f"máxima {peor} puntos, media {promedio:.2f}"
    )
    if peor > 5:
        print("  AVISO: supera la tolerancia de ±5 puntos del test de equivalencia.")

    lineas = [
        "// GENERADO POR quantize.py — NO EDITAR A MANO.",
        "//",
        "// Pesos y rangos del modelo de crédito, en punto fijo con escala 1e6.",
        "// Son un conjunto casado: el modelo se entrenó sobre features normalizadas con",
        "// exactamente estos rangos, así que cambiar uno sin regenerar el otro produce un",
        "// score equivocado sin ningún síntoma visible.",
        "//",
        f"// AUC: {modelo['auc']:.3f}   ·   semilla del dataset: {modelo['semilla']}",
        f"// Pérdida por cuantización: máx {peor} pts, media {promedio:.2f} pts",
        "",
        f"/// Escala del punto fijo: un valor real `v` se representa como `v * {SCALE}`.",
        f"pub const SCALE: i128 = {SCALE};",
        "",
        "/// Huella del modelo. Viaja en cada attestation para que se pueda saber con qué",
        "/// modelo exacto se calculó un score.",
        f'pub const MODEL_HASH: &str = "{model_hash}";',
        "",
        "/// Peso de cada señal, en el orden del §6.1.",
        "pub const PESOS: [i128; 8] = [",
    ]
    for nombre, w, wf in zip(NOMBRES, pesos, pesos_fijos):
        signo = "más riesgo" if w > 0 else "menos riesgo"
        lineas.append(f"    {wf},".ljust(20) + f"// {nombre}: {w:+.4f} ({signo})")
    lineas += [
        "];",
        "",
        f"/// Sesgo del modelo ({sesgo:+.4f}).",
        f"pub const SESGO: i128 = {sesgo_fijo};",
        "",
        "/// Tope inferior de dominio de cada señal.",
        "pub const MINIMOS: [i128; 8] = [" + ", ".join(str(v) for v in MINIMOS) + "];",
        "",
        "/// Tope superior de dominio de cada señal. NO es el máximo observado en la",
        "/// muestra: es un tope de dominio, para que regenerar el dataset no cambie la",
        "/// normalización y con ella el significado de los pesos.",
        "pub const MAXIMOS: [i128; 8] = [" + ", ".join(str(v) for v in MAXIMOS) + "];",
        "",
        "/// Rango de log-odds sobre el que se reparte la escala del score. Fuera de",
        "/// estos límites el modelo ya está tan seguro que la diferencia deja de",
        "/// importar para decidir un crédito, así que el score satura.",
        "pub const Z_MIN: i128 = -6;",
        "pub const Z_MAX: i128 = 6;",
        "",
    ]
    SALIDA.write_text("\n".join(lineas), encoding="utf-8")
    print(f"\nconstantes escritas en {SALIDA.name} (listas para pegar en score_engine)")


if __name__ == "__main__":
    main()
