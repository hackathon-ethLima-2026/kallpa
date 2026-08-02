---
status: accepted
---

# La feature 0 es una tasa de cumplimiento, no un conteo de ciclos

`ciclos_completados` sale del vector y entra `tasa_cumplimiento`: la fracción de lo que el miembro debía haber pagado que efectivamente pagó, en punto fijo 1e6 y saturada a `[0, SCALE]`. Es la única feature que responde la pregunta más directa que un prestamista hace en voz alta: _de todo lo que te tocaba pagar, ¿cuánto pagaste?_

## Por qué salió el conteo

- **Duplicaba exactamente a `antiguedad_periodos`.** `create_junta(members[])` incorpora a todos los miembros al crear la junta, así que `joined_at == start_at` para todos y ambas features valían `min(ciclos_transcurridos, ciclos_totales)` — la misma columna, para todos los miembros, siempre. Es la misma colinealidad perfecta por la que salió el monto en el ADR-0007.
- **Premiaba el paso del tiempo, no el cumplimiento.** Derivado del reloj, un miembro que nunca pagó mostraba todos los ciclos completados.

Derivarlo de las cuotas pagadas arregla lo segundo pero **reubica** lo primero: un conteo de pagos es `pagos_puntuales + pagos_atrasados`, o sea combinación lineal de las features 1 y 2. La razón por la que una tasa sí sirve es que **un cociente no es combinación lineal** de sus términos: aporta señal que un modelo lineal no puede reconstruir, y además normaliza por antigüedad, así que un miembro nuevo impecable y uno viejo impecable puntúan igual.

## La guarda de división por cero es obligatoria

Con `ciclos_transcurridos == 0` —una junta recién creada, antes de que venza el primer periodo, que es justo el estado en que la siembra toca el contrato— la división entera **panica en Rust**. Convención: `ciclos_transcurridos == 0 ⇒ tasa_cumplimiento = SCALE`. Nadie debía nada todavía, así que el cumplimiento es total; es el mismo criterio del `max(0, …)` del ADR-0005, donde el miembro nuevo tampoco arranca en falta.

## Consecuencias

- La feature 0 cambia de tipo: `u32` → `i128` en punto fijo 1e6, con rango de dominio `(0, SCALE)`, igual que `atraso_max_periodos`.
- Queda una correlación residual: `defaults` sigue apoyándose en la antigüedad, porque es aproximadamente `antiguedad − cuotas_pagadas`. El `max(0, …)` rompe la relación exacta en todo miembro cumplidor (donde vale cero), así que es correlación y no degeneración. R3 revisa la matriz de correlación al generar el dataset.
- El número "ciclos completados" sigue existiendo para la pantalla; lo que deja de existir es como **entrada del modelo**.
