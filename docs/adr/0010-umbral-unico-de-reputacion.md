---
status: accepted
---

# `positive` y el primer tramo del Pool comparten un solo umbral

La reputación es positiva exactamente cuando el score alcanza el mínimo con el que el Pool presta: `positive = score >= 400`. Un solo número gobierna las dos preguntas —"¿le prestamos?" y "¿su reputación es positiva?"— y por eso no hay nada que inventar en el día 3.

## Por qué un umbral y no dos

El campo `positive` del schema EAS y el booleano que la pantalla muestra como "crédito suspendido" estaban descritos solo en prosa ("score alto, sin mora post-cobro"), sin número. Sin umbral explícito, quien implemente el motor elige uno, y cualquier valor distinto del primer tramo del Pool produce estados absurdos y visibles: una attestation que dice `positive = true` sobre un miembro al que el Pool acaba de negarle el préstamo, o al revés.

## Consecuencias

- Mover el primer tramo (`< 400 → sin crédito`) mueve también la frontera de la reputación. Es intencional: es una sola perilla, y se ajusta en el daily como el resto de los tramos.
- La revocación de la attestation positiva vigente cuando el miembro cae por debajo del umbral queda **fuera de alcance** (ya estaba en la lista de recortes). El consumidor externo se apoya en `expirationTime`; el Pool no la necesita porque recomputa (ADR-0003).
