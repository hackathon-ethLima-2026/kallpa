# Kallpa

**La caja que no puede mentir ni robar.**

La junta de ahorro de toda la vida —ocho personas, una cuota por ciclo, el pozo rota por turnos— convertida en un contrato inteligente que custodia el dinero, computa el crédito de cada miembro **dentro de la cadena**, y deja que cualquiera audite la caja desde el celular sin pedir permiso.

Hackathon Ethereum Lima 2026 · Track Arbitrum · Bounty Advanced (Scaffold-Stylus + IA) · Arbitrum Sepolia.

## El pitch de 30 segundos

Dos de cada tres peruanos que ahorran lo hacen fuera del banco: en juntas y panderos donde todo el pozo depende de que el organizador no desaparezca. Y cuando cumplen puntual durante años, esa puntualidad no vale nada — ningún banco la ve, ningún historial la registra.

Kallpa resuelve las dos mitades a la vez. El contrato custodia el pozo, así que nadie puede desviarlo; y un modelo de machine learning corre **dentro de un contrato Arbitrum Stylus** computando el score de crédito de cada miembro a partir de su historial en cadena. El score no lo calcula nuestro servidor: lo calcula Arbitrum, y cualquiera puede reproducir el cálculo.

Si cumples, tu línea de microcrédito crece. Si incumples, **se suspende sola** — sin que nadie firme nada, porque el incumplimiento se deriva del reloj de la cadena.

## Cómo correr esto

Requisitos: Node ≥ 20.18, Yarn 2+, Rust 1.91.0, `cargo-stylus` 0.10.8, Docker y Foundry. Los comandos exactos de instalación están en [`docs/build-spec.md`](./docs/build-spec.md) §3.

```bash
yarn install                 # dependencias del monorepo
yarn chain                   # terminal 1 — devnode local (Docker)
yarn deploy                  # terminal 2 — despliega los contratos
yarn start                   # terminal 3 — front en http://localhost:3000
```

Para desplegar a la testnet real, copia `.env.example` a `packages/stylus/.env`, completa la `PRIVATE_KEY` (**usa una wallet de prueba, nunca una con fondos reales**) y corre `yarn deploy --network arbitrumSepolia`.

## Los cuatro contratos

| Contrato       | Qué hace                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `mock_usdc`    | ERC-20 de 6 decimales que hace de dinero en la demo.                                                          |
| `junta`        | Custodia el pozo, cobra cuotas, reparte turnos y expone el historial de cada miembro. Es la fuente de verdad. |
| `score_engine` | Corre el modelo de crédito en aritmética de punto fijo, dentro de la cadena.                                  |
| `pool`         | Presta contra el score, recomputándolo en vivo en el momento de decidir.                                      |

Las direcciones desplegadas y sus enlaces a Arbiscan viven en [`docs/addresses.md`](./docs/addresses.md).

## Cómo está documentado

- **[`CONTEXT.md`](./CONTEXT.md)** — el glosario del dominio. Qué es una junta, un ciclo, un default, la mora post-cobro. Léelo primero: el código usa estos términos y no otros.
- **[`docs/build-spec.md`](./docs/build-spec.md)** — la especificación técnica. Su §6 (interfaces compartidas) es la ley: si el código y el §6 se contradicen, gana el §6.
- **[`docs/adr/`](./docs/adr/)** — las diez decisiones de arquitectura, cada una con las alternativas que se descartaron y por qué. Antes de proponer un cambio grande, revisa si ya está discutido ahí.
- **[`docs/architecture.png`](./docs/architecture.png)** — el diagrama del sistema.

## Herramientas de terceros

Se citan todas en [`docs/third-party.md`](./docs/third-party.md), como pide el reglamento del hackathon. Este repositorio parte de [Scaffold-Stylus](https://github.com/Arb-Stylus/scaffold-stylus) (MIT).

## Equipo

nullVoice — Ely Rivaldo Cortez, Diego Cisneros, Mariana Chambi, Francis Mamani.
