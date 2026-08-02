# Herramientas y código de terceros

El reglamento del hackathon permite usar frameworks, SDKs y modelos open source siempre que se citen. Esta es la lista completa, y se actualiza el mismo día en que se agrega algo.

## Base del proyecto

| Qué                                                                                         | Licencia         | Para qué lo usamos                                                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Scaffold-Stylus](https://github.com/Arb-Stylus/scaffold-stylus)                            | MIT              | Monorepo base: estructura, scripts de deploy, devnode local y el frontend Next.js. Este repositorio parte de una copia del suyo. |
| [Arbitrum Stylus SDK](https://github.com/OffchainLabs/stylus-sdk-rs)                        | Apache-2.0 / MIT | Escribir contratos en Rust que corren sobre Arbitrum.                                                                            |
| [OpenZeppelin Contracts para Stylus](https://github.com/OpenZeppelin/rust-contracts-stylus) | MIT              | Primitivas de control de acceso y ERC-20.                                                                                        |
| [Alloy](https://github.com/alloy-rs/core)                                                   | Apache-2.0 / MIT | Tipos primitivos de Ethereum (`Address`, `U256`) y codificación ABI.                                                             |
| [Ethereum Attestation Service](https://docs.attest.org)                                     | MIT              | Emitir el score como attestation portable en Arbitrum Sepolia.                                                                   |

## Modelo de crédito

| Qué                                                              | Licencia     | Para qué lo usamos                                                                                           |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| [scikit-learn](https://scikit-learn.org)                         | BSD-3-Clause | Entrenar la regresión logística cuyos pesos se cuantizan y se llevan al contrato.                            |
| [NumPy](https://numpy.org) / [pandas](https://pandas.pydata.org) | BSD-3-Clause | Generar el dataset sintético y verificar la equivalencia entre Python y la aritmética de punto fijo en Rust. |

El dataset es **sintético**: no se usó ningún dato real de personas. El generador está en `packages/ai-model/generate_dataset.py` y se puede reproducir entero.

## Asistencia de IA en el desarrollo

Se usó **Claude (Anthropic)** para revisar el diseño y redactar documentación y código. Las decisiones de arquitectura quedaron registradas en [`adr/`](./adr/) con sus alternativas descartadas; el equipo revisó y aprobó cada una.
