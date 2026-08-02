# Deck — cambios aplicados (alineación al diseño endurecido)

Aplicados directamente al `build.js` y regenerado el `.pptx` (QA visual en las 6). Este doc es el registro; la fuente de verdad es el deck regenerado. Slides 1–3 y 10–13 no cambiaron.

- **Slide 4** — la tarjeta de "solvencia" era una tautología (Reservas 2,400 = Pasivos 2,400) → **integridad**: Aportado 1,050 · Distribuido 800 · Balance real 250 · **CUADRA ✓**. Consistente: 8 miembras × cuota 50 = pozo 400; 2 ciclos completos (800 aportado, 800 distribuido) + 5 cuotas del ciclo 3 (250) → balance 250 = 1,050 − 800. Puntos de cuota: 5 de 8 pintados. Sello "SOLVENTE" → "CUADRA".
- **Slide 5** — paso 02: "reservas contra pasivos" → "aportado − distribuido = balance real".
- **Slide 6** — "Solvencia verificable / reservas ≥ pasivos" → "Integridad verificable / la caja cuadra". Cita de gas genérica (10x) → **"[X] gas medido en record_score"**. ⚠️ **`[X]` se llena después del T6** (§9 del build spec) — es el único hueco del deck.
- **Slide 7** — mecanismo reescrito: sin "attestation positiva/negativa"; el Pool recomputa, el default sale del reloj. Scores que cruzan tramos: **628 → 781** (línea 120 → 200) y **781 → 355** (sin crédito, no "reducido"). Pie: por qué el titular pasó de falso a verdadero ("el tiempo firma por él").
- **Slide 8** — quitado **ERC-4337** (primer recorte del §13; no prometer lo que puede no existir el sábado). "el pool presta o suspende según el score" → "recomputando el score en vivo". Auditoría: aportado/distribuido/balance cruzado contra el saldo del token.
- **Slide 9** — 3 → **8 ciclos**; `record_score` (tx en Arbiscan) → el Pool recomputa → presta (score **781 → 200**, consistente con tramos); reverso sin "genera attestation" (default del reloj); **beat nuevo: el QR en rojo** — mandar 100 USDC sueltos en vivo → NO CUADRA.

**Pendientes:** el `[X]` de la slide 6 (gas de `record_score`, existe después del T6) · **slide 14** (nombres + reparto) espera la decisión de equipo (ver ADR-0008 y su refinamiento).
