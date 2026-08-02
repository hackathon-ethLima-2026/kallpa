---
status: accepted
---

# La página pública audita integridad y cobertura, no solvencia; solvencia se muda al Pool

El QR del jurado deja de afirmar "SOLVENTE ✓" sobre una junta y pasa a exhibir dos cosas que sí pueden salir mal: la **identidad de conservación** `aportado_total − distribuido_total == mUSDC.balanceOf(junta)` y la **cobertura del ciclo en curso** ("ciclo 4: 5 de 8 cuotas pagadas"). El término _solvencia_ se reserva para el Pool, el único contrato donde tiene contenido empírico.

## Por qué "solvente" no afirmaba nada

Una junta rotativa recibe cuotas y entrega el pozo íntegro al turno; no existe camino por el que salga dinero fuera de la distribución. Con eso, `reservas ≥ pasivos` solo puede valer `true`, y un chequeo que no puede fallar no es una verificación sino un cartel — decorativo, justo lo que las reglas del hackathon prohíben para el uso de blockchain. Además, a mitad de ciclo el pasivo ni siquiera está definido: el pozo solo se debe en el momento de distribuir, así que no hay razón que mostrar.

## Por qué la identidad se compara contra el ledger del token

Si `balance` fuera un contador interno que la Junta incrementa al depositar y decrementa al distribuir, la identidad sería igual de tautológica: el mismo código mantiene los tres términos y no pueden discrepar. Comparar contra `mUSDC.balanceOf(junta)` reconcilia **dos fuentes independientes** — la contabilidad que la Junta declara contra el saldo que el contrato del token efectivamente le reconoce. Se rompe con tokens enviados sueltos al contrato, con un retiro colado que mueva fondos sin tocar los contadores, o con reentrancy. Es falsificable de verdad.

## Firmas

```
// Junta
verify_integrity() -> (aportado, distribuido, balance_real, cuadra: bool)
cycle_coverage()   -> (ciclo, pagadas, total)

// Pool
liquidity_status() -> (liquidez, prestado, disponible)
```

## Consecuencias

- **Un solo camino de salida de dinero en la Junta: `distribute`.** Las penalidades por atraso son reputacionales, nunca monetarias. Cualquier penalidad en dinero agregaría un término a la identidad y habría que rehacerla.
- `check_solvencia` sale del `ScoreEngine`, que se queda únicamente con scoring. La integridad vive en la Junta, el único contrato que conoce esos agregados, y son dos contadores O(1) más de los que ya mantiene por el ADR-0003.
- La solvencia del Pool es `disponible = liquidez − prestado_vigente`: llega a cero cuando todo está prestado y cae cuando un préstamo incumple.
- El artefacto se puede exhibir **en rojo**: enviar tokens sueltos al contrato en vivo, o desplegar un gemelo con retiro para el organizador, hace saltar el QR a "NO CUADRA". Mostrarlo fallando prueba que el verde significa algo.
- Coherencia con el ADR-0003: aquel fijó a la Junta como fuente de verdad de los hechos; este verifica que sus hechos de dinero cuadran con el ledger real del token.
