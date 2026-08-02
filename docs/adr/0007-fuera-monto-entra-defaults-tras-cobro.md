---
status: accepted
---

# `monto_total_aportado` sale del vector; entra `defaults_tras_cobro`

La quinta señal del historial deja de ser el monto acumulado y pasa a ser la mora que el miembro acumula **después** de haber cobrado su turno: `defaults_tras_cobro = max(0, defaults_actual − defaults_al_cobrar)`, con `defaults_al_cobrar` guardado como snapshot O(1) en el momento de distribuir el pozo.

## Por qué sale el monto

- **Es redundante dentro de una junta.** La cuota es fija, así que `monto = cuota × (puntuales + atrasados)`: una combinación lineal exacta de otras dos señales. Para un modelo que puntúa dentro de una junta (ADR-0001), el coeficiente ni siquiera es identificable. Gastaba una de ocho columnas en una copia escalada de dos que ya existían.
- **Lo único que aporta entre juntas es un proxy de riqueza.** El tamaño de la cuota entrando como predictor significa que el modelo aprende que el miembro de la junta con cuotas grandes es mejor sujeto de crédito. Eso contradice la tesis del proyecto —puntuar comportamiento y no dinero, para ver al buen pagador que el banco no ve— y lo hace justo en el escenario, cuando el jurado pregunte qué mira el modelo. Que además desaparezca un `U256` del camino caliente es bonus, no la razón.

## Por qué la definición es conductual y no estructural

La versión intuitiva —"cuotas que le faltan por pagar después de cobrar"— codifica la **posición del turno**: quien cobra temprano debe más después por diseño del sorteo, no por conducta. Sería el mismo defecto que se está eliminando, disfrazado.

Y la versión sin snapshot colapsa: si se define como "los defaults que caen después del ciclo de cobro", el offset se cancela algebraicamente y queda `min(transcurridos, N) − pagadas`, que es `defaults`. Sería gastar una columna en una copia de otra. El snapshot en `distribute` es lo que la vuelve independiente.

El nombre es `defaults_tras_cobro` y no `cuotas_pendientes_tras_cobro` justamente porque el segundo nombre invita a la implementación estructural equivocada.

## Por qué aporta señal ortogonal

Dos miembros con `defaults = 2`: uno se atrasó **antes** de cobrar (pagador lento que todavía no tocó el pozo, riesgo bajo), el otro **después** (tomó el pozo y paró, riesgo alto). `defaults` no los distingue; `defaults_tras_cobro` sí, y es exactamente lo que un prestamista quiere saber. Es el riesgo canónico del pandero.

## Consecuencias

- El vector sigue en ocho columnas: no cascadea a la forma del modelo.
- R3 regenera el dataset: la correlación de esta columna con la etiqueta es fuerte, y hay que sintetizarla explícitamente. Decidido el domingo cuesta cero; decidido el miércoles reescribe T3, T5 y T7 con el modelo ya entrenado.
- `distribute` gana una escritura O(1) (el snapshot).
- Mejora el caso negativo de la demo: el miembro de la junta "mala" pasa a ser uno que cobró el pozo en la ronda 2 y dejó de pagar. "El modelo aísla cuatro impagos posteriores al cobro y suspende el crédito" se entiende sin saber nada de ML, y es la traición clásica del pandero.
