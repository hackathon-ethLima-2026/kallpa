# Decisiones de arquitectura (ADR)

Diez decisiones salidas de la revisión del build spec. Cada una registra **por qué** se decidió algo; el **qué** vive en el §6 del build spec. Si el §6 y un ADR se contradicen, gana el §6 — pero el ADR explica qué se rompe al cambiarlo.

| #                                                                   | Decisión                                 | En una línea                                                                                                               |
| ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [0001](./0001-score-por-par-junta-miembro.md)                       | Score por par (junta, miembro)           | El sujeto es el miembro, la fuente es una junta; `junta_id` entra en las firmas y en el schema EAS.                        |
| [0002](./0002-wow-onchain-tres-funciones.md)                        | Tres funciones de scoring                | `compute_score` (view) / `record_score` (tx que persiste) / `attest` (tx + EAS); la evidencia del día 3 no depende de EAS. |
| [0003](./0003-pool-recomputa-en-vivo.md)                            | El Pool recomputa en vivo                | La Junta es la fuente de verdad; el score persistido y la attestation son evidencia, no entrada de decisión.               |
| [0004](./0004-qr-audita-integridad-no-solvencia.md)                 | El QR audita integridad                  | `aportado − distribuido == balanceOf`, no "solvente"; la solvencia se muda al Pool.                                        |
| [0005](./0005-defaults-derivados-del-reloj.md)                      | Defaults derivados del reloj             | Lo positivo se escribe, lo negativo se lee; sin keeper y sin simular tiempo.                                               |
| [0006](./0006-features-adimensionales-y-normalizacion.md)           | Features adimensionales                  | Atraso en periodos fraccionarios; min-max con clamp on-chain y un solo artefacto de pesos.                                 |
| [0007](./0007-fuera-monto-entra-defaults-tras-cobro.md)             | Fuera el monto, entra la mora post-cobro | El monto era redundante y proxy de riqueza; entra el riesgo canónico del pandero.                                          |
| [0008](./0008-estructura-de-equipo-y-camino-critico.md)             | Equipo y camino crítico                  | Todo en Stylus; el motor se construye en pareja; el modelo entrega stub antes que pesos.                                   |
| [0009](./0009-tasa-de-cumplimiento-en-vez-de-ciclos-completados.md) | Tasa de cumplimiento                     | La feature 0 pasa de conteo a cociente; guarda obligatoria de división por cero.                                           |
| [0010](./0010-umbral-unico-de-reputacion.md)                        | Umbral único de reputación               | `positive = score >= 400`, la misma frontera que el primer tramo del Pool.                                                 |

El vocabulario del dominio está en [`CONTEXT.md`](../../CONTEXT.md) en la raíz.
