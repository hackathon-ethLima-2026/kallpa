//! Pruebas del ScoreEngine.
//!
//! La mayoría ejercen `calcular_score` directamente, que es donde vive el modelo. Las que
//! tocan el contrato simulan la respuesta de la Junta: esa es una lectura, así que se puede
//! interceptar (a diferencia de las escrituras, ver el módulo de pruebas de la Junta).
//!
//! La última prueba escribe un archivo con vectores y sus scores para que el espejo en
//! Python lo verifique. Ese cruce es el que sostiene la afirmación de que el score es
//! reproducible fuera de la cadena.

use super::*;
use stylus_sdk::testing::*;

const JUNTA: Address = Address::new([7u8; 20]);
const MARIA: Address = Address::new([1u8; 20]);

/// Codifica un entero con signo como palabra de 32 bytes, igual que la ABI de Ethereum.
fn palabra(valor: i128) -> [u8; 32] {
    let mut salida = [if valor < 0 { 0xFFu8 } else { 0x00u8 }; 32];
    let bytes = valor.to_be_bytes();
    salida[16..32].copy_from_slice(&bytes);
    salida
}

/// La respuesta que daría `history` con estas ocho señales.
fn respuesta_de_junta(features: [i128; 8]) -> Vec<u8> {
    let mut salida = Vec::with_capacity(8 * 32);
    for f in features.iter() {
        salida.extend_from_slice(&palabra(*f));
    }
    salida
}

fn motor_con(features: [i128; 8]) -> (TestVM, ScoreEngine) {
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA);

    let datos = historyCall {
        juntaId: 0,
        member: MARIA,
    }
    .abi_encode();
    vm.mock_static_call(JUNTA, datos, Ok(respuesta_de_junta(features)));
    (vm, motor)
}

/// Un miembro impecable: cumplió todo, nunca se atrasó, nunca incumplió.
const IMPECABLE: [i128; 8] = [SCALE, 8, 0, 0, 0, 0, 8, 0];

/// Alguien que cobró el pozo y dejó de aportar: el riesgo clásico de una junta.
const SE_LLEVO_EL_POZO: [i128; 8] = [250_000, 2, 0, 6, 0, 6, 8, 0];

// =====================================================================================
// El modelo
// =====================================================================================

#[test]
fn el_miembro_impecable_puntua_alto_y_es_positivo() {
    let score = calcular_score(IMPECABLE);
    assert!(score >= UMBRAL_POSITIVO, "puntuó {score}, esperaba >= 400");
    assert!(score <= 1000);
}

#[test]
fn quien_cobro_y_dejo_de_pagar_pierde_el_credito() {
    // Es el caso negativo de la demostración. Tiene que quedar por debajo del umbral sin
    // que nadie declare nada: basta con su historial.
    let score = calcular_score(SE_LLEVO_EL_POZO);
    assert!(
        score < UMBRAL_POSITIVO,
        "puntuó {score}, esperaba < 400 (crédito suspendido)"
    );
}

#[test]
fn cumplir_siempre_puntua_mas_que_incumplir() {
    assert!(calcular_score(IMPECABLE) > calcular_score(SE_LLEVO_EL_POZO));
}

#[test]
fn el_score_nunca_sale_del_rango() {
    // Ni con entradas absurdas. Es lo que garantiza que la interfaz nunca muestre un
    // número imposible y que el Pool nunca reciba un tramo inexistente.
    let extremos: [[i128; 8]; 4] = [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [SCALE, 12, 12, 12, 3 * SCALE, 12, 12, 5],
        [
            i128::from(i64::MAX),
            999_999,
            999_999,
            999_999,
            i128::from(i64::MAX),
            999_999,
            999_999,
            999_999,
        ],
        [-999_999, 0, 0, 0, -999_999, 0, 0, 0],
    ];
    for caso in extremos.iter() {
        let score = calcular_score(*caso);
        assert!(score <= 1000, "score fuera de rango: {score}");
    }
}

#[test]
fn valores_absurdos_saturan_en_lugar_de_disparar_el_score() {
    // Sin la saturación, una entrada gigante se propagaría multiplicada por su peso y
    // devolvería un número arbitrario con aspecto de score válido. Aquí se comprueba que
    // cuarenta atrasos puntúan igual que el tope del dominio, que son doce.
    let en_el_tope: [i128; 8] = [0, 0, 12, 12, 3 * SCALE, 12, 12, 5];
    let absurdo: [i128; 8] = [0, 0, 4000, 4000, 900 * SCALE, 4000, 4000, 4000];
    assert_eq!(calcular_score(en_el_tope), calcular_score(absurdo));
}

#[test]
fn empeorar_el_comportamiento_nunca_sube_el_score() {
    // Cada caso transforma un historial en otro **alcanzable y peor**, no incrementa una
    // columna suelta. La diferencia importa: subir `pagos_atrasados` sin tocar nada más
    // describe a alguien que pagó más cuotas, y por eso su score sube — el peso negativo de
    // esa señal es correcto, porque pagar tarde sigue siendo pagar. Lo que empeora a una
    // persona es *convertir* pagos puntuales en atrasados, no sumarlos de la nada.
    let base: [i128; 8] = [750_000, 6, 0, 2, 0, 0, 8, 0];
    let referencia = calcular_score(base);

    // Un pago puntual pasa a ser atrasado.
    let mut tarde = base;
    tarde[1] -= 1;
    tarde[2] += 1;
    tarde[4] = SCALE;

    // Una cuota que se pagaba deja de pagarse: baja el cumplimiento y sube el default.
    let mut incumple = base;
    incumple[0] = 625_000;
    incumple[1] -= 1;
    incumple[3] += 1;

    // Los mismos incumplimientos, pero después de haber cobrado el pozo.
    let mut tras_cobro = base;
    tras_cobro[5] = 2;

    // Pierde una disputa.
    let mut disputa = base;
    disputa[7] += 1;

    for (nombre, peor) in [
        ("un pago puntual se vuelve atrasado", tarde),
        ("una cuota deja de pagarse", incumple),
        ("los incumplimientos son posteriores al cobro", tras_cobro),
        ("pierde una disputa", disputa),
    ] {
        assert!(
            calcular_score(peor) <= referencia,
            "{nombre}: el score subió de {referencia} a {}",
            calcular_score(peor)
        );
    }
}

#[test]
fn mejorar_el_cumplimiento_nunca_baja_el_score() {
    let base: [i128; 8] = [400_000, 3, 2, 3, SCALE, 1, 8, 1];
    let mut mejor = base;
    mejor[0] = SCALE; // cumplió todo
    mejor[1] = 8; // todos los pagos puntuales
    assert!(calcular_score(mejor) >= calcular_score(base));
}

// =====================================================================================
// El contrato leyendo la Junta de verdad
// =====================================================================================

#[test]
fn el_motor_lee_el_historial_de_la_junta_y_puntua() {
    let (_vm, motor) = motor_con(IMPECABLE);
    let score = motor.compute_score(0, MARIA).unwrap();
    assert_eq!(score, calcular_score(IMPECABLE));
    assert!(motor.is_positive(0, MARIA).unwrap());
}

#[test]
fn el_caso_negativo_se_lee_como_negativo() {
    let (_vm, motor) = motor_con(SE_LLEVO_EL_POZO);
    assert!(!motor.is_positive(0, MARIA).unwrap());
}

#[test]
fn si_la_junta_no_responde_falla_en_vez_de_inventar_un_score() {
    // Una interfaz desincronizada tiene que romperse ruidosamente. Devolver un score por
    // defecto sería peor: alguien recibiría crédito respaldado por nada.
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA);
    assert!(motor.compute_score(0, MARIA).is_err());
}

#[test]
fn registrar_el_score_lo_deja_escrito_en_la_cadena() {
    // El valor que devuelve una transacción no le llega a quien la envía: de una
    // transacción minada solo se observan eventos y estado. Sin esta escritura, el número
    // no quedaría consultable en ninguna parte.
    let (vm, mut motor) = motor_con(IMPECABLE);
    vm.set_block_timestamp(1_700_000_000);

    let (antes, _, _) = motor.latest_score(0, MARIA);
    assert_eq!(antes, 0, "todavía no se registró nada");

    let devuelto = motor.record_score(0, MARIA).unwrap();
    let (guardado, positivo, momento) = motor.latest_score(0, MARIA);

    assert_eq!(guardado, devuelto);
    assert!(positivo);
    assert_eq!(momento, 1_700_000_000);
}

#[test]
fn el_score_registrado_es_del_par_junta_miembro() {
    // Registrar en una junta no puede contaminar la lectura de otra: el score pertenece al
    // par, no al miembro suelto.
    let (_vm, mut motor) = motor_con(IMPECABLE);
    motor.record_score(0, MARIA).unwrap();

    let (otra_junta, _, _) = motor.latest_score(1, MARIA);
    assert_eq!(otra_junta, 0);
}

#[test]
fn el_signo_negativo_del_historial_se_interpreta_bien() {
    // Las señales en punto fijo llegan en complemento a dos. Leerlas sin considerar el
    // signo convertiría un valor pequeño y negativo en uno astronómico, y el score saldría
    // disparado en la dirección equivocada.
    let mut con_negativo = IMPECABLE;
    con_negativo[4] = -SCALE;
    let (_vm, motor) = motor_con(con_negativo);
    let score = motor.compute_score(0, MARIA).unwrap();
    assert_eq!(score, calcular_score(con_negativo));
    assert!(score <= 1000);
}

// =====================================================================================
// El puente hacia el espejo en Python
// =====================================================================================

#[test]
fn exporta_vectores_para_comprobar_la_equivalencia_con_python() {
    // No comprueba nada por sí misma: escribe un archivo con vectores y los scores que
    // este contrato les asigna, para que `test_equivalence.py` verifique que su
    // reimplementación llega exactamente a los mismos números.
    //
    // Ese cruce es lo que sostiene la afirmación central del proyecto. Si alguien tiene que
    // creernos que el score salió del contrato, no hay nada verificable; si puede
    // recalcularlo por su cuenta y le da igual, la afirmación se sostiene sola.
    use std::io::Write;

    let vectores: [[i128; 8]; 20] = [
        IMPECABLE,
        SE_LLEVO_EL_POZO,
        [0, 0, 0, 0, 0, 0, 0, 0],
        [SCALE, 12, 12, 12, 3 * SCALE, 12, 12, 5],
        [500_000, 4, 4, 4, SCALE, 2, 8, 1],
        [875_000, 7, 0, 1, 0, 0, 8, 0],
        [125_000, 1, 0, 7, 0, 7, 8, 2],
        [750_000, 3, 3, 2, SCALE / 2, 1, 8, 0],
        [1_000_000, 8, 0, 0, 0, 0, 8, 3],
        [333_333, 2, 1, 4, 2 * SCALE, 3, 6, 1],
        [666_666, 4, 0, 2, 0, 1, 6, 0],
        [900_000, 9, 1, 1, SCALE / 4, 0, 10, 0],
        [100_000, 0, 1, 9, 3 * SCALE, 9, 10, 4],
        [SCALE, 0, 0, 0, 0, 0, 0, 0],
        [0, 12, 0, 0, 0, 0, 12, 0],
        [0, 0, 12, 0, 0, 0, 12, 0],
        [0, 0, 0, 12, 0, 12, 12, 0],
        [0, 0, 0, 0, 3 * SCALE, 0, 12, 0],
        [0, 0, 0, 0, 0, 0, 0, 5],
        [-SCALE, 0, 0, 0, -SCALE, 0, 0, 0],
    ];

    let destino = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../ai-model/rust_scores.csv"
    );
    let mut archivo = match std::fs::File::create(destino) {
        Ok(f) => f,
        // Si la ruta no existe, no tiene sentido tumbar la suite entera por eso.
        Err(_) => return,
    };

    writeln!(
        archivo,
        "tasa_cumplimiento,pagos_puntuales,pagos_atrasados,defaults,\
atraso_max_periodos,defaults_tras_cobro,antiguedad_periodos,disputas_perdidas,score"
    )
    .unwrap();
    for v in vectores.iter() {
        let campos: Vec<String> = v.iter().map(|x| x.to_string()).collect();
        writeln!(archivo, "{},{}", campos.join(","), calcular_score(*v)).unwrap();
    }
}
