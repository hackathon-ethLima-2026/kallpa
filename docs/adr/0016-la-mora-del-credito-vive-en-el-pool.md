---
status: accepted
---

# El préstamo tiene plazo, y su incumplimiento vive en el registro del Pool, no en el score

El Pool guarda un `plazo` que entra por constructor y expone `esta_en_mora(member)`. Pasada la
fecha, quien no devolvió no puede volver a pedir, y el rechazo llega con un error propio
—`PrestamoVencido`— que dice cuándo venció.

Las ocho señales del modelo **no cambian**. El incumplimiento de un préstamo no entra al score.

## El agujero que se cierra

`request_loan` guardaba el instante de la concesión y no lo leía nunca más. Sin fecha límite,
"no devolver" y "todavía no devolver" eran el mismo estado, y ninguno tenía consecuencia:

- No había plazo.
- No había interés.
- Ninguna de las ocho señales venía del Pool — se comprobó buscando referencias, y las únicas
  menciones al Pool en el ScoreEngine y en la Junta son comentarios.

Se podía pedir doscientos mUSDC, no devolverlos jamás, y el score seguía en 1000. La única
penalidad era que esa dirección no podía pedir otra vez, cosa que ya ocurría por tener el
préstamo abierto. El build spec promete "reputación bidireccional"; la mitad de la junta se
cumplía y la del crédito no existía.

## La decisión, y su límite

La mora se **deriva del reloj**, igual que los incumplimientos de una junta (ADR-0005). Nadie
manda una transacción para declarar a alguien en mora: llega la fecha y lo está. Y quien deja
de pagar nunca firma la transacción que lo delata.

Se cura devolviendo. No es una marca permanente, por la misma razón que un incumplimiento de
junta tampoco lo es: un sistema que solo condena empuja a abandonar, y lo que se quiere es que
la gente vuelva.

**Lo que NO se hizo, a propósito: agregar una novena señal al modelo.**

## Alternativas descartadas

### Una novena señal, `prestamos_incumplidos`, dentro del score

Es la opción que parece obvia y es la que más costaría. Los pesos se entrenan en conjunto:
agregar una columna obliga a regenerar el dataset, reentrenar, recuantizar y volver a
verificar la equivalencia entre el contrato en Rust y el entrenamiento en Python. Eso cambia
el `modelHash`, que viaja dentro de cada attestation ya emitida, y **invalida la verificación
de equivalencia exacta que es en sí misma un entregable comprometido**. Se cambiaría una
afirmación verificada por una sin verificar.

Pero el argumento de fondo no es el calendario, es de diseño: **el score mide comportamiento
dentro de una junta**, y esa es la razón por la que significa algo — es un historial que hoy
no existe en ningún registro. El incumplimiento de un préstamo con un fondo sí tiene registro,
y lo tiene en el propio fondo. Meterlo dentro del score mezcla dos cosas que se pueden
consultar por separado, y le quita al score la propiedad que lo hace interesante: describir
exactamente aquello que ningún banco ve.

Quien preste mirando a Kallpa puede leer las dos fuentes. Están las dos en la cadena.

### Que el ScoreEngine consulte al Pool y baje el veredicto

Cerraría el hueco sin tocar el modelo, pero crea una dependencia circular: el Pool ya consulta
al ScoreEngine para decidir. Aunque en lecturas no hay riesgo de reentrada, obliga a que el
motor conozca la dirección del fondo, y con ello a que **el score dependa de qué fondo esté
cableado**. Dejaría de ser una propiedad de la persona para pasar a ser una propiedad de la
persona *y de nuestro Pool*, que es justo lo contrario de la reputación portable.

### Cobrar interés

Fuera de alcance y no resuelve nada de esto. Un préstamo sin interés que vence sigue siendo un
incumplimiento; uno con interés que nunca vence, no. El plazo es lo que faltaba.

### Que el plazo fuera una constante del contrato

El plazo es política de quien pone el capital, no del protocolo. Un fondo cooperativo puede
prestar a treinta días y otro a siete. Fijarlo en el binario obligaría a redesplegar para
cambiar una decisión que no es técnica.

## Consecuencias

- Quien no devuelve queda visible para cualquiera: `esta_en_mora` es una vista pública.
- **El score de esa persona no baja.** Es deliberado y hay que poder defenderlo: el fondo
  tiene su propio registro, y quien preste mirando a Kallpa debe leer los dos. Si un día se
  decide que la mora pese en la reputación, el lugar es una novena señal y el costo es
  reentrenar el modelo con todo lo que arrastra.
- El despliegue queda con un plazo de una semana. Es demostrable en pruebas, pero **no durante
  una demostración en vivo**: nadie va a esperar siete días. Para enseñarlo hay que desplegar
  un gemelo con un plazo corto.
- `loan_of` no cambió de forma. La fecha de vencimiento se calcula con `plazo()`, que es un
  dato del fondo y no de cada préstamo.
