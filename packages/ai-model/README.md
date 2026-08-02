# El modelo de crédito

Este paquete entrena el modelo que después corre **dentro del contrato**. Nada de lo que hay
aquí se despliega: lo único que cruza hacia la cadena es un archivo de constantes.

```bash
pip install -r requirements.txt

python generate_dataset.py   # dataset sintético reproducible
python train.py              # entrena y reporta el AUC
python quantize.py           # emite weights_fixed.rs.txt para el contrato
```

## Qué hace cada archivo

| Archivo                | Para qué                                                                     |
| ---------------------- | ---------------------------------------------------------------------------- |
| `features.py`          | El vector de ocho señales y sus rangos. Espejo del §6.1 y del contrato.       |
| `generate_dataset.py`  | Simula la vida de miembros dentro de juntas y deja que las señales emerjan.   |
| `train.py`             | Regresión logística sobre las señales normalizadas. Reporta AUC.              |
| `quantize.py`          | Pasa el modelo a enteros y escribe las constantes de Rust.                    |
| `fixed_point.py`       | El mismo cálculo del score que corre en el contrato, en Python.               |
| `weights_fixed.rs.txt` | **El artefacto**: se pega en `score_engine` sin editar una sola línea.        |

## Lo que hay que saber antes de tocar algo

**El dataset es sintético y no se usó ningún dato real de personas.** La simulación recrea el
ciclo de vida de un miembro —cuándo paga, cuándo se atrasa, cuándo le toca cobrar el pozo— y
deja que las ocho señales salgan de ahí, en lugar de inventar columnas con correlaciones
puestas a mano. La diferencia importa: columnas sueltas producirían combinaciones que el
contrato nunca va a generar, y el modelo entrenado no se parecería al modelo servido.

**El AUC describe un mundo simulado, no capacidad predictiva sobre personas reales.** Para
saber cuánto significa, se midió aparte el techo: un oráculo que conociera la fiabilidad
latente de cada miembro —que el modelo nunca observa— alcanza un AUC de alrededor de 0.91. El
modelo llega a 0.871, así que recupera casi toda la señal que las ocho columnas dejan ver.

**Los pesos y los rangos son un conjunto casado.** El modelo se entrena sobre features ya
normalizadas con los topes de dominio de `features.py`. Cambiar un rango sin volver a
entrenar no "desafina" el modelo: lo invalida, y sin ningún síntoma visible. Por eso
`quantize.py` emite ambos en el mismo archivo y `score_engine` pega ese archivo entero.

**Los rangos son topes de dominio, no el mínimo y el máximo de la muestra.** Un rango tomado
de los datos cambiaría cada vez que se regenera el dataset. Los topes de dominio son
reproducibles, resisten valores atípicos y se pueden defender en voz alta: el atraso se corta
en tres periodos porque más allá de eso ya no eres un moroso, eres un incumplimiento.

**Toda la aritmética del score es entera.** El punto flotante no es reproducible bit a bit
entre plataformas, y la afirmación central del proyecto es que cualquiera puede reproducir
fuera de la cadena lo que la cadena computó. `fixed_point.py` imita hasta el detalle de que
la división entera de Rust trunca hacia cero mientras la de Python redondea hacia abajo —
sobre un producto punto que puede ser negativo, esa diferencia mueve el score.
