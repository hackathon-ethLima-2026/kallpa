---
status: accepted
---

# Sin historial mínimo no hay crédito, por alto que sea el score

La reputación es positiva cuando el score alcanza el umbral **y** el miembro acumula al menos
tres ciclos vencidos en la junta. Sin esa segunda condición, `is_positive` devuelve falso por
mucho que el modelo puntúe alto.

## Por qué hace falta

El modelo estima la probabilidad de incumplir a partir de ocho señales de comportamiento.
Cuando no hay comportamiento que observar, todas esas señales valen cero o su valor neutro
—incluida la tasa de cumplimiento, que por convención vale el máximo cuando todavía no venció
ningún ciclo (ADR-0009)— y el resultado es un score altísimo: **878 sobre 1000 para alguien
que acaba de entrar a una junta**. Con los tramos vigentes, eso significa prestarle el monto
máximo a un completo desconocido.

El modelo no está equivocado: literalmente no hay evidencia en contra. El error sería tratar
"no sé" como "excelente". Un modelo lineal no tiene forma de expresar incertidumbre, así que
la distinción tiene que vivir fuera de él.

## Por qué la regla va aparte del score y no dentro

Se consideró castigar la falta de historial dentro del propio modelo —bajando el score de
quien tiene pocos ciclos— y se descartó por dos motivos. Contamina el score con una decisión
comercial, y lo vuelve imposible de reproducir para quien quiera verificarlo sin conocer
también la política de crédito vigente. `compute_score` sigue devolviendo lo que el modelo
estima; la política se aplica encima, se lee sola y se ajusta sin volver a entrenar nada.

Es además lo que hace cualquier prestamista real ante un expediente sin historial: no le
asigna un buen riesgo, le pide antecedentes.

## Consecuencias

- Un miembro nuevo ve su score en la interfaz, pero el Pool no le presta hasta el tercer
  ciclo. Conviene que la pantalla lo diga con esas palabras y no como un rechazo.
- El umbral de tres ciclos es una perilla del daily, igual que los tramos.
- La demo tiene que sembrar la junta protagonista con historial suficiente, cosa que ya hace:
  se corre completa antes de mostrarse.
