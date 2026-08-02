# Direcciones desplegadas

Entregable oficial del hackathon. Se completa después de cada despliegue y **antes** del feature freeze (jueves 6, 12:00).

**Red:** Arbitrum Sepolia · chainId **421614** · explorador `https://sepolia.arbiscan.io`

## Contratos

| Contrato       | Dirección   | Arbiscan | Desplegado |
| -------------- | ----------- | -------- | ---------- |
| `mock_usdc`    | _pendiente_ |          |            |
| `junta`        | _pendiente_ |          |            |
| `score_engine` | _pendiente_ |          |            |
| `pool`         | _pendiente_ |          |            |

Orden de despliegue por dependencias: `mock_usdc` → `junta` → `score_engine` (necesita la dirección de la junta y la de EAS) → `pool` (necesita `score_engine` y `mock_usdc`; **no** necesita EAS, porque recomputa el score en lugar de leer una attestation).

## Ethereum Attestation Service

| Qué                   | Valor                                       |
| --------------------- | ------------------------------------------- |
| Contrato EAS          | _confirmar antes de fijarlo en el contrato_ |
| Registro de schemas   | _confirmar antes de fijarlo en el contrato_ |
| UID de nuestro schema | _pendiente — se llena al registrarlo_       |

El schema registrado es:

```
uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment
```

> Las direcciones de EAS se confirman contra la documentación oficial o el SDK antes de fijarlas en el contrato. Una dirección equivocada cuesta horas de depuración por un error que no se parece a su causa.

## Modelo

| Qué                   | Valor                                              |
| --------------------- | -------------------------------------------------- |
| `modelHash`           | _pendiente — sale de `quantize.py`_                |
| AUC reportado         | _pendiente_                                        |
| Gas de `record_score` | _pendiente — se mide en el ticket T6 y va al deck_ |
