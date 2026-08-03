// GENERADO POR quantize.py — NO EDITAR A MANO.
//
// Pesos y rangos del modelo de crédito, en punto fijo con escala 1e6.
// Son un conjunto casado: el modelo se entrenó sobre features normalizadas con
// exactamente estos rangos, así que cambiar uno sin regenerar el otro produce un
// score equivocado sin ningún síntoma visible.
//
// AUC: 0.927   ·   semilla del dataset: 20260802
// Pérdida por cuantización: máx 1 pts, media 0.00 pts

/// Escala del punto fijo: un valor real `v` se representa como `v * 1000000`.
pub const SCALE: i128 = 1000000;

/// Huella del modelo. Viaja en cada attestation para que se pueda saber con qué
/// modelo exacto se calculó un score.
pub const MODEL_HASH: &str = "0x9664441e2342982ac11dab05b4ac95752f480eda32150983805e014fbc92b0c1";

/// Peso de cada señal, en el orden del §6.1.
pub const PESOS: [i128; 8] = [
    -6279283, // tasa_cumplimiento: -6.2793 (menos riesgo)
    -2045790, // pagos_puntuales: -2.0458 (menos riesgo)
    -421616,  // pagos_atrasados: -0.4216 (menos riesgo)
    2224375,  // defaults: +2.2244 (más riesgo)
    1034950,  // atraso_max_periodos: +1.0349 (más riesgo)
    2999416,  // defaults_tras_cobro: +2.9994 (más riesgo)
    -243031,  // antiguedad_periodos: -0.2430 (menos riesgo)
    1815898,  // disputas_perdidas: +1.8159 (más riesgo)
];

/// Sesgo del modelo (+1.7360).
pub const SESGO: i128 = 1736013;

/// Tope inferior de dominio de cada señal.
pub const MINIMOS: [i128; 8] = [0, 0, 0, 0, 0, 0, 0, 0];

/// Tope superior de dominio de cada señal. NO es el máximo observado en la
/// muestra: es un tope de dominio, para que regenerar el dataset no cambie la
/// normalización y con ella el significado de los pesos.
pub const MAXIMOS: [i128; 8] = [1000000, 12, 12, 12, 3000000, 12, 12, 5];

/// Rango de log-odds sobre el que se reparte la escala del score. Fuera de
/// estos límites el modelo ya está tan seguro que la diferencia deja de
/// importar para decidir un crédito, así que el score satura.
pub const Z_MIN: i128 = -6;
pub const Z_MAX: i128 = 6;
