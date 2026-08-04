//! Pruebas de la Junta.
//!
//! Cada prueba corresponde a un invariante que salió de la revisión del diseño, y el
//! comentario dice qué se rompería si desapareciera.
//!
//! Están divididas en dos capas a propósito. La aritmética que puede estar mal —clasificar
//! un atraso, calcular una tasa de cumplimiento— vive en funciones puras y se prueba
//! directamente, sin montar un contrato. Lo demás se ejerce contra el contrato real,
//! evitando los caminos que transfieren tokens.
//!
//! Esa evasión tiene una razón concreta, y conviene conocerla antes de intentar
//! "arreglarla": en el SDK 0.9 una llamada **mutante** a otro contrato no se puede
//! interceptar desde las pruebas. El contexto de escritura exige `&mut self` y el manejador
//! de la VM exige `&self`, y esas dos cosas no conviven, así que la ruta de escritura
//! termina yendo directo al entorno anfitrión y esquiva el simulador. Las **lecturas** sí
//! se pueden interceptar, porque solo necesitan préstamos inmutables — y por eso la
//! verificación de integridad, que es lo único que este contrato publica hacia afuera, sí
//! queda cubierta, incluido el caso en que deja de cuadrar.
//!
//! Los depósitos, entonces, se verifican contra la cadena local y no aquí.

use super::*;
use alloy_sol_types::SolCall;
use stylus_sdk::testing::*;

const CUOTA: u64 = 50_000_000; // 50 mUSDC, seis decimales
const PERIODO: u64 = 60; // un ciclo por minuto, como la junta sembrada de la demo
const INICIO: u64 = 1_000_000;
const TOKEN: Address = Address::new([9u8; 20]);

sol! {
    function balanceOf(address account) external view returns (uint256);
}

fn miembro(n: u8) -> Address {
    Address::from([n; 20])
}

/// Un `uint256` ABI-codificado.
fn word(v: U256) -> Vec<u8> {
    v.to_be_bytes::<32>().to_vec()
}

/// Una junta de `n` miembros, ya arrancada, cuyo reloj empieza en `INICIO`.
///
/// La convoca el primer miembro y la arranca en el mismo instante, así que las pruebas que
/// no hablan de la convocatoria ven exactamente lo que veían cuando `create_junta` arrancaba
/// el reloj sola. El creador entra de una vez y su turno es el cero, de modo que `m[i]`
/// sigue siendo el miembro del turno `i`.
fn junta_de(n: u8) -> (TestVM, Junta, Vec<Address>) {
    let (vm, mut contrato, miembros) = convocatoria_de(n);
    contrato.arrancar(0).unwrap();
    (vm, contrato, miembros)
}

/// Lo mismo, pero detenido en la fase anterior: la junta existe y todavía recluta.
fn convocatoria_de(n: u8) -> (TestVM, Junta, Vec<Address>) {
    let vm = TestVM::default();
    vm.set_block_timestamp(INICIO);
    let mut contrato = Junta::from(&vm);
    contrato.constructor(TOKEN);

    let miembros: Vec<Address> = (1..=n).map(miembro).collect();
    // El remitente por defecto del TestVM no es ninguno de estos, y quien convoca queda
    // dentro de la junta: sin fijarlo, la junta tendría un miembro de más en el turno cero.
    vm.set_sender(miembros[0]);
    contrato
        .create_junta(
            "Las Emprendedoras".into(),
            miembros.clone(),
            U256::from(CUOTA),
            PERIODO,
        )
        .unwrap();
    (vm, contrato, miembros)
}

// =====================================================================================
// Aritmética pura — aquí vive la lógica que puede estar equivocada
// =====================================================================================

#[test]
fn pagar_dentro_del_plazo_no_produce_atraso() {
    assert_eq!(atraso_en_periodos(INICIO, INICIO + PERIODO, PERIODO), 0);
}

#[test]
fn pagar_antes_del_vencimiento_no_es_atraso_negativo() {
    // Sin la guarda, la resta daría la vuelta y el mejor pagador de la junta aparecería
    // con el peor atraso registrado.
    assert_eq!(
        atraso_en_periodos(INICIO, INICIO + 10 * PERIODO, PERIODO),
        0
    );
}

#[test]
fn medio_ciclo_tarde_son_medio_periodo_y_no_cero() {
    // Redondeando a enteros, quien paga a mitad de ciclo se vería idéntico a un puntual y
    // la señal de atraso perdería casi todo su contenido.
    let vencimiento = INICIO + PERIODO;
    assert_eq!(
        atraso_en_periodos(vencimiento + PERIODO / 2, vencimiento, PERIODO),
        SCALE as u128 / 2
    );
}

#[test]
fn dos_ciclos_tarde_son_dos_periodos() {
    let vencimiento = INICIO + PERIODO;
    assert_eq!(
        atraso_en_periodos(vencimiento + 2 * PERIODO, vencimiento, PERIODO),
        2 * SCALE as u128
    );
}

#[test]
fn un_periodo_de_cero_no_hace_estallar_la_medicion() {
    assert_eq!(atraso_en_periodos(INICIO + 100, INICIO, 0), 0);
}

#[test]
fn sin_ciclos_vencidos_el_cumplimiento_es_total() {
    // Este es el estado exacto en que la siembra toca el contrato: la junta acaba de nacer
    // y no ha vencido ningún ciclo. Una división entera por cero aborta la ejecución en
    // Rust, así que la rama especial no es cosmética: es lo que evita que la demo muera en
    // su primer segundo.
    assert_eq!(tasa_de_cumplimiento(0, 0), SCALE);
    assert_eq!(tasa_de_cumplimiento(3, 0), SCALE);
}

#[test]
fn la_tasa_es_la_fraccion_de_lo_que_le_tocaba_pagar() {
    assert_eq!(tasa_de_cumplimiento(1, 2), SCALE / 2);
    assert_eq!(tasa_de_cumplimiento(3, 4), SCALE * 3 / 4);
    assert_eq!(tasa_de_cumplimiento(8, 8), SCALE);
    assert_eq!(tasa_de_cumplimiento(0, 5), 0);
}

#[test]
fn pagar_por_adelantado_no_da_mas_de_cumplimiento_total() {
    // Quien paga la cuota del ciclo en curso tiene más cuotas pagadas que ciclos vencidos.
    // Sin el tope, su cumplimiento pasaría del 100% y empujaría el score fuera del rango
    // con el que se entrenó el modelo.
    assert_eq!(tasa_de_cumplimiento(5, 3), SCALE);
}

// =====================================================================================
// Lo negativo aparece solo, con el reloj
// =====================================================================================

#[test]
fn junta_recien_creada_no_acumula_nada() {
    let (_vm, c, m) = junta_de(8);
    let (tasa, _, _, defaults, _, tras_cobro, antiguedad, _) = c.history(0, m[0]);

    assert_eq!(tasa, I128::try_from(SCALE).unwrap());
    assert_eq!(defaults, 0);
    assert_eq!(tras_cobro, 0);
    assert_eq!(antiguedad, 0);
}

#[test]
fn el_incumplimiento_aparece_sin_que_nadie_firme_nada() {
    // El corazón del diseño: entre la primera lectura y la segunda no se ejecuta ninguna
    // transacción. Solo pasa el tiempo, y el crédito se cierra solo.
    let (vm, c, m) = junta_de(8);

    let (_, _, _, antes, _, _, _, _) = c.history(0, m[0]);
    assert_eq!(antes, 0);

    vm.set_block_timestamp(INICIO + 3 * PERIODO);

    let (tasa, _, _, despues, _, _, antiguedad, _) = c.history(0, m[0]);
    assert_eq!(
        despues, 3,
        "tres ciclos vencidos sin pagar son tres incumplimientos"
    );
    assert_eq!(antiguedad, 3);
    assert_eq!(tasa, I128::ZERO, "no pagó nada de lo que le tocaba");
}

#[test]
fn una_junta_completa_congela_su_historial() {
    // Sin el tope, la junta que se siembra el jueves llegaría al sábado con miles de
    // incumplimientos y un score basura. El tope es lo que la hace sembrable.
    let (vm, c, m) = junta_de(8);

    vm.set_block_timestamp(INICIO + 8 * PERIODO);
    let (_, _, _, al_terminar, _, _, antiguedad, _) = c.history(0, m[0]);

    vm.set_block_timestamp(INICIO + 10_000 * PERIODO);
    let (_, _, _, mucho_despues, _, _, antiguedad_despues, _) = c.history(0, m[0]);

    assert_eq!(al_terminar, 8);
    assert_eq!(mucho_despues, 8, "una junta terminada ya no acumula nada");
    assert_eq!(antiguedad, 8);
    assert_eq!(antiguedad_despues, 8);
}

// =====================================================================================
// La mora post-cobro distingue al pagador lento del que ya se llevó el pozo
// =====================================================================================

#[test]
fn quien_no_ha_cobrado_no_tiene_mora_post_cobro() {
    // Un pagador lento que todavía no tocó el pozo no representa el mismo riesgo que
    // alguien que ya cobró y dejó de aportar, aunque ambos deban exactamente lo mismo.
    let (vm, c, m) = junta_de(8);
    vm.set_block_timestamp(INICIO + 3 * PERIODO);

    let (_, _, _, defaults, _, tras_cobro, _, _) = c.history(0, m[5]);
    assert_eq!(defaults, 3);
    assert_eq!(
        tras_cobro, 0,
        "todavía no cobró: no puede tener mora posterior"
    );
}

#[test]
fn cobrar_el_turno_y_seguir_sin_pagar_si_genera_mora_post_cobro() {
    // Nadie aportó, así que el pozo va vacío y no se mueve un solo token: lo que se prueba
    // aquí es la fotografía de la mora en el instante del cobro, que es lo único que
    // separa los incumplimientos de antes de los de después.
    let (vm, mut c, m) = junta_de(4);

    vm.set_block_timestamp(INICIO + PERIODO + 1);
    let monto = c.distribute(0).unwrap();
    assert_eq!(monto, U256::ZERO, "no había nada que repartir");

    // En ese instante ya debía una cuota; a partir de ahí acumula dos más.
    vm.set_block_timestamp(INICIO + 3 * PERIODO);
    let (_, _, _, defaults, _, tras_cobro, _, _) = c.history(0, m[0]);
    assert_eq!(defaults, 3);
    assert_eq!(
        tras_cobro, 2,
        "solo cuentan los incumplimientos posteriores al cobro"
    );
}

#[test]
fn el_turno_avanza_al_repartir() {
    let (vm, mut c, _m) = junta_de(4);
    let (_, _, turno_inicial, _, _, _) = c.junta_state(0);
    assert_eq!(turno_inicial, 0);

    vm.set_block_timestamp(INICIO + PERIODO + 1);
    c.distribute(0).unwrap();

    let (_, _, turno, _, _, _) = c.junta_state(0);
    assert_eq!(turno, 1);
}

#[test]
fn no_se_puede_vaciar_la_caja_antes_de_que_venza_el_ciclo() {
    let (vm, mut c, _m) = junta_de(4);
    vm.set_block_timestamp(INICIO + PERIODO / 2);
    assert!(c.distribute(0).is_err());
}

#[test]
fn una_junta_terminada_ya_no_reparte() {
    let (vm, mut c, _m) = junta_de(2);
    vm.set_block_timestamp(INICIO + 10 * PERIODO);
    c.distribute(0).unwrap();
    c.distribute(0).unwrap();
    assert!(
        c.distribute(0).is_err(),
        "ya cobraron los dos miembros: no hay tercer turno"
    );
}

// =====================================================================================
// La identidad que cualquiera puede verificar sin permiso
// =====================================================================================

#[test]
fn la_contabilidad_cuadra_contra_el_saldo_real_del_token() {
    let (vm, c, _m) = junta_de(4);
    let contrato = vm.contract_address();

    vm.mock_static_call(
        TOKEN,
        balanceOfCall { account: contrato }.abi_encode(),
        Ok(word(U256::ZERO)),
    );

    let (aportado, distribuido, saldo, cuadra) = c.verify_integrity().unwrap();
    assert_eq!(aportado, U256::ZERO);
    assert_eq!(distribuido, U256::ZERO);
    assert_eq!(saldo, U256::ZERO);
    assert!(cuadra);
}

#[test]
fn mandar_tokens_sueltos_al_contrato_rompe_la_identidad() {
    // Este es el caso que vuelve útil la verificación: si no pudiera dar falso, no
    // probaría nada. Es también el momento de la demo en que el QR se pone en rojo.
    let (vm, c, _m) = junta_de(4);
    let contrato = vm.contract_address();

    vm.mock_static_call(
        TOKEN,
        balanceOfCall { account: contrato }.abi_encode(),
        Ok(word(U256::from(100))),
    );

    let (aportado, distribuido, saldo, cuadra) = c.verify_integrity().unwrap();
    assert_eq!(aportado - distribuido, U256::ZERO);
    assert_eq!(saldo, U256::from(100));
    assert!(!cuadra, "hay saldo que la contabilidad no explica");
}

// =====================================================================================
// Guardas de acceso y parámetros
// =====================================================================================

#[test]
fn alguien_de_afuera_no_puede_depositar_en_una_junta_ajena() {
    let (vm, mut c, _m) = junta_de(4);
    vm.set_sender(miembro(200));
    assert!(c.deposit(0).is_err());
}

#[test]
fn no_se_puede_operar_sobre_una_junta_que_no_existe() {
    let (vm, mut c, _m) = junta_de(4);
    vm.set_sender(miembro(1));
    assert!(c.deposit(7).is_err());
    assert!(c.distribute(7).is_err());
}

#[test]
fn una_junta_necesita_cuota_y_periodo() {
    let vm = TestVM::default();
    let mut c = Junta::from(&vm);
    c.constructor(TOKEN);

    assert!(c
        .create_junta(
            "Sin cuota".into(),
            alloc::vec![miembro(1)],
            U256::ZERO,
            PERIODO
        )
        .is_err());
    assert!(c
        .create_junta(
            "Sin periodo".into(),
            alloc::vec![miembro(1)],
            U256::from(CUOTA),
            0
        )
        .is_err());
}

#[test]
fn cada_junta_lleva_su_propia_cuenta() {
    // El contrato alberga muchas juntas y el historial es del par (junta, miembro), así
    // que lo que pasa en una no puede contaminar a la otra.
    let (vm, mut c, m) = junta_de(4);
    c.create_junta(
        "La lenta".into(),
        m.clone(),
        U256::from(CUOTA),
        PERIODO * 10,
    )
    .unwrap();
    c.arrancar(1).unwrap();

    vm.set_block_timestamp(INICIO + 3 * PERIODO);

    let (_, _, _, en_la_rapida, _, _, _, _) = c.history(0, m[0]);
    let (_, _, _, en_la_lenta, _, _, _, _) = c.history(1, m[0]);

    assert_eq!(en_la_rapida, 3);
    assert_eq!(en_la_lenta, 0, "sus ciclos duran diez veces más");
}

// =====================================================================================
// La disputa es la única señal que alguien escribe a mano, y por eso la única fabricable
//
// Las otras siete salen de un depósito o del reloj, así que nadie puede inventarlas. Esta
// depende de que alguien la reporte, y cada prueba de aquí abajo sujeta una de las tres
// guardas que la atan al juicio del grupo (ADR-0013). La medida del agujero que cerraron:
// `disputas_perdidas` pesa +1.8159 sobre un dominio que topa en 5, y el score reparte los
// log-odds sobre un ancho de 12 — unos 30 puntos por reporte, ~151 al saturar.
// =====================================================================================

#[test]
fn las_disputas_se_acumulan_por_miembro() {
    // El camino feliz: dos miembros distintos coinciden en señalar al mismo y la señal
    // suma dos. Es exactamente lo que la vuelve el juicio del grupo y no el de una
    // dirección.
    let (vm, mut c, m) = junta_de(4);

    vm.set_sender(m[0]);
    c.report_dispute(0, m[2]).unwrap();
    vm.set_sender(m[1]);
    c.report_dispute(0, m[2]).unwrap();

    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[2]);
    assert_eq!(disputas, 2);
    let (_, _, _, _, _, _, _, otro) = c.history(0, m[1]);
    assert_eq!(otro, 0, "la disputa es de quien la perdió, no de la junta");
}

#[test]
fn un_extrano_no_puede_reportar_a_nadie() {
    // El agujero original: se validaba que el reportado fuera miembro, nunca quién
    // llamaba. Cualquier dirección del mundo podía hundir el score de cualquier miembro
    // por el precio del gas.
    let (vm, mut c, m) = junta_de(4);
    let forastero = miembro(200);
    vm.set_sender(forastero);

    match c.report_dispute(0, m[2]) {
        Err(JuntaError::NoEsMiembro(e)) => assert_eq!(
            e.quien, forastero,
            "el error señala al llamante, que es quien está de más"
        ),
        otro => panic!("quien no está en la junta no presenció nada: {otro:?}"),
    }

    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[2]);
    assert_eq!(disputas, 0, "no se escribió nada");
}

#[test]
fn nadie_puede_reportarse_a_si_mismo() {
    // Una disputa la pierde alguien contra alguien. Sin esta guarda, además, un atacante
    // podría gastar su propio cupo contra sí mismo y aparecer como reportante limpio.
    let (vm, mut c, m) = junta_de(4);
    vm.set_sender(m[1]);

    match c.report_dispute(0, m[1]) {
        Err(JuntaError::NoPuedeReportarseASiMismo(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.quien, m[1]);
        }
        otro => panic!("no hay disputa de alguien contra sí mismo: {otro:?}"),
    }

    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[1]);
    assert_eq!(disputas, 0);
}

#[test]
fn un_reportante_cuenta_una_sola_vez_por_reportado() {
    let (vm, mut c, m) = junta_de(4);
    vm.set_sender(m[0]);
    c.report_dispute(0, m[2]).unwrap();

    match c.report_dispute(0, m[2]) {
        Err(JuntaError::YaReporto(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.reportante, m[0]);
            assert_eq!(e.member, m[2]);
        }
        otro => panic!("el segundo reporte del mismo miembro no cuenta: {otro:?}"),
    }

    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[2]);
    assert_eq!(disputas, 1, "quedó el único juicio que de verdad hubo");
}

#[test]
fn un_solo_miembro_ya_no_puede_saturar_la_senal() {
    // Esta es la prueba del ataque completo. Cinco reportes seguidos llevaban la señal a
    // su tope y le costaban a la víctima unos 151 puntos: de sobra para tumbarla de 550 a
    // 399 y dejarla sin línea de crédito. Ahora un miembro vale un reporte.
    let (vm, mut c, m) = junta_de(8);
    vm.set_sender(m[0]);

    c.report_dispute(0, m[7]).unwrap();
    for _ in 0..4 {
        assert!(c.report_dispute(0, m[7]).is_err());
    }

    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[7]);
    assert_eq!(disputas, 1, "hace falta el grupo para saturar la señal");
}

#[test]
fn el_mismo_reportante_puede_reportar_a_otro_miembro() {
    // El cupo es por reportado, no por reportante: quien presenció dos disputas distintas
    // puede reportar las dos.
    let (vm, mut c, m) = junta_de(4);
    vm.set_sender(m[0]);
    c.report_dispute(0, m[1]).unwrap();
    c.report_dispute(0, m[2]).unwrap();

    let (_, _, _, _, _, _, _, una) = c.history(0, m[1]);
    let (_, _, _, _, _, _, _, otra) = c.history(0, m[2]);
    assert_eq!(una, 1);
    assert_eq!(otra, 1);
}

#[test]
fn haber_reportado_en_una_junta_no_gasta_el_reporte_de_la_otra() {
    // El historial es del par (junta, miembro): dos personas que comparten dos juntas
    // pueden perder una disputa en cada una, y son hechos distintos.
    let (vm, mut c, m) = junta_de(4);
    c.create_junta(
        "Los del Mercado".into(),
        m.clone(),
        U256::from(CUOTA),
        PERIODO,
    )
    .unwrap();
    c.arrancar(1).unwrap();

    vm.set_sender(m[0]);
    c.report_dispute(0, m[2]).unwrap();
    c.report_dispute(1, m[2]).unwrap();

    let (_, _, _, _, _, _, _, en_la_primera) = c.history(0, m[2]);
    let (_, _, _, _, _, _, _, en_la_segunda) = c.history(1, m[2]);
    assert_eq!(en_la_primera, 1);
    assert_eq!(en_la_segunda, 1);
}

#[test]
fn no_se_le_puede_perder_una_disputa_a_quien_no_esta_en_la_junta() {
    let (vm, mut c, m) = junta_de(4);
    let forastero = miembro(200);
    vm.set_sender(m[0]);

    match c.report_dispute(0, forastero) {
        Err(JuntaError::NoEsMiembro(e)) => assert_eq!(
            e.quien, forastero,
            "aquí el que está de más es el reportado"
        ),
        otro => panic!("el reportado tiene que pertenecer a la junta: {otro:?}"),
    }
}

#[test]
fn no_se_puede_reportar_en_una_junta_que_no_existe() {
    let (vm, mut c, m) = junta_de(4);
    vm.set_sender(m[0]);
    assert!(c.report_dispute(7, m[1]).is_err());
}

#[test]
fn la_vista_dice_si_el_boton_va_deshabilitado() {
    // Sin esta consulta la aplicación solo sabe ofrecer un botón que falla, y el usuario
    // paga gas para enterarse de una regla que el contrato ya conocía.
    let (vm, mut c, m) = junta_de(4);
    assert!(!c.ya_reporto(0, m[0], m[2]));

    vm.set_sender(m[0]);
    c.report_dispute(0, m[2]).unwrap();

    assert!(c.ya_reporto(0, m[0], m[2]));
    assert!(
        !c.ya_reporto(0, m[1], m[2]),
        "la huella es de cada reportante"
    );
    assert!(!c.ya_reporto(0, m[0], m[1]), "y de cada reportado");
    assert!(!c.ya_reporto(1, m[0], m[2]), "y de cada junta");
}

// =====================================================================================
// Lo que una aplicación necesita saber
// =====================================================================================

#[test]
fn la_junta_recuerda_con_que_parametros_nacio() {
    // Sin esto, una interfaz no puede decirle a nadie cuánto debe pagar ni cuándo vence,
    // que son las dos preguntas que cualquiera se hace antes que ninguna otra.
    let (_vm, c, _m) = junta_de(8);
    let (cuota, periodo, inicio, miembros, existe) = c.junta_params(0);

    assert_eq!(c.junta_nombre(0), "Las Emprendedoras");
    assert_eq!(cuota, U256::from(CUOTA));
    assert_eq!(periodo, PERIODO);
    assert_eq!(inicio, INICIO);
    assert_eq!(miembros, 8);
    assert!(existe);
}

#[test]
fn una_junta_inexistente_se_reconoce_como_tal() {
    let (_vm, c, _m) = junta_de(4);
    let (_, _, _, _, existe) = c.junta_params(99);
    assert!(!existe);
}

#[test]
fn cada_miembro_puede_saber_en_que_juntas_esta() {
    // Es la primera pantalla de la aplicación. Deducirlo recorriendo todas las juntas
    // costaría una lectura por cada una que exista en el contrato.
    let (_vm, mut c, m) = junta_de(4);
    c.create_junta(
        "Los del Mercado".into(),
        alloc::vec![m[0], m[1]],
        U256::from(CUOTA),
        PERIODO,
    )
    .unwrap();

    assert_eq!(c.juntas_de(m[0]), alloc::vec![0, 1], "está en las dos");
    assert_eq!(c.juntas_de(m[2]), alloc::vec![0], "solo en la primera");
    assert!(
        c.juntas_de(miembro(200)).is_empty(),
        "quien no pertenece a ninguna no ve ninguna"
    );
}

#[test]
fn el_estado_de_un_miembro_dice_si_le_toca_pagar() {
    let (vm, c, m) = junta_de(4);

    let (es_miembro, pagadas, turno, ya_cobro, debe) = c.member_state(0, m[2]);
    assert!(es_miembro);
    assert_eq!(pagadas, 0);
    assert_eq!(turno, 2, "su turno es su posición en la lista");
    assert!(!ya_cobro);
    assert_eq!(debe, 0, "todavía no vence ningún ciclo");

    vm.set_block_timestamp(INICIO + 2 * PERIODO);
    let (_, _, _, _, debe_despues) = c.member_state(0, m[2]);
    assert_eq!(debe_despues, 2, "dos ciclos vencidos sin pagar");
}

#[test]
fn quien_no_es_miembro_se_distingue_del_que_si() {
    let (_vm, c, _m) = junta_de(4);
    let (es_miembro, _, turno, _, _) = c.member_state(0, miembro(200));
    assert!(!es_miembro);
    assert_eq!(turno, u32::MAX, "no tiene turno asignado");
}

// =====================================================================================
// La convocatoria: una junta se arma reclutando, y la lista se congela al arrancar
//
// `miembros.len()` es el total de ciclos de la junta, así que admitir a alguien con el
// reloj andando cambiaría hacia atrás los defaults y la tasa de cumplimiento de todos los
// demás. De ahí las dos fases: mientras `start_at` es cero se recluta y no pasa nada más;
// desde que deja de serlo la lista está cerrada para siempre (ADR-0015).
// =====================================================================================

#[test]
fn una_junta_nace_reclutando_y_sin_reloj() {
    // Cero no es una fecha: es la única señal de que la junta todavía admite gente. Si
    // `create_junta` volviera a arrancar el reloj sola, quien no fue listado de antemano no
    // podría entrar nunca.
    let (_vm, c, m) = convocatoria_de(3);
    let (_, _, inicio, miembros, existe) = c.junta_params(0);

    assert!(existe);
    assert_eq!(inicio, 0, "está en convocatoria");
    assert_eq!(miembros, 3);
    assert_eq!(c.creador_de(0), m[0], "convocó el primero de la lista");
}

#[test]
fn quien_convoca_queda_dentro_aunque_no_liste_a_nadie() {
    // Nadie arma una junta para quedarse afuera de ella, y exigir que se liste a sí mismo
    // sería pedirle que declare lo que ya dijo al firmar la transacción.
    let vm = TestVM::default();
    vm.set_block_timestamp(INICIO);
    let mut c = Junta::from(&vm);
    c.constructor(TOKEN);
    vm.set_sender(miembro(1));

    c.create_junta(
        "Todavía nadie".into(),
        alloc::vec![],
        U256::from(CUOTA),
        PERIODO,
    )
    .unwrap();

    assert_eq!(c.miembros(0), alloc::vec![miembro(1)]);
    assert_eq!(c.juntas_de(miembro(1)), alloc::vec![0]);
    let (es_miembro, _, turno, _, _) = c.member_state(0, miembro(1));
    assert!(es_miembro);
    assert_eq!(turno, 0, "quien convoca cobra primero");
}

#[test]
fn una_direccion_repetida_no_ocupa_dos_turnos() {
    // La aplicación manda la lista con el creador adelante, así que la repetición es el
    // caso normal y no un abuso. Lo que no puede pasar es que una persona ocupe dos turnos
    // debiendo una sola cuota: cobraría dos pozos.
    let vm = TestVM::default();
    vm.set_block_timestamp(INICIO);
    let mut c = Junta::from(&vm);
    c.constructor(TOKEN);
    vm.set_sender(miembro(1));

    c.create_junta(
        "Con dedazo".into(),
        alloc::vec![miembro(1), miembro(2), miembro(2)],
        U256::from(CUOTA),
        PERIODO,
    )
    .unwrap();

    assert_eq!(c.miembros(0), alloc::vec![miembro(1), miembro(2)]);
    assert_eq!(
        c.juntas_de(miembro(2)),
        alloc::vec![0],
        "tampoco aparece dos veces en su propio índice"
    );
}

#[test]
fn el_turno_es_el_orden_de_llegada() {
    // El orden de cobro no necesita sorteo ni árbitro: quien llegó antes cobra antes, y eso
    // cualquiera lo puede verificar mirando el evento de su propia entrada.
    let (vm, mut c, m) = convocatoria_de(1);
    let tarde = miembro(50);
    let mas_tarde = miembro(51);

    vm.set_sender(tarde);
    assert_eq!(c.unirse(0).unwrap(), 1);
    vm.set_sender(mas_tarde);
    assert_eq!(c.unirse(0).unwrap(), 2);

    assert_eq!(c.miembros(0), alloc::vec![m[0], tarde, mas_tarde]);
    assert_eq!(
        c.juntas_de(tarde),
        alloc::vec![0],
        "unirse también lo pone en su lista de juntas"
    );
    let (es_miembro, _, turno, _, _) = c.member_state(0, mas_tarde);
    assert!(es_miembro);
    assert_eq!(turno, 2);
}

#[test]
fn nadie_entra_dos_veces_a_la_misma_junta() {
    // Sin esta guarda, entrar dos veces daría dos turnos —dos pozos— por una sola cuota.
    let (vm, mut c, m) = convocatoria_de(2);
    vm.set_sender(m[1]);

    match c.unirse(0) {
        Err(JuntaError::YaEsMiembro(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.quien, m[1]);
        }
        otro => panic!("ya estaba en la lista: {otro:?}"),
    }
    assert_eq!(c.miembros(0).len(), 2, "la lista no creció");
}

#[test]
fn quien_convoca_no_puede_unirse_a_su_propia_junta() {
    // El creador entra solo al convocar, así que `unirse` es su segunda entrada. Sin la
    // guarda ocuparía dos turnos por una cuota y su junta aparecería duplicada en
    // `juntas_de`, que es la lista con la que la aplicación arma la primera pantalla.
    let (vm, mut c, m) = convocatoria_de(2);
    vm.set_sender(m[0]);

    match c.unirse(0) {
        Err(JuntaError::YaEsMiembro(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.quien, m[0]);
        }
        otro => panic!("convocar ya lo metió dentro: {otro:?}"),
    }

    assert_eq!(c.miembros(0), alloc::vec![m[0], m[1]], "la lista no cambió");
    assert_eq!(
        c.juntas_de(m[0]),
        alloc::vec![0],
        "ni el índice inverso creció"
    );
}

#[test]
fn no_se_arranca_una_junta_que_no_existe() {
    // El orden de las guardas importa: el creador de una junta inexistente es la dirección
    // cero, así que sin comprobar primero que existe, el error hablaría de permisos —
    // `NoEsElCreador`— sobre algo que ni siquiera está ahí.
    let (vm, mut c, _m) = convocatoria_de(2);
    vm.set_sender(miembro(50));

    match c.arrancar(7) {
        Err(JuntaError::JuntaNoExiste(e)) => assert_eq!(e.juntaId, 7),
        otro => panic!("no hay junta 7 que arrancar: {otro:?}"),
    }
}

#[test]
fn a_una_junta_en_marcha_ya_no_entra_nadie() {
    // El corazón del diseño. `miembros.len()` es el total de ciclos: si entrara alguien con
    // el reloj andando, el tope de `ciclos_transcurridos` subiría y con él los defaults y la
    // tasa de cumplimiento de gente que no hizo absolutamente nada. Sería reescribir el
    // historial ya vivido de terceros.
    let (vm, mut c, m) = junta_de(4);
    vm.set_block_timestamp(INICIO + 2 * PERIODO);

    let (_, _, _, defaults_antes, _, _, antiguedad_antes, _) = c.history(0, m[3]);

    vm.set_sender(miembro(50));
    match c.unirse(0) {
        Err(JuntaError::JuntaYaArrancada(e)) => assert_eq!(e.juntaId, 0),
        otro => panic!("la lista se congela al arrancar: {otro:?}"),
    }

    let (_, _, _, defaults_despues, _, _, antiguedad_despues, _) = c.history(0, m[3]);
    assert_eq!(defaults_antes, defaults_despues);
    assert_eq!(antiguedad_antes, antiguedad_despues);
    assert_eq!(c.miembros(0).len(), 4);
}

#[test]
fn no_se_entra_a_una_junta_que_no_existe() {
    let (vm, mut c, _m) = convocatoria_de(2);
    vm.set_sender(miembro(50));
    assert!(c.unirse(7).is_err());
}

#[test]
fn solo_quien_convoco_puede_arrancar() {
    // Arrancar congela la lista y prende el reloj de todos: es la única decisión de este
    // contrato que no se deriva de un hecho, así que tiene dueño.
    let (vm, mut c, m) = convocatoria_de(4);
    vm.set_sender(m[2]);

    match c.arrancar(0) {
        Err(JuntaError::NoEsElCreador(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.quien, m[2]);
        }
        otro => panic!("un miembro cualquiera no cierra la convocatoria: {otro:?}"),
    }

    let (_, _, inicio, _, _) = c.junta_params(0);
    assert_eq!(inicio, 0, "sigue reclutando");
}

#[test]
fn una_junta_de_una_sola_persona_no_arranca() {
    // Con un solo miembro la junta tendría un ciclo y esa persona se pagaría su propio pozo.
    // No es una junta, y el historial que produciría no significa nada.
    let (_vm, mut c, _m) = convocatoria_de(1);

    match c.arrancar(0) {
        Err(JuntaError::FaltanMiembros(e)) => {
            assert_eq!(e.juntaId, 0);
            assert_eq!(e.miembros, 1);
        }
        otro => panic!("hacen falta dos para una junta: {otro:?}"),
    }
}

#[test]
fn una_junta_no_arranca_dos_veces() {
    // Arrancar de nuevo movería `start_at` hacia adelante y borraría de un plumazo los
    // ciclos ya vencidos: todos los defaults acumulados desaparecerían.
    let (vm, mut c, _m) = junta_de(4);
    vm.set_block_timestamp(INICIO + 3 * PERIODO);

    match c.arrancar(0) {
        Err(JuntaError::JuntaYaArrancada(e)) => assert_eq!(e.juntaId, 0),
        otro => panic!("el reloj se prende una sola vez: {otro:?}"),
    }

    let (_, _, inicio, _, _) = c.junta_params(0);
    assert_eq!(inicio, INICIO, "el arranque original quedó intacto");
}

#[test]
fn el_reloj_empieza_al_arrancar_y_no_al_convocar() {
    // Reclutar puede tomar días. Si el reloj contara desde la convocatoria, la junta
    // arrancaría con ciclos ya vencidos y todos deberían cuotas de un tiempo en que ni
    // siquiera se sabía quiénes eran.
    let (vm, mut c, m) = convocatoria_de(4);
    vm.set_block_timestamp(INICIO + 100 * PERIODO);
    c.arrancar(0).unwrap();

    let (_, _, inicio, _, _) = c.junta_params(0);
    assert_eq!(inicio, INICIO + 100 * PERIODO);

    let (_, _, _, defaults, _, _, antiguedad, _) = c.history(0, m[1]);
    assert_eq!(defaults, 0, "recién arranca: nadie debe nada");
    assert_eq!(antiguedad, 0);

    vm.set_block_timestamp(INICIO + 102 * PERIODO);
    let (_, _, _, dos_ciclos_despues, _, _, _, _) = c.history(0, m[1]);
    assert_eq!(dos_ciclos_despues, 2, "el reloj cuenta desde el arranque");
}

#[test]
fn en_convocatoria_nadie_nace_en_mora() {
    // Sin la rama que lee el cero como "todavía no arranca", la resta contra el reloj de la
    // cadena lo tomaría como enero de 1970: medio siglo de ciclos vencidos, topados al
    // tamaño de la junta, para gente que acaba de entrar.
    let (vm, c, m) = convocatoria_de(4);
    vm.set_block_timestamp(INICIO + 10_000 * PERIODO);

    let (tasa, _, _, defaults, _, _, antiguedad, _) = c.history(0, m[0]);
    assert_eq!(defaults, 0, "no ha vencido una sola cuota");
    assert_eq!(antiguedad, 0);
    assert_eq!(tasa, I128::try_from(SCALE).unwrap());

    let (ciclo, pagadas, total) = c.cycle_coverage(0);
    assert_eq!((ciclo, pagadas, total), (0, 0, 4));
    let (_, _, _, _, debe) = c.member_state(0, m[0]);
    assert_eq!(debe, 0);
}

#[test]
fn antes_de_arrancar_no_se_mueve_dinero_ni_se_juzga_a_nadie() {
    // Las tres puertas por las que entra el mundo real. Mientras la junta recluta no hay
    // plazos que cumplir, ni rueda que repartir, ni convivencia de la que puedan salir
    // disputas: lo único que se puede hacer es entrar.
    let (vm, mut c, m) = convocatoria_de(3);
    vm.set_sender(m[0]);

    match c.deposit(0) {
        Err(JuntaError::JuntaNoArrancada(e)) => assert_eq!(e.juntaId, 0),
        otro => panic!("no hay cuota que pagar todavía: {otro:?}"),
    }
    match c.distribute(0) {
        Err(JuntaError::JuntaNoArrancada(e)) => assert_eq!(e.juntaId, 0),
        otro => panic!("no hay turno que cobrar todavía: {otro:?}"),
    }
    match c.report_dispute(0, m[1]) {
        Err(JuntaError::JuntaNoArrancada(e)) => assert_eq!(e.juntaId, 0),
        otro => panic!("no ha pasado nada entre ellos todavía: {otro:?}"),
    }

    let (pozo, _, _, _, aportado, distribuido) = c.junta_state(0);
    assert_eq!(
        (pozo, aportado, distribuido),
        (U256::ZERO, U256::ZERO, U256::ZERO)
    );
    let (_, _, _, _, _, _, _, disputas) = c.history(0, m[1]);
    assert_eq!(disputas, 0, "no se escribió nada");
}

#[test]
fn el_camino_completo_de_una_junta_reclutada() {
    // Convocar con una sola persona, que lleguen dos, arrancar y pagar. Es el recorrido que
    // hace una junta de verdad, y lo que se comprueba en cada paso es que la fase anterior
    // dejó al contrato en el estado que la siguiente necesita.
    let (vm, mut c, m) = convocatoria_de(1);
    let segunda = miembro(50);
    let tercera = miembro(51);

    vm.set_sender(segunda);
    c.unirse(0).unwrap();
    vm.set_sender(tercera);
    c.unirse(0).unwrap();

    // Depositar antes de arrancar no llega ni a mirar quién es el llamante.
    assert!(matches!(c.deposit(0), Err(JuntaError::JuntaNoArrancada(_))));

    vm.set_sender(m[0]);
    c.arrancar(0).unwrap();

    let (_, periodo, inicio, miembros, existe) = c.junta_params(0);
    assert!(existe);
    assert_eq!(miembros, 3, "el total de ciclos quedó congelado en tres");
    assert_eq!(inicio, INICIO);
    assert_eq!(periodo, PERIODO);

    // Y aquí el depósito ya cruza la guarda de fase y llega hasta el token. Ese último
    // tramo no se puede simular —una llamada mutante a otro contrato esquiva al TestVM, ver
    // la nota de arriba—, así que el error que vuelve es el de la transferencia y no el de
    // la junta: la prueba de que el dinero se mueve vive en la cadena local.
    vm.set_sender(tercera);
    assert!(
        matches!(c.deposit(0), Err(JuntaError::TransferenciaFallida(_))),
        "arrancada, la cuota llega hasta el token"
    );
}
