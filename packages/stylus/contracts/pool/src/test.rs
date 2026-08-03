//! Pruebas del Pool.
//!
//! La consulta al ScoreEngine es una lectura, así que se puede interceptar y las decisiones
//! de crédito quedan cubiertas: quién recibe préstamo, quién no, y por qué. Los movimientos
//! de token son escrituras y no se pueden simular en el SDK 0.9 (ver el módulo de pruebas de
//! la Junta), así que los caminos que transfieren dinero se verifican contra la cadena local.
//!
//! Eso deja fuera el desembolso en sí, pero cubre lo que de verdad puede estar mal: la
//! política de crédito.

use super::*;
use stylus_sdk::testing::*;

const TOKEN: Address = Address::new([9u8; 20]);
const MOTOR: Address = Address::new([7u8; 20]);
const MARIA: Address = Address::new([1u8; 20]);

/// Cuántas juntas dice haber evaluado el motor cuando la prueba no mira ese número.
const JUNTAS: u32 = 2;

/// La respuesta que daría el ScoreEngine: tres palabras de treinta y dos bytes.
fn respuesta_del_motor(peor_score: u16, con_credito: bool, juntas_evaluadas: u32) -> Vec<u8> {
    let mut salida = alloc::vec![0u8; 96];
    salida[30] = (peor_score >> 8) as u8;
    salida[31] = (peor_score & 0xFF) as u8;
    salida[63] = if con_credito { 1 } else { 0 };
    salida[92..96].copy_from_slice(&juntas_evaluadas.to_be_bytes());
    salida
}

/// Un Pool que le pregunta al motor por María y recibe esta respuesta.
///
/// La consulta ya no lleva junta: el único dato que entra es la dirección de quien pide, así
/// que el mock se ancla solamente a ella.
fn pool_con_juntas(peor_score: u16, con_credito: bool, juntas_evaluadas: u32) -> (TestVM, Pool) {
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);
    vm.set_sender(MARIA);

    let datos = scoreGlobalCall { member: MARIA }.abi_encode();
    vm.mock_static_call(
        MOTOR,
        datos,
        Ok(respuesta_del_motor(
            peor_score,
            con_credito,
            juntas_evaluadas,
        )),
    );
    (vm, pool)
}

fn pool_con(peor_score: u16, con_credito: bool) -> (TestVM, Pool) {
    pool_con_juntas(peor_score, con_credito, JUNTAS)
}

/// Coloca liquidez en el Pool sin pasar por el token, que no se puede simular.
fn con_liquidez(pool: &mut Pool, monto: u64) {
    pool.liquidez.set(U256::from(monto));
}

// =====================================================================================
// Los tramos de crédito
// =====================================================================================

#[test]
fn cada_tramo_presta_lo_que_le_toca() {
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);

    assert_eq!(pool.tramo(1000), U256::from(200_000_000u64));
    assert_eq!(pool.tramo(750), U256::from(200_000_000u64));
    assert_eq!(pool.tramo(749), U256::from(120_000_000u64));
    assert_eq!(pool.tramo(600), U256::from(120_000_000u64));
    assert_eq!(pool.tramo(599), U256::from(50_000_000u64));
    assert_eq!(pool.tramo(400), U256::from(50_000_000u64));
    assert_eq!(pool.tramo(399), U256::ZERO);
    assert_eq!(pool.tramo(0), U256::ZERO);
}

#[test]
fn el_corte_del_primer_tramo_coincide_con_el_umbral_de_reputacion() {
    // Si estos dos números se separaran, existiría alguien con reputación positiva a quien
    // el Pool le niega el préstamo, o al revés. Un solo umbral gobierna las dos preguntas.
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);

    assert_eq!(pool.tramo(399), U256::ZERO);
    assert!(pool.tramo(400) > U256::ZERO);
}

#[test]
fn un_score_mas_alto_nunca_presta_menos() {
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);

    let mut anterior = U256::ZERO;
    for score in 0..=1000u16 {
        let monto = pool.tramo(score);
        assert!(monto >= anterior, "el tramo bajó en el score {score}");
        anterior = monto;
    }
}

// =====================================================================================
// La decisión de crédito
// =====================================================================================

#[test]
fn sin_credito_global_no_hay_prestamo_aunque_una_junta_suya_este_impecable() {
    // María cumple sin falta en una de sus juntas y dejó de aportar en la otra. Mientras ella
    // señalaba la junta, presentaba la impecable y se llevaba el tramo máximo; el Pool
    // decidía con la parte del comportamiento que ella escogía enseñar. Ahora el motor
    // responde por las dos y devuelve el peor score: no hay nada que escoger.
    let (_vm, mut pool) = pool_con_juntas(180, false, 2);
    con_liquidez(&mut pool, 1_000_000_000);

    assert!(
        pool.request_loan().is_err(),
        "prestó a quien incumplió en otra de sus juntas"
    );
}

#[test]
fn sin_elegibilidad_no_hay_prestamo_por_alto_que_sea_el_score() {
    // Es el caso del miembro recién llegado: puntúa casi perfecto porque no hay ninguna
    // señal negativa que observar, pero no tiene historial suficiente para que ese número
    // signifique algo. El modelo no se equivoca; tratar "no sé" como "excelente" sí sería
    // un error.
    let (_vm, mut pool) = pool_con(989, false);
    con_liquidez(&mut pool, 1_000_000_000);

    assert!(
        pool.request_loan().is_err(),
        "prestó a alguien sin historial suficiente"
    );
}

#[test]
fn quien_incumplio_no_recibe_credito() {
    let (_vm, mut pool) = pool_con(95, false);
    con_liquidez(&mut pool, 1_000_000_000);
    assert!(pool.request_loan().is_err());
}

#[test]
fn un_score_bajo_no_recibe_credito_aunque_sea_elegible() {
    // Elegible por historial, pero por debajo del primer tramo: no hay monto que prestar.
    let (_vm, mut pool) = pool_con(350, true);
    con_liquidez(&mut pool, 1_000_000_000);
    assert!(pool.request_loan().is_err());
}

#[test]
fn si_el_motor_no_responde_no_se_presta() {
    // Una interfaz desincronizada tiene que romperse ruidosamente. Prestar por defecto
    // sería entregar dinero respaldado por nada.
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);
    vm.set_sender(MARIA);
    con_liquidez(&mut pool, 1_000_000_000);

    assert!(pool.request_loan().is_err());
}

#[test]
fn sin_liquidez_suficiente_se_rechaza_antes_de_mover_nada() {
    let (_vm, mut pool) = pool_con(990, true);
    con_liquidez(&mut pool, 10_000_000); // menos que el tramo que le corresponde

    assert!(pool.request_loan().is_err());
    let (_, prestado, _) = pool.liquidity_status();
    assert_eq!(prestado, U256::ZERO, "no se registró un préstamo fallido");
}

#[test]
fn no_se_puede_pedir_dos_prestamos_a_la_vez() {
    // La segunda solicitud se rechaza por el préstamo abierto, sin llegar a consultar el
    // score: la guarda es lo primero que corre.
    let (_vm, mut pool) = pool_con(990, true);
    {
        let mut p = pool.prestamos.setter(MARIA);
        p.monto.set(U256::from(200_000_000u64));
        p.activo.set(true);
    }
    con_liquidez(&mut pool, 1_000_000_000);

    assert!(pool.request_loan().is_err());
}

#[test]
fn devolver_sin_prestamo_activo_falla() {
    let (_vm, mut pool) = pool_con(990, true);
    assert!(pool.repay().is_err());
}

// =====================================================================================
// La solvencia del Pool
// =====================================================================================

#[test]
fn lo_disponible_es_la_liquidez_menos_lo_prestado() {
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);

    con_liquidez(&mut pool, 500_000_000);
    pool.prestado_vigente.set(U256::from(200_000_000u64));

    let (liquidez, prestado, disponible) = pool.liquidity_status();
    assert_eq!(liquidez, U256::from(500_000_000u64));
    assert_eq!(prestado, U256::from(200_000_000u64));
    assert_eq!(disponible, U256::from(300_000_000u64));
}

#[test]
fn un_prestamo_sin_devolver_mantiene_baja_la_disponibilidad() {
    // A diferencia de una junta, el Pool sí puede quedarse corto: aquí la palabra
    // solvencia significa algo, y por eso vive en este contrato y no en la Junta.
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);

    con_liquidez(&mut pool, 200_000_000);
    pool.prestado_vigente.set(U256::from(200_000_000u64));

    let (_, _, disponible) = pool.liquidity_status();
    assert_eq!(disponible, U256::ZERO, "todo está colocado");
}

#[test]
fn depositar_cero_no_es_un_deposito() {
    let (_vm, mut pool) = pool_con(990, true);
    assert!(pool.deposit_liquidity(U256::ZERO).is_err());
}

// =====================================================================================
// La lectura del ScoreEngine
// =====================================================================================

#[test]
fn el_score_se_decodifica_bien_en_todo_el_rango() {
    for score in [0u16, 1, 255, 256, 400, 749, 750, 999, 1000] {
        let (_vm, pool) = pool_con(score, true);

        let (leido, credito, _) = pool.consultar_score_global(MARIA).unwrap();
        assert_eq!(leido, score, "el peor score se leyó mal");
        assert!(credito);
    }
}

#[test]
fn el_conteo_de_juntas_se_decodifica_bien_en_todo_el_rango() {
    // Vive en la tercera palabra de la respuesta y ocupa sus últimos cuatro bytes. Los
    // valores elegidos cruzan cada frontera de byte, que es donde un desplazamiento mal
    // puesto se nota.
    for juntas in [0u32, 1, 255, 256, 65_535, 65_536, u32::MAX] {
        let (_vm, pool) = pool_con_juntas(700, true, juntas);

        let (_, _, leidas) = pool.consultar_score_global(MARIA).unwrap();
        assert_eq!(leidas, juntas, "el conteo de juntas se leyó mal");
    }
}

#[test]
fn una_respuesta_mas_corta_de_lo_esperado_no_se_interpreta() {
    // Es exactamente lo que devolvería un ScoreEngine viejo, con la interfaz de dos palabras.
    // Leer esos bytes como si fueran tres daría un conteo de juntas inventado, así que la
    // consulta falla y el préstamo se cae: una interfaz desincronizada tiene que romperse.
    let vm = TestVM::default();
    let mut pool = Pool::from(&vm);
    pool.constructor(TOKEN, MOTOR);
    vm.set_sender(MARIA);
    vm.mock_static_call(
        MOTOR,
        scoreGlobalCall { member: MARIA }.abi_encode(),
        Ok(alloc::vec![0u8; 64]),
    );
    con_liquidez(&mut pool, 1_000_000_000);

    assert!(pool.consultar_score_global(MARIA).is_err());
    assert!(pool.request_loan().is_err());
}
