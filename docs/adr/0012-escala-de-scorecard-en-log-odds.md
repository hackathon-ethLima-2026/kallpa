---
status: accepted
---

# El score es lineal en log-odds, no el complemento de la probabilidad

El score de 0 a 1000 se obtiene repartiendo linealmente el rango de log-odds del modelo:
cada unidad de log-odds vale siempre la misma cantidad de puntos, y fuera de `[-6, 6]` el
score satura. Es la convención de las tarjetas de puntaje crediticio de toda la vida.

## Por qué no el complemento de la probabilidad

La primera versión hacía `score = 1000 × (1 − probabilidad de incumplir)`. Es intuitivo y
está bien calibrado, pero como instrumento de crédito casi no discrimina. Medido sobre el
conjunto de entrenamiento:

| Tramo | Complemento de la probabilidad | Log-odds |
|---|---|---|
| Sin crédito (<400) | 6.7% | 3.9% |
| 50 mUSDC (400–599) | 4.2% | 12.0% |
| 120 mUSDC (600–749) | 4.3% | 22.8% |
| 200 mUSDC (750+) | **84.8%** | 61.3% |
| Mediana | 974 | 804 |

Con la escala vieja, el 85% de la población caía en el tramo superior y los dos tramos
intermedios estaban prácticamente vacíos: la línea de crédito era binaria, o el monto máximo
o nada. La historia de "cumples y tu línea crece" describía una transición que casi nadie
llegaba a vivir.

El problema no era el modelo sino la escala. Una probabilidad se apelmaza contra sus
extremos; los log-odds se reparten.

## Lo que se gana además

Desaparece la sigmoide del cálculo. Era la única aproximación que quedaba —una curva
muestreada cada medio punto e interpolada recta— y con ella se va su error: la diferencia
entre el score en cadena y el modelo entrenado cayó de tres puntos a **uno**, y el promedio
a cero. También sale del contrato la tabla de veinticinco constantes y su interpolación.

## Consecuencias

- El score deja de ser "una probabilidad al revés" y pasa a ser un puntaje en escala de
  odds. Al explicarlo conviene decirlo así y no como porcentaje de confianza.
- Los tramos del §6.7 no cambian: los cortes en 400, 600 y 750 siguen valiendo, y ahora
  además separan grupos de tamaño comparable.
- La equivalencia entre el contrato y el espejo en Python sigue siendo exacta, comprobada
  sobre veinte vectores.
