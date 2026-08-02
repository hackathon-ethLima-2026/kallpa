---
status: accepted
---

# Todo en Stylus, el ScoreEngine se construye en pareja, y el modelo entrega un stub antes que pesos

Los cuatro integrantes han escrito Rust, así que la decisión A3 (todos los contratos en Rust/Stylus) se mantiene y el fallback a Solidity queda archivado sin usarse. Sobre esa base se corrigen tres defectos del mapa de dueños que no dependían del lenguaje.

## Cero redundancia sobre la joya

El `ScoreEngine` es el componente que el propio plan declara innegociable, y estaba a cargo de una sola persona. Retomarlo a mitad de semana no es leer un ticket: es aritmética de punto fijo, sigmoide y llamadas cross-contract. **El ticket T6 se hace en pareja el día 3**, con el dueño de la Junta como segundo par de ojos: ya conoce `history()`, que es la entrada del motor, así que la pareja está alineada por conocimiento y no por disponibilidad. Se pierde media jornada de paralelismo y se compra la única póliza que importa.

## La joya dependía en serie del modelo

La cuantización de pesos y la construcción del motor caían ambas el día 3, con la primera bloqueando a la segunda, y el dueño del modelo además carga la integración EAS, cuya fecha de fallback es el día 4: dos veces en el camino crítico. **Se rompe con un stub**: el día 2 se acuerda el _formato_ de `weights_fixed.rs.txt` y se emite una versión con pesos falsos. El motor se construye y se testea contra el stub, y los pesos reales entran por reemplazo de archivo. La joya deja de esperar a que el modelo esté entrenado; solo espera a que el archivo tenga la forma correcta.

## El reparto ya no reflejaba el peso real

Las decisiones de esta revisión concentraron trabajo en la Junta: contadores O(1) (ADR-0003), identidad de integridad contra el ledger del token (ADR-0004), ciclos derivados del reloj (ADR-0005) y el snapshot de mora al cobrar (ADR-0007). Dejó de ser un contrato de dos días. Reparto resultante:

| Rol | Componentes                                     |
| --- | ----------------------------------------------- |
| R1  | Junta (C2) + MockUSDC (C1)                      |
| R2  | ScoreEngine (C3)                                |
| R3  | Modelo y dataset (C6) + EAS (C4)                |
| R4  | Frontend (C7) + auditoría y QR (C8) + Pool (C5) |

El Pool se mueve al dueño del frontend porque forma vertical con la pantalla de crédito: quien construye la decisión de préstamo construye también su interfaz. La asignación de nombres a roles la hace el equipo.
