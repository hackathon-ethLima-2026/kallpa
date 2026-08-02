---
status: accepted
---

# Los defaults se derivan del reloj; solo el comportamiento positivo se escribe

Las señales de comportamiento se parten en dos según quién tiene incentivo de mandar la transacción. **Puntualidad y atraso se escriben al depositar**: el actor es quien paga, que ya está firmando una transacción y está motivado. **Los defaults no se escriben nunca**: se derivan al leer, a partir del tiempo transcurrido contra las cuotas efectivamente pagadas.

```
ciclos_transcurridos = min((block.timestamp − start_at) / periodo, ciclos_totales)
defaults             = max(0, ciclos_transcurridos − cuotas_pagadas)
```

## Por qué derivar y no escribir

El ADR-0003 mató al actor privilegiado en la decisión de crédito, pero el incumplimiento seguía necesitando que alguien escribiera un contador. Quien incumple tiene el incentivo perfecto para que nadie toque ese contrato jamás: sin esa transacción, `defaults` queda en cero, el Pool recomputa sobre un historial impecable y presta. Derivar del reloj cierra el círculo: **cero transacciones y el crédito igual se cierra**, que es la versión literal de "se suspende solo".

Como efecto lateral, el problema de "no se puede avanzar el tiempo en una Sepolia pública" desaparece en vez de resolverse: no se simula tiempo, se lee `block.timestamp`, y el tiempo real pasa solo.

## El clamp es obligatorio

Sin `max(0, …)` hay underflow en operación normal, no en un borde raro: quien paga la cuota del periodo **en curso** —que todavía no vence— tiene `cuotas_pagadas = ciclos_transcurridos + 1`, la resta da −1 y en `u32` eso es ~4,290 millones, o sea score basura para el mejor pagador de la junta. La convención que lo hace consistente: una cuota solo puede ser default cuando su periodo termina sin pago; pagar por adelantado es válido y nunca cuenta como crédito negativo.

## El tope va en todas las features temporales

`ciclos_completados` y `antiguedad_periodos` también salen de `ciclos_transcurridos`, así que llevan el mismo `min(…, ciclos_totales)`. Si se topa el default pero no las otras, una junta terminada queda medio congelada y medio pudriéndose.

## Consecuencias

- **El default es curable.** Lo derivado no es "cuotas jamás pagadas" sino "vencidas y aún impagas ahora": un pago tardío lo baja y lo mueve a `pagos_atrasados`. Habilita un beat de recuperación en vivo, y **obliga a que el dataset sintético entrene con esta misma definición** o hay train/serve skew.
- **`distribute` es permissionless y no necesita keeper**: el dueño del turno cobra el pozo, así que el que se beneficia de cerrar el ciclo es el que lo cierra.
- **`periodo` es por junta**, y la demo usa dos distintos: la junta "buena" con `periodo = 60s` corre completa en ocho minutos y queda congelada e inmutable hasta el Demo Day; la junta "mala" usa un periodo largo (10–30 min) para que el caso negativo se mantenga en una o dos cuotas vencidas —legible— durante los cinco minutos del pitch. Con 60s, para el sábado mostraría miles de defaults: correcto pero absurdo en pantalla.
- Los ciclos completados de un miembro en una junta terminada son el tamaño de la junta. "María con 3 ciclos" es una perilla: junta de 3 miembros si se quiere ese número, junta de 8 si se quiere 8. Hay que elegirlo, no heredarlo, y alinear el deck.
- El default derivado nunca toca dinero, así que refuerza la identidad de un solo camino de salida del ADR-0004 en lugar de ensuciarla.
- No existe estado "junta pausada": una junta real estancada acumularía defaults contra todos. El hueco cae entero fuera de la demo, donde las juntas están o congeladas o decayendo a propósito.
