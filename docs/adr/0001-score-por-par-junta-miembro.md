---
status: accepted
---

# El score se computa por par (junta, miembro), sobre un único contrato Junta multi-junta

Un solo contrato `junta` alberga muchas juntas identificadas por `junta_id`, y toda lectura de historial lleva ese id: `history(junta_id, member)`. El **sujeto** del score es el miembro (es quien recibe la attestation y quien la porta hacia un prestamista), pero la **fuente** es siempre una junta concreta, así que el id entra en el camino de lectura y también dentro del schema EAS, para que la attestation se autodescriba.

## Alternativas consideradas

- **Un contrato por junta (factory).** La dirección del contrato sería la identidad de la junta y `history(member)` quedaría sin ambigüedad. Se descartó porque en Stylus cada contrato desplegado requiere un paso de activación aparte del deploy, y desplegar y activar desde dentro de otro contrato es terreno inmaduro para una semana de trabajo. Además obligaría a documentar una dirección nueva ante el jurado por cada junta creada.
- **Score global agregado del miembro (todas sus juntas).** Requeriría mantener la lista de juntas por miembro e iterarla en storage, encareciendo `attest` (que sí escribe), por un camino que la demo nunca ejercita: la protagonista pertenece a una sola junta. También obligaría a defender ante el jurado que un default en la junta A baja el score en la junta B, que es una decisión de producto que nadie quiere estar sosteniendo el día del pitch.

## Consecuencias

- El `ScoreEngine` queda cableado a una dirección conocida del contrato `junta`, con un solo `sol_interface!`. Puntuar juntas de terceros ("cualquier contrato que exponga `history`") queda fuera de alcance: exigiría validar la dirección recibida en cada llamada.
- El schema EAS incorpora `uint32 juntaId`, de modo que la attestation dice de qué junta salió sin depender de contexto externo.
- El relato pasa de "la reputación viaja" a "la attestation viaja y declara su origen", que es más honesto y sigue siendo portable.
