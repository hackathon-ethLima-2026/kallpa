---
status: accepted
---

# Las features no llevan unidades físicas, y la normalización es min-max con clamp on-chain

El atraso deja de medirse en días y pasa a medirse en **periodos fraccionarios** (`atraso_max_periodos`, punto fijo escala 1e6, tipo `i128`, reemplazando a `dias_atraso_max: u32`). Todas las features entran al producto punto normalizadas **min-max a [0,1] con saturación**, usando rangos que son topes de dominio declarados como constantes.

## Por qué adimensional

Con `periodo = 60s` (ADR-0005) cualquier atraso real de la demo dura segundos, así que una columna entrenada en 0–90 días llegaría siempre en cero: el modelo no falla ruidosamente, devuelve scores plausibles y equivocados. Medido en periodos, "medio periodo tarde" significa lo mismo con ciclos de un minuto que de un mes, y la demo cae dentro del rango entrenado.

**Fraccionario y no entero**: con enteros, quien paga a mitad de ciclo marca 0 y es indistinguible de un puntual; en una junta real, cinco días tarde sobre treinta también da 0. El redondeo a enteros tira casi toda la señal de la feature salvo la de quien se pasa un periodo completo.

## Por qué min-max y no estandarización

Por el **clamp**. Min-max tiene un borde natural donde saturar; la estandarización no, y una entrada fuera de distribución propaga un valor enorme por el producto punto y devuelve un score arbitrario con cara de válido.

El clamp **corre on-chain, en el `ScoreEngine`, antes del producto punto**. No es un paso de entrenamiento sino la barrera de seguridad de la inferencia: si solo vive en Python, la cadena queda expuesta.

## Por qué un solo artefacto

`quantize.py` emite los pesos **y** los rangos `(min, max)` en el mismo archivo (`weights_fixed.rs.txt`), y R2 pega un solo bloque. No es cosmético: la regresión se entrena sobre features ya normalizadas, así que pesos y rangos son un conjunto casado — un rango que no corresponde no "desafina" el modelo, lo invalida.

Los rangos son **topes de dominio** ("capamos el atraso en 3 periodos porque más allá ya eres un default"), no el mínimo y máximo observados en la muestra: reproducibles, robustos a outliers y defendibles ante el jurado. Un rango data-driven cambia cada vez que se regenera el dataset.

## Consecuencias

- `atraso_max_periodos` se escribe eager al depositar, como running-max, y captura únicamente atraso **resuelto** (lo que se pagó tarde). Lo vencido e impago lo lleva el `defaults` derivado del ADR-0005: son complementarios y no hay doble conteo.
- La normalización introduce una división en punto fijo, que es un lugar nuevo donde el espejo de Python y el Rust pueden diferir por uno o dos puntos. **La regla de redondeo queda lockeada e idéntica en ambos lados**, o el test de equivalencia (T7) falla por una causa que nadie va a adivinar.
- En las dos juntas sembradas esta feature queda ≈ 0 (la buena es puntual, la mala no paga y cae en default). Si se quiere mostrarla trabajando, hay que sembrar un miembro que pague ~0.5 periodos tarde y saque un score intermedio; si no, es trabajo fino invisible en pantalla.
- El clamp aplana los extremos: diez y veinte periodos de atraso puntúan igual. Para la decisión de prestar, ambos son "no".
