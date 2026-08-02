---
status: accepted
---

# El Pool recomputa el score en vivo; el score persistido no es entrada de decisión

`request_loan` llama al `ScoreEngine` dentro de la misma transacción, que a su vez lee el historial vivo de la Junta. La decisión de crédito se toma con los hechos del segundo en que se presta, nunca con un score publicado antes. Queda una jerarquía fija: la **Junta** es la fuente de verdad (los hechos), el **score** es una función pura de esos hechos leída cuando importa, y `LatestScore` y la **attestation EAS** son evidencia y copia portable — no entradas de decisión.

## Alternativa considerada: leer `LatestScore` con ventana de frescura

Descartada porque un score persistido es una foto que solo se actualiza cuando alguien paga gas por actualizarla, y eso abre dos agujeros que la ventana no cierra:

- **El negativo no tiene dueño.** Quien incumple jamás va a firmar la transacción que hunde su propio score, así que la foto se queda con el último positivo y el Pool presta igual. Cualquier arreglo con keeper o rol privilegiado reintroduce el actor central que el proyecto declara no tener.
- **La ventana verifica edad, no veracidad.** El atacante publica un positivo fresco, incumple después y pide el préstamo: su foto pasa el chequeo de frescura precisamente por ser reciente.

Además obligaría a "republica tu score antes de pedir el préstamo", que degrada la experiencia y aun así deja el exploit abierto.

## Consecuencias

- **`history()` debe ser O(1).** Al quedar en el camino caliente de cada préstamo, la Junta no puede iterar el log de pagos: mantiene las ocho señales como contadores agregados que actualiza en cada depósito, default y disputa, y `history()` es una lectura directa del struct. Las ocho son O(1)-mantenibles.
- `attest` también recomputa en vivo. Certificar una foto vieja emitiría una credencial falsa que además viaja, peor que una decisión interna equivocada.
- El Pool queda acoplado a la dirección del `ScoreEngine`, que se guarda como parámetro modificable para sobrevivir un redespliegue. Es el acoplamiento correcto: el Pool debe depender de la lógica de score.
- Los dos saltos cross-contract del camino de scoring son lecturas (`staticcall`), no escrituras; `request_loan` solo escribe su propio registro de préstamo.
- "El crédito se suspende solo" pasa a ser literalmente cierto: nadie publica ni ejecuta nada, el Pool recomputa y ve el incumplimiento en la Junta.
