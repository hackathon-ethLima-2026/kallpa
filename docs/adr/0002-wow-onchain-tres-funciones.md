---
status: accepted
---

# El score se expone en tres funciones, y la evidencia del WOW no depende de EAS

El `ScoreEngine` expone `compute_score` (view, gratis, para pintar UI y `/auditar`), `record_score` (tx que computa, persiste `LatestScore { score, positive, timestamp }` bajo la clave `(junta_id, member)` y emite `ScoreComputed`) y `attest` (tx que computa y publica la attestation EAS). Son la cobertura mínima de tres requisitos que no se pueden colapsar: mostrar el score gratis, probar el cómputo en cadena con evidencia durable, y certificarlo para que viaje.

## Por qué tres y no dos

Bajar a dos obliga a fusionar la prueba con la certificación, y lo que se pierde es exactamente el desacople de EAS. `record_score` entra en el ticket T6 (día 3), mientras que `attest` y la fecha de decisión del riesgo EAS caen recién el día 4: colgar el momento central de la demo de la pieza más frágil dejaría al día 3 —el día que el plan declara "el proyecto está ganado"— sin una sola transacción que lo pruebe.

## Por qué persiste y no solo emite

El valor de retorno de una transacción no le llega a quien la envía: de una tx minada solo se observan eventos y estado. Sin escritura, el `-> u16` de `record_score` solo existiría llamándola por `eth_call`, o sea nunca en el camino real. Persistir `LatestScore` deja el número consultable en cadena.

## El desacople resultó valer más de lo que se compró

Se decidió por calendario —no colgar el día 3 de la pieza del día 4— y terminó cubriendo un fallo que nadie había previsto: **`arbitrum-sepolia.easscan.org` no existe** (no resuelve en DNS; `arbitrum`, `sepolia` y `base-sepolia` sí). El criterio de aceptación de T8, "attestation visible en EAS scan", es incumplible en esta red, y se sustituye por Arbiscan más `EAS.getAttestation(uid)` por RPC, que además es mejor prueba: cualquiera la repite contra el nodo público sin pedirle confianza a nadie. Como la evidencia del WOW nunca dependió de EAS, el descubrimiento cambió una forma de verificar y no el plan.

## La dirección de EAS y el UID del schema entran por constructor

No son constantes del binario, y el motivo es el modo de fallar: **llamar a una dirección sin código devuelve éxito con datos vacíos**. Una dirección equivocada no revierte, se comporta igual que un EAS que funciona y solo se descubre cuando alguien busca la attestation y no está. Quemada en el WASM costaría un redespliegue; como argumento del constructor cuesta una línea del script de despliegue. El UID del schema va por el mismo camino y por una razón adicional: el schema se registra en una transacción aparte, así que no existe cuando el contrato se compila.

El contrato se defiende igual dentro: si la respuesta de `attest` trae menos de 32 bytes, revierte con `AttestationFallida` en vez de guardar ceros como UID.

## Consecuencias

- Las dos transacciones —`record_score` y `attest`— son envoltorios delgados sobre un `computar_y_persistir` privado, y la view comparte con ellas la lectura del historial y el modelo: cero lógica de scoring duplicada. `attest` por lo tanto **también persiste `LatestScore` y emite `ScoreComputed`**, además de `ScoreAttested`; silenciarlo dejaría transacciones que cambian el score registrado sin aparecer en el rastro por el que se lo sigue.
- La attestation guarda su UID bajo la misma clave `(junta_id, member)` que el score, y se lee con `latest_attestation`. El UID no se puede predecir —EAS lo deriva del instante del bloque y de un contador interno—, así que se toma del valor de retorno: de una transacción minada no se observa ese valor, y sin escribirlo el número existiría solo dentro de la transacción que lo creó.
- **`attest` no tiene cobertura de pruebas de su llamada a EAS.** Es una escritura entre contratos y en el SDK 0.9 esas llamadas no pasan por la abstracción de VM, así que no hay dónde interceptarlas: ninguna prueba local demuestra que se creó una attestation. Lo que sí está cubierto es todo lo que la determina —el selector `0xf17325e7`, los 160 bytes del payload, el compromiso con las señales, el recomputo en vivo y los dos caminos de error—, y la emisión real se comprueba contra la cadena con `getAttestation(uid)`.
- El número de gas del deck sale de `record_score` e incluye la lectura cross-contract del historial, la inferencia en punto fijo, un `SSTORE` y el evento. Es defendible como "computar y registrar un score en Arbitrum, sin EAS" — **no** como "pura inferencia ML". Aislar solo la aritmética exige medir el view aparte.
- El nombre es `record_score` y no `commit_score` porque `commitment` ya significa otra cosa en el propio schema (`featuresCommitment`), y confundir ambos en un contrato de reputación invita a un error de revisión. El pitch puede seguir diciendo "el score se computa en Arbitrum"; el identificador no viaja al deck.
