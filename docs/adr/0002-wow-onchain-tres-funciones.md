---
status: accepted
---

# El score se expone en tres funciones, y la evidencia del WOW no depende de EAS

El `ScoreEngine` expone `compute_score` (view, gratis, para pintar UI y `/auditar`), `record_score` (tx que computa, persiste `LatestScore { score, positive, timestamp }` bajo la clave `(junta_id, member)` y emite `ScoreComputed`) y `attest` (tx que computa y publica la attestation EAS). Son la cobertura mínima de tres requisitos que no se pueden colapsar: mostrar el score gratis, probar el cómputo en cadena con evidencia durable, y certificarlo para que viaje.

## Por qué tres y no dos

Bajar a dos obliga a fusionar la prueba con la certificación, y lo que se pierde es exactamente el desacople de EAS. `record_score` entra en el ticket T6 (día 3), mientras que `attest` y la fecha de decisión del riesgo EAS caen recién el día 4: colgar el momento central de la demo de la pieza más frágil dejaría al día 3 —el día que el plan declara "el proyecto está ganado"— sin una sola transacción que lo pruebe.

## Por qué persiste y no solo emite

El valor de retorno de una transacción no le llega a quien la envía: de una tx minada solo se observan eventos y estado. Sin escritura, el `-> u16` de `record_score` solo existiría llamándola por `eth_call`, o sea nunca en el camino real. Persistir `LatestScore` deja el número consultable en cadena.

## Consecuencias

- Las tres funciones son envoltorios delgados sobre un `_compute_and_persist` privado: cero lógica de scoring duplicada.
- El número de gas del deck sale de `record_score` e incluye la lectura cross-contract del historial, la inferencia en punto fijo, un `SSTORE` y el evento. Es defendible como "computar y registrar un score en Arbitrum, sin EAS" — **no** como "pura inferencia ML". Aislar solo la aritmética exige medir el view aparte.
- El nombre es `record_score` y no `commit_score` porque `commitment` ya significa otra cosa en el propio schema (`featuresCommitment`), y confundir ambos en un contrato de reputación invita a un error de revisión. El pitch puede seguir diciendo "el score se computa en Arbitrum"; el identificador no viaja al deck.
