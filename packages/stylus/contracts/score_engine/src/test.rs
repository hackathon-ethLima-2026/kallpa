//! Pruebas del ScoreEngine.
//!
//! La mayoría ejercen `calcular_score` directamente, que es donde vive el modelo. Las que
//! tocan el contrato simulan la respuesta de la Junta: esa es una lectura, así que se puede
//! interceptar (a diferencia de las escrituras, ver el módulo de pruebas de la Junta).
//!
//! La última prueba escribe un archivo con vectores y sus scores para que el espejo en
//! Python lo verifique. Ese cruce es el que sostiene la afirmación de que el score es
//! reproducible fuera de la cadena.
//!
//! ## Lo que NO cubren estas pruebas, y por qué
//!
//! La llamada a `EAS.attest` es una escritura entre contratos. En el SDK 0.9 esas llamadas
//! no pasan por la abstracción de VM —`CallAccess::call` exigiría `&self` y `&mut self` a la
//! vez—, así que van por la vía cruda y **no hay dónde interceptarlas**: no existe forma de
//! simular un EAS que devuelva un UID. Ninguna prueba de aquí demuestra que una attestation
//! real se creó; eso se comprueba contra la cadena con `EAS.getAttestation(uid)`
//! (docs/eas-arbitrum-sepolia.md §1).
//!
//! Lo que sí queda cubierto es todo lo que puede estar mal **antes** de que los bytes salgan:
//! el selector, los 160 bytes del payload, el compromiso con las señales, el recomputo en
//! vivo, la persistencia del UID y el camino de error cuando EAS no devuelve nada.

use super::*;
use stylus_sdk::testing::*;

const JUNTA: Address = Address::new([7u8; 20]);
const MARIA: Address = Address::new([1u8; 20]);

/// EAS en Arbitrum Sepolia, verificado contra la cadena (docs/eas-arbitrum-sepolia.md §1).
///
/// Se escribe con la mayúsculas y minúsculas de su suma de comprobación para poder cotejarla
/// carácter a carácter contra el documento y contra Arbiscan.
const EAS: Address =
    stylus_sdk::alloy_primitives::address!("2521021fc8BF070473E1e1801D3c7B4aB701E1dE");

/// UID previsto de nuestro schema (§6.5), keccak del string crudo con sus espacios.
const SCHEMA_UID: FixedBytes<32> =
    b256!("e1cd6720370dd3b885c72ea22f914a04f39d941bd951f151d97eb616dc17c78a");

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

/// La respuesta que daría `juntasDe`: un arreglo dinámico de `uint32`.
///
/// Se arma a mano —desplazamiento, longitud y valores— porque estos son exactamente los
/// bytes que el contrato tiene que saber recorrer.
fn respuesta_de_juntas(ids: &[u32]) -> Vec<u8> {
    let mut salida = Vec::with_capacity((2 + ids.len()) * 32);
    salida.extend_from_slice(&palabra(0x20)); // dónde empieza el arreglo
    salida.extend_from_slice(&palabra(ids.len() as i128));
    for id in ids.iter() {
        salida.extend_from_slice(&palabra(i128::from(*id)));
    }
    salida
}

fn motor_con(features: [i128; 8]) -> (TestVM, ScoreEngine) {
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA, EAS, SCHEMA_UID);

    let datos = historyCall {
        juntaId: 0,
        member: MARIA,
    }
    .abi_encode();
    vm.mock_static_call(JUNTA, datos, Ok(respuesta_de_junta(features)));
    (vm, motor)
}

/// Un motor que ve a María en varias juntas, cada una con su historial.
fn motor_con_juntas(historias: &[(u32, [i128; 8])]) -> (TestVM, ScoreEngine) {
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA, EAS, SCHEMA_UID);

    let ids: Vec<u32> = historias.iter().map(|(id, _)| *id).collect();
    vm.mock_static_call(
        JUNTA,
        juntasDeCall { member: MARIA }.abi_encode(),
        Ok(respuesta_de_juntas(&ids)),
    );

    for (id, features) in historias.iter() {
        vm.mock_static_call(
            JUNTA,
            historyCall {
                juntaId: *id,
                member: MARIA,
            }
            .abi_encode(),
            Ok(respuesta_de_junta(*features)),
        );
    }
    (vm, motor)
}

/// Un miembro impecable: cumplió todo, nunca se atrasó, nunca incumplió.
const IMPECABLE: [i128; 8] = [SCALE, 8, 0, 0, 0, 0, 8, 0];

/// Alguien que cobró el pozo y dejó de aportar: el riesgo clásico de una junta.
const SE_LLEVO_EL_POZO: [i128; 8] = [250_000, 2, 0, 6, 0, 6, 8, 0];

/// Junta recién arrancada, sin ningún ciclo vencido: no hay nada que observar todavía.
const SIN_CICLOS: [i128; 8] = [SCALE, 0, 0, 0, 0, 0, 0, 0];

/// Un ciclo vencido y cumplido. Buen comportamiento, pero demasiado poco para prestar.
const JOVEN_Y_LIMPIA: [i128; 8] = [SCALE, 1, 0, 0, 0, 0, 1, 0];

/// Dos ciclos vencidos y cumplidos: sigue sin llegar al historial mínimo.
const JOVEN_Y_LIMPIA_DOS_CICLOS: [i128; 8] = [SCALE, 2, 0, 0, 0, 0, 2, 0];

/// Junta nueva, cobrada e incumplida de inmediato. Es la puerta que cierra ADR-0014: si las
/// juntas jóvenes no contaran, abrir una y dejarla caer saldría gratis.
const JOVEN_E_INCUMPLIDA: [i128; 8] = [0, 0, 0, 1, 0, 1, 1, 0];

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
    motor.constructor(JUNTA, EAS, SCHEMA_UID);
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
// El score global: todas las juntas del miembro, no la que él elija
// =====================================================================================

#[test]
fn sin_juntas_no_hay_nada_que_puntuar() {
    // Cero no significa "pésimo" sino "no sé", y por eso viaja acompañado del conteo: quien
    // llama distingue "peor score cero" de "cero juntas miradas" sin adivinar.
    let (_vm, motor) = motor_con_juntas(&[]);
    assert_eq!(motor.score_global(MARIA).unwrap(), (0, false, 0));
}

#[test]
fn una_junta_con_historial_suficiente_da_credito() {
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert_eq!(peor, calcular_score(IMPECABLE));
    assert!(con_credito);
    assert_eq!(evaluadas, 1);
}

#[test]
fn la_junta_incumplida_manda_sobre_la_impecable() {
    // El agujero que esto cierra: la misma dirección puntúa altísimo en una junta y por el
    // suelo en otra. Mientras el solicitante elija la junta, elige también su veredicto.
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE), (1, SE_LLEVO_EL_POZO)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert_eq!(peor, calcular_score(SE_LLEVO_EL_POZO));
    assert!(!con_credito, "está en mora en una junta: no hay crédito");
    assert_eq!(evaluadas, 2);
}

#[test]
fn el_orden_de_las_juntas_no_cambia_el_veredicto() {
    // Si el resultado dependiera del orden del índice, el miembro podría influirlo con el
    // orden en que se une a las juntas.
    let primero = motor_con_juntas(&[(0, IMPECABLE), (1, SE_LLEVO_EL_POZO)])
        .1
        .score_global(MARIA)
        .unwrap();
    let invertido = motor_con_juntas(&[(1, SE_LLEVO_EL_POZO), (0, IMPECABLE)])
        .1
        .score_global(MARIA)
        .unwrap();
    assert_eq!(primero, invertido);
}

#[test]
fn juntas_todas_jovenes_puntuan_pero_no_prestan() {
    // Se evalúan (el número que devuelven es real y la interfaz puede mostrarlo), pero
    // ninguna llega al historial mínimo, así que el crédito sigue cerrado (ADR-0011).
    let (_vm, motor) = motor_con_juntas(&[(0, JOVEN_Y_LIMPIA), (1, JOVEN_Y_LIMPIA_DOS_CICLOS)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert!(peor >= UMBRAL_POSITIVO, "el modelo las puntúa bien: {peor}");
    assert!(!con_credito, "ninguna junta llega a los ciclos mínimos");
    assert_eq!(evaluadas, 2);
}

#[test]
fn una_junta_joven_incumplida_tumba_el_credito_de_la_madura() {
    // Sin esto, la evasión sería trivial: abro una junta nueva, la incumplo, y como es joven
    // no cuenta. La junta joven no APRUEBA crédito, pero su incumplimiento sí lo niega.
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE), (1, JOVEN_E_INCUMPLIDA)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert_eq!(peor, calcular_score(JOVEN_E_INCUMPLIDA));
    assert!(
        peor < UMBRAL_POSITIVO,
        "el historial joven e incumplido puntúa {peor}, esperaba < {UMBRAL_POSITIVO}"
    );
    assert!(!con_credito);
    assert_eq!(evaluadas, 2);
}

#[test]
fn una_junta_sin_ciclos_vencidos_no_se_evalua() {
    // Todavía no venció ninguna cuota: no hay evidencia ni a favor ni en contra, y contarla
    // sería tratar "no sé" como un dato.
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE), (1, SIN_CICLOS)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert_eq!(evaluadas, 1, "solo la junta con ciclos vencidos cuenta");
    assert_eq!(peor, calcular_score(IMPECABLE));
    assert!(con_credito);
}

#[test]
fn solo_una_junta_necesita_el_historial_minimo() {
    // ADR-0011 pide que exista comportamiento observado en alguna parte, no en todas. La
    // junta joven aporta su score al mínimo, pero no bloquea el crédito por ser joven.
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE), (1, JOVEN_Y_LIMPIA)]);
    let (peor, con_credito, evaluadas) = motor.score_global(MARIA).unwrap();

    assert_eq!(peor, calcular_score(JOVEN_Y_LIMPIA));
    assert!(con_credito, "la junta madura aporta el historial exigido");
    assert_eq!(evaluadas, 2);
}

#[test]
fn si_la_lista_de_juntas_no_responde_falla_en_vez_de_dar_credito() {
    // Sin mock no hay respuesta. Tratar el fallo como "no tiene juntas" devolvería un
    // veredicto silencioso sobre alguien de quien no se leyó nada.
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA, EAS, SCHEMA_UID);
    assert!(motor.score_global(MARIA).is_err());
}

#[test]
fn si_una_junta_de_la_lista_no_responde_falla() {
    // La lista dice que está en la junta 1, pero su historial no se puede leer. Saltársela
    // dejaría fuera justo la junta que quizá la condena.
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA, EAS, SCHEMA_UID);

    vm.mock_static_call(
        JUNTA,
        juntasDeCall { member: MARIA }.abi_encode(),
        Ok(respuesta_de_juntas(&[0, 1])),
    );
    vm.mock_static_call(
        JUNTA,
        historyCall {
            juntaId: 0,
            member: MARIA,
        }
        .abi_encode(),
        Ok(respuesta_de_junta(IMPECABLE)),
    );

    assert!(motor.score_global(MARIA).is_err());
}

#[test]
fn el_score_por_junta_sigue_siendo_por_junta() {
    // El score global no reemplaza a `compute_score`: mostrar "tu score en esta junta" sigue
    // siendo una pregunta legítima. Lo que deja de ser legítimo es prestar con esa respuesta.
    let (_vm, motor) = motor_con_juntas(&[(0, IMPECABLE), (1, SE_LLEVO_EL_POZO)]);

    assert_eq!(
        motor.compute_score(0, MARIA).unwrap(),
        calcular_score(IMPECABLE)
    );
    assert!(motor.is_positive(0, MARIA).unwrap());
    assert!(!motor.is_positive(1, MARIA).unwrap());
}

// =====================================================================================
// La attestation EAS
//
// La llamada en sí no se puede simular (ver la cabecera). Lo que se prueba aquí es todo lo
// que la precede y la determina: el selector, los bytes que viajan, el compromiso con las
// señales, el recomputo en vivo y los dos caminos de error.
// =====================================================================================

#[test]
fn el_selector_de_attest_es_el_que_espera_eas() {
    // Cuatro bytes verificados contra el EAS desplegado en Arbitrum Sepolia. Se calculan
    // sobre la forma completa de los structs anidados, así que esta aserción de una línea
    // detecta cualquier cambio en `AttestationRequest` — que es justo el error que no se ve
    // venir: un campo de menos produce otro selector y la llamada falla sin decir por qué.
    assert_eq!(attestCall::SELECTOR, [0xf1, 0x73, 0x25, 0xe7]);
}

#[test]
fn el_payload_del_schema_son_cinco_palabras_planas() {
    // Los cinco campos del §6.5 son de tamaño fijo, así que ocupan 160 bytes seguidos y cada
    // uno se puede leer en su sitio. Si alguna vez el schema recibe un `string` o un `bytes`,
    // esta prueba se cae — y tiene que caerse, porque en ese momento dejaría de ser cierto
    // que la attestation se verifica a ojo.
    let compromiso = FixedBytes::<32>::from([0x22u8; 32]);
    let payload = payload_del_schema(1000, true, 7, compromiso);

    assert_eq!(payload.len(), 160, "cinco palabras, sin desplazamientos");

    let palabra_n = |n: usize| &payload[n * 32..(n + 1) * 32];
    assert_eq!(palabra_n(0), &palabra(1000), "uint16 score");
    assert_eq!(palabra_n(1), &palabra(1), "bool positive");
    assert_eq!(palabra_n(2), &palabra(7), "uint32 juntaId");
    assert_eq!(
        palabra_n(3),
        MODEL_HASH_BYTES.as_slice(),
        "bytes32 modelHash"
    );
    assert_eq!(palabra_n(4), compromiso.as_slice(), "bytes32 commitment");
}

#[test]
fn la_reputacion_negativa_viaja_como_falso_en_el_payload() {
    // El campo `positive` es lo que un prestamista de afuera va a mirar primero. Codificarlo
    // al revés no rompería nada visible: los 160 bytes seguirían siendo válidos.
    let payload = payload_del_schema(194, false, 0, FixedBytes::<32>::ZERO);
    assert_eq!(&payload[32..64], &palabra(0));
}

#[test]
fn el_model_hash_existe_dos_veces_y_las_dos_tienen_que_coincidir() {
    // `weights::MODEL_HASH` es texto porque lo expone `model_hash()` al frente; el schema
    // pide `bytes32`. Nada las sincroniza: si `quantize.py` emite un modelo nuevo y solo se
    // actualiza una, las attestations certificarán un modelo distinto del que calculó el
    // score, y el `bytes32` equivocado se verá perfectamente válido. Esta prueba es lo único
    // que hace ruidoso ese desliz.
    let esperado = alloy_primitives::hex::encode(MODEL_HASH_BYTES);
    assert_eq!(weights::MODEL_HASH, alloc::format!("0x{esperado}"));
}

#[test]
fn el_compromiso_es_el_keccak_de_las_ocho_senales() {
    // Se recalcula aquí con los mismos bytes que un auditor de afuera armaría a partir del
    // historial: ocho palabras de treinta y dos bytes. Si el contrato hasheara otra cosa, el
    // compromiso sería incomprobable y con él toda la attestation.
    let esperado = keccak(respuesta_de_junta(SE_LLEVO_EL_POZO));
    assert_eq!(compromiso_de(&SE_LLEVO_EL_POZO), esperado);
}

#[test]
fn dos_historiales_distintos_no_comparten_compromiso() {
    assert_ne!(compromiso_de(&IMPECABLE), compromiso_de(&SE_LLEVO_EL_POZO));
}

#[test]
fn el_compromiso_distingue_una_senal_negativa_de_su_opuesta() {
    // El signo se codifica en el relleno alto de la palabra. Rellenar siempre con ceros
    // haría que un atraso de +1 y uno de -1 se comprometieran al mismo hash, y el compromiso
    // dejaría de identificar el historial que dice identificar.
    let mut positiva = IMPECABLE;
    positiva[4] = SCALE;
    let mut negativa = IMPECABLE;
    negativa[4] = -SCALE;
    assert_ne!(compromiso_de(&positiva), compromiso_de(&negativa));
}

#[test]
fn atestiguar_recomputa_en_vivo_en_vez_de_reusar_la_foto() {
    // ADR-0003: la attestation nunca certifica un score viejo. Aquí el historial empeora
    // entre una llamada y la otra, y lo que se computa la segunda vez es el número nuevo —
    // tanto el score como el compromiso que viajará describiendo de dónde salió.
    let (vm, mut motor) = motor_con(IMPECABLE);
    let primero = motor.record_score(0, MARIA).unwrap();

    vm.mock_static_call(
        JUNTA,
        historyCall {
            juntaId: 0,
            member: MARIA,
        }
        .abi_encode(),
        Ok(respuesta_de_junta(SE_LLEVO_EL_POZO)),
    );
    let (features, segundo, positivo) = motor.computar_y_persistir(0, MARIA).unwrap();

    assert_eq!(primero, calcular_score(IMPECABLE));
    assert_eq!(segundo, calcular_score(SE_LLEVO_EL_POZO));
    assert!(!positivo, "cobró el pozo y dejó de aportar");
    assert_eq!(compromiso_de(&features), compromiso_de(&SE_LLEVO_EL_POZO));
}

#[test]
fn atestiguar_falla_cuando_eas_no_devuelve_un_uid() {
    // Sin EAS al otro lado, la llamada cruda devuelve **éxito con cero bytes**: exactamente
    // lo que devolvería una dirección equivocada en la red real. Sin la comprobación de
    // longitud, ese silencio se guardaría como un UID de ceros y el evento anunciaría una
    // attestation que no existe en ninguna parte.
    let (_vm, mut motor) = motor_con(IMPECABLE);
    let fallo = motor.attest(0, MARIA).unwrap_err();
    assert!(
        matches!(fallo, ScoreError::AttestationFallida(_)),
        "el fallo tiene que señalar a EAS, no al historial: {fallo:?}"
    );
}

#[test]
fn sin_historial_no_se_llega_a_llamar_a_eas() {
    // El orden importa: primero se recomputa, y si la Junta no responde no hay nada que
    // certificar. Atestiguar con un score inventado sería peor que no atestiguar.
    let vm = TestVM::default();
    let mut motor = ScoreEngine::from(&vm);
    motor.constructor(JUNTA, EAS, SCHEMA_UID);

    let fallo = motor.attest(0, MARIA).unwrap_err();
    assert!(
        matches!(fallo, ScoreError::LecturaDeJuntaFallida(_)),
        "{fallo:?}"
    );
}

#[test]
fn el_uid_guardado_es_del_par_junta_miembro() {
    // El UID se escribe directamente porque emitirlo exigiría un EAS que responda, y esa
    // llamada no se puede simular. Lo que sí se comprueba es la clave: un UID leído bajo la
    // junta equivocada le atribuiría a un miembro una attestation que no es suya.
    let (_vm, mut motor) = motor_con(IMPECABLE);
    let uid = FixedBytes::<32>::from([0xABu8; 32]);
    motor
        .ultima_attestation
        .setter(U32::from(0u32))
        .insert(MARIA, uid);

    assert_eq!(motor.latest_attestation(0, MARIA), uid);
    assert_eq!(
        motor.latest_attestation(1, MARIA),
        FixedBytes::<32>::ZERO,
        "otra junta no hereda la attestation"
    );
}

#[test]
fn el_cableado_de_eas_se_puede_auditar_desde_afuera() {
    // Una dirección de EAS equivocada no revierte nada, así que la única defensa barata es
    // poder leerla y compararla contra docs/addresses.md antes de buscar el fallo en el
    // contrato.
    let (_vm, motor) = motor_con(IMPECABLE);
    assert_eq!(motor.eas(), EAS);
    assert_eq!(motor.schema_uid(), SCHEMA_UID);
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
