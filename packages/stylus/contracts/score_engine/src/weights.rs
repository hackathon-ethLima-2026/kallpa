// GENERADO POR quantize.py — NO EDITAR A MANO.
//
// Pesos y rangos del modelo de crédito, en punto fijo con escala 1e6.
// Son un conjunto casado: el modelo se entrenó sobre features normalizadas con
// exactamente estos rangos, así que cambiar uno sin regenerar el otro produce un
// score equivocado sin ningún síntoma visible.
//
// AUC: 0.927   ·   semilla del dataset: 20260802
// Pérdida por cuantización: máx 3 pts, media 0.74 pts

/// Escala del punto fijo: un valor real `v` se representa como `v * 1000000`.
pub const SCALE: i128 = 1000000;

/// Huella del modelo. Viaja en cada attestation para que se pueda saber con qué
/// modelo exacto se calculó un score.
pub const MODEL_HASH: &str = "0x9c5704ad6735dd51910a796359570773f27b8d67895fb93fa3c7233a4092ad9e";

/// Peso de cada señal, en el orden del §6.1.
pub const PESOS: [i128; 8] = [
    -6279283,       // tasa_cumplimiento: -6.2793 (menos riesgo)
    -2045790,       // pagos_puntuales: -2.0458 (menos riesgo)
    -421616,        // pagos_atrasados: -0.4216 (menos riesgo)
    2224375,        // defaults: +2.2244 (más riesgo)
    1034950,        // atraso_max_periodos: +1.0349 (más riesgo)
    2999416,        // defaults_tras_cobro: +2.9994 (más riesgo)
    -243031,        // antiguedad_periodos: -0.2430 (menos riesgo)
    1815898,        // disputas_perdidas: +1.8159 (más riesgo)
];

/// Sesgo del modelo (+1.7360).
pub const SESGO: i128 = 1736013;

/// Tope inferior de dominio de cada señal.
pub const MINIMOS: [i128; 8] = [0, 0, 0, 0, 0, 0, 0, 0];

/// Tope superior de dominio de cada señal. NO es el máximo observado en la
/// muestra: es un tope de dominio, para que regenerar el dataset no cambie la
/// normalización y con ella el significado de los pesos.
pub const MAXIMOS: [i128; 8] = [1000000, 12, 12, 12, 3000000, 12, 12, 5];

/// Sigmoide muestreada cada medio punto entre -6 y 6, en punto fijo. Entre esos
/// puntos se interpola en línea recta; fuera del intervalo satura. El paso es de
/// medio punto porque con paso entero el score se apartaba hasta doce puntos del
/// modelo entrenado en la zona de mayor curvatura.
pub const SIGMOIDE: [i128; 25] = [2473, 4070, 6693, 10987, 17986, 29312, 47426, 75858, 119203, 182426, 268941, 377541, 500000, 622459, 731059, 817574, 880797, 924142, 952574, 970688, 982014, 989013, 993307, 995930, 997527];
/// Separación entre dos puntos consecutivos de la tabla.
pub const PASO: i128 = 500000;
pub const Z_MIN: i128 = -6;
pub const Z_MAX: i128 = 6;
