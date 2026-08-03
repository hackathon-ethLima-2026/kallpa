/**
 * Siembra las dos juntas de la demostración sobre los contratos ya desplegados.
 *
 * Crea una junta ejemplar y una junta con un moroso, las deja correr hasta que sus ocho
 * ciclos vencen, y computa los scores en la cadena. A partir de ese momento las dos quedan
 * **congeladas**: el historial de una junta terminada no vuelve a moverse, así que se puede
 * sembrar hoy y demostrar el sábado sin que nada se degrade por el camino.
 *
 * Las dos juntas usan ciclos de un minuto. Eso vuelve la siembra reproducible en ocho
 * minutos —si aparece un error el viernes, se rehace entera— y no degrada el caso negativo,
 * porque los incumplimientos están topados al número de ciclos de la junta: llegan a ocho y
 * ahí se quedan.
 *
 *   Junta 1, "Las Emprendedoras": ocho miembros que pagan sus ocho cuotas. Score alto y
 *   línea de crédito máxima. Es el camino feliz del pitch.
 *
 *   Junta 2, "Los del Mercado": todos pagan el primer ciclo, el primer turno cobra el pozo
 *   completo y deja de aportar. Es el riesgo propio de una junta —tomar el pozo y
 *   desaparecer— y el que hace que el crédito se cierre solo.
 *
 * Las cuentas de los miembros se derivan de una semilla fija, así que volver a correr esto
 * produce siempre las mismas direcciones.
 *
 * Uso:  node scripts/seed_demo.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RPC = "https://sepolia-rollup.arbitrum.io/rpc";
const EXPLORADOR = "https://sepolia.arbiscan.io";

const despliegues = JSON.parse(
  readFileSync(
    resolve(AQUI, "..", "deployments", "421614_latest.json"),
    "utf8",
  ),
);
const USDC = despliegues.mock_usdc.address;
const JUNTA = despliegues.junta.address;
const MOTOR = despliegues.score_engine.address;
const POOL = despliegues.pool.address;

const MIEMBROS = 8;
const PERIODO = 60n; // un ciclo por minuto
const CUOTA = 50_000_000n; // 50 mUSDC
const GAS_POR_MIEMBRO = 3_000_000_000_000_000n; // 0.003 ETH, de sobra para sus transacciones

/** Nombres solo para que la salida se lea; en la cadena no existen. */
const NOMBRES = [
  "María",
  "Rosa",
  "Carmen",
  "Julia",
  "Elena",
  "Ana",
  "Lucía",
  "Sofía",
];

function leerClave() {
  const contenido = readFileSync(resolve(AQUI, "..", ".env"), "utf8");
  const linea = contenido
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("PRIVATE_KEY_SEPOLIA="));
  const clave = linea.split("=")[1].trim();
  return clave.startsWith("0x") ? clave : `0x${clave}`;
}

/** Cuentas derivadas de una semilla fija: volver a sembrar da las mismas direcciones. */
function cuentaDeMiembro(i) {
  return privateKeyToAccount(keccak256(toHex(`kallpa-demo-miembro-${i}`)));
}

const fn = (name, inputs, outputs, mut = "nonpayable") => [
  { type: "function", name, stateMutability: mut, inputs, outputs },
];

const ABI = {
  createJunta: fn(
    "createJunta",
    [
      { name: "nombre", type: "string" },
      { name: "miembros", type: "address[]" },
      { name: "cuota", type: "uint256" },
      { name: "periodo", type: "uint64" },
    ],
    [{ type: "uint32" }],
  ),
  totalJuntas: fn("totalJuntas", [], [{ type: "uint32" }], "view"),
  deposit: fn("deposit", [{ name: "juntaId", type: "uint32" }], []),
  distribute: fn(
    "distribute",
    [{ name: "juntaId", type: "uint32" }],
    [{ type: "uint256" }],
  ),
  history: fn(
    "history",
    [
      { name: "juntaId", type: "uint32" },
      { name: "member", type: "address" },
    ],
    [
      { type: "int128" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "int128" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint32" },
    ],
    "view",
  ),
  verifyIntegrity: fn(
    "verifyIntegrity",
    [],
    [
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bool" },
    ],
    "view",
  ),
  juntaState: fn(
    "juntaState",
    [{ name: "juntaId", type: "uint32" }],
    [
      { type: "uint256" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint32" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    "view",
  ),
  mint: fn(
    "mint",
    [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    [],
  ),
  approve: fn(
    "approve",
    [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    [{ type: "bool" }],
  ),
  computeScore: fn(
    "computeScore",
    [
      { name: "juntaId", type: "uint32" },
      { name: "member", type: "address" },
    ],
    [{ type: "uint16" }],
    "view",
  ),
  scoreAndCredit: fn(
    "scoreAndCredit",
    [
      { name: "juntaId", type: "uint32" },
      { name: "member", type: "address" },
    ],
    [{ type: "uint16" }, { type: "bool" }],
    "view",
  ),
  recordScore: fn(
    "recordScore",
    [
      { name: "juntaId", type: "uint32" },
      { name: "member", type: "address" },
    ],
    [{ type: "uint16" }],
  ),
  tramo: fn(
    "tramo",
    [{ name: "score", type: "uint16" }],
    [{ type: "uint256" }],
    "view",
  ),
};

const publico = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(RPC),
});

function billetera(cuenta) {
  return createWalletClient({
    account: cuenta,
    chain: arbitrumSepolia,
    transport: http(RPC),
  });
}

async function enviar(cuenta, address, abi, functionName, args = [], value) {
  const hash = await billetera(cuenta).writeContract({
    address,
    abi,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  });
  await publico.waitForTransactionReceipt({ hash });
  return hash;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tesorero = privateKeyToAccount(leerClave());
  const miembros = Array.from({ length: MIEMBROS }, (_, i) =>
    cuentaDeMiembro(i),
  );

  console.log(`Tesorero: ${tesorero.address}`);
  console.log(
    `Saldo:    ${formatEther(await publico.getBalance({ address: tesorero.address }))} ETH\n`,
  );
  console.log("Miembros de la demostración (derivados de semilla fija):");
  miembros.forEach((m, i) =>
    console.log(`   ${NOMBRES[i].padEnd(8)} ${m.address}`),
  );

  // ── Preparar a los miembros ───────────────────────────────────────────────────────────
  // Cada uno necesita gas para firmar sus propias transacciones y mUSDC para aportar. Que
  // cada miembro firme lo suyo no es una formalidad: `deposit` acredita la cuota a quien la
  // envía, así que una junta con ocho miembros son ocho cuentas de verdad.
  console.log("\n1. Repartiendo gas y mUSDC entre los miembros...");
  for (const [i, m] of miembros.entries()) {
    const saldo = await publico.getBalance({ address: m.address });
    if (saldo < GAS_POR_MIEMBRO / 2n) {
      const hash = await billetera(tesorero).sendTransaction({
        to: m.address,
        value: GAS_POR_MIEMBRO,
      });
      await publico.waitForTransactionReceipt({ hash });
    }
    await enviar(tesorero, USDC, ABI.mint, "mint", [m.address, CUOTA * 20n]);
    process.stdout.write(`   ${NOMBRES[i]} listo\n`);
  }

  console.log("\n2. Autorizando a la junta a cobrar las cuotas...");
  await Promise.all(
    miembros.map((m) =>
      enviar(m, USDC, ABI.approve, "approve", [JUNTA, CUOTA * 20n]),
    ),
  );
  console.log("   listo");

  // ── Las dos juntas ────────────────────────────────────────────────────────────────────
  const direcciones = miembros.map((m) => m.address);

  console.log("\n3. Creando las dos juntas...");
  await enviar(tesorero, JUNTA, ABI.createJunta, "createJunta", [
    "Las Emprendedoras",
    direcciones,
    CUOTA,
    PERIODO,
  ]);
  const total = Number(
    await publico.readContract({
      address: JUNTA,
      abi: ABI.totalJuntas,
      functionName: "totalJuntas",
    }),
  );
  const BUENA = total - 1;

  await enviar(tesorero, JUNTA, ABI.createJunta, "createJunta", [
    "Los del Mercado",
    direcciones,
    CUOTA,
    PERIODO,
  ]);
  const MALA = BUENA + 1;
  const arranque = Date.now();
  console.log(
    `   junta #${BUENA} "Las Emprendedoras"  ·  junta #${MALA} "Los del Mercado"`,
  );

  // ── La junta ejemplar ─────────────────────────────────────────────────────────────────
  // Cada miembro paga sus ocho cuotas de una vez. Pagar antes del vencimiento cuenta como
  // puntual y nunca como adelanto negativo, así que las ocho quedan al día desde el
  // arranque y el historial se completa solo cuando el reloj alcanza el octavo ciclo.
  console.log(`\n4. "Las Emprendedoras": los ocho pagan sus ocho cuotas...`);
  await Promise.all(
    miembros.map(async (m, i) => {
      for (let ciclo = 0; ciclo < MIEMBROS; ciclo++) {
        await enviar(m, JUNTA, ABI.deposit, "deposit", [BUENA]);
      }
      process.stdout.write(`   ${NOMBRES[i]} al día\n`);
    }),
  );

  // ── La junta con el moroso ────────────────────────────────────────────────────────────
  console.log(`\n5. "Los del Mercado": todos pagan el primer ciclo...`);
  await Promise.all(
    miembros.map((m) => enviar(m, JUNTA, ABI.deposit, "deposit", [MALA])),
  );
  console.log("   listo");

  // Hay que dejar vencer el primer ciclo antes de repartir: la caja no se puede vaciar
  // antes de tiempo, y esa guarda también aplica aquí.
  const faltaCiclo1 = 65_000 - (Date.now() - arranque);
  if (faltaCiclo1 > 0) {
    console.log(
      `\n   esperando ${Math.ceil(faltaCiclo1 / 1000)}s a que venza el primer ciclo...`,
    );
    await esperar(faltaCiclo1);
  }

  console.log(
    `\n6. ${NOMBRES[0]} cobra el pozo de "Los del Mercado" y deja de aportar...`,
  );
  const hashCobro = await enviar(
    miembros[0],
    JUNTA,
    ABI.distribute,
    "distribute",
    [MALA],
  );
  console.log(`   pozo entregado · ${EXPLORADOR}/tx/${hashCobro}`);
  console.log(
    "   a partir de aquí no vuelve a pagar: su mora será posterior al cobro",
  );

  // ── Esperar a que las juntas terminen ─────────────────────────────────────────────────
  const faltaFinal =
    Number(PERIODO) * 1000 * MIEMBROS + 20_000 - (Date.now() - arranque);
  if (faltaFinal > 0) {
    console.log(
      `\n7. Esperando ${Math.ceil(faltaFinal / 1000)}s a que venzan los ocho ciclos.`,
    );
    console.log(
      "   Cuando el reloj los alcance, las dos juntas quedan congeladas: el",
    );
    console.log("   historial de una junta terminada ya no vuelve a moverse.");
    let restante = faltaFinal;
    while (restante > 0) {
      await esperar(Math.min(30_000, restante));
      restante -= 30_000;
      if (restante > 0)
        process.stdout.write(`   faltan ${Math.ceil(restante / 1000)}s\n`);
    }
  }

  console.log(`\n8. Repartiendo los turnos de "Las Emprendedoras"...`);
  for (let turno = 0; turno < MIEMBROS; turno++) {
    await enviar(miembros[turno], JUNTA, ABI.distribute, "distribute", [BUENA]);
    process.stdout.write(`   turno ${turno + 1}/8 → ${NOMBRES[turno]}\n`);
  }

  // ── El resultado ──────────────────────────────────────────────────────────────────────
  const señales = [
    "tasa_cumplimiento",
    "pagos_puntuales",
    "pagos_atrasados",
    "defaults",
    "atraso_max_periodos",
    "defaults_tras_cobro",
    "antiguedad_periodos",
    "disputas_perdidas",
  ];

  async function mostrar(juntaId, titulo, indice) {
    const m = miembros[indice];
    const h = await publico.readContract({
      address: JUNTA,
      abi: ABI.history,
      functionName: "history",
      args: [juntaId, m.address],
    });
    const [score, conCredito] = await publico.readContract({
      address: MOTOR,
      abi: ABI.scoreAndCredit,
      functionName: "scoreAndCredit",
      args: [juntaId, m.address],
    });
    const monto = await publico.readContract({
      address: POOL,
      abi: ABI.tramo,
      functionName: "tramo",
      args: [score],
    });

    console.log(`\n   ── ${titulo} · ${NOMBRES[indice]} ──`);
    señales.forEach((n, i) => console.log(`      ${n.padEnd(22)} ${h[i]}`));
    console.log(`      ${"score".padEnd(22)} ${score}`);
    console.log(
      `      ${"crédito".padEnd(22)} ${conCredito ? `${Number(monto) / 1e6} mUSDC` : "SUSPENDIDO"}`,
    );
    return { score, conCredito, monto };
  }

  console.log("\n9. El resultado, leído de la cadena:");
  const buena = await mostrar(BUENA, `Junta #${BUENA} "Las Emprendedoras"`, 0);
  const mala = await mostrar(MALA, `Junta #${MALA} "Los del Mercado"`, 0);

  console.log("\n10. Registrando los scores en la cadena...");
  const hashBuena = await enviar(
    tesorero,
    MOTOR,
    ABI.recordScore,
    "recordScore",
    [BUENA, miembros[0].address],
  );
  const reciboBuena = await publico.getTransactionReceipt({ hash: hashBuena });
  const hashMala = await enviar(
    tesorero,
    MOTOR,
    ABI.recordScore,
    "recordScore",
    [MALA, miembros[0].address],
  );

  const integridad = await publico.readContract({
    address: JUNTA,
    abi: ABI.verifyIntegrity,
    functionName: "verifyIntegrity",
  });

  console.log(
    "\n════════════════════════════════════════════════════════════════",
  );
  console.log("  DEMOSTRACIÓN SEMBRADA");
  console.log(
    "════════════════════════════════════════════════════════════════",
  );
  console.log(`  Junta #${BUENA} "Las Emprendedoras" — ${NOMBRES[0]}`);
  console.log(
    `     score ${buena.score} · ${buena.conCredito ? `crédito ${Number(buena.monto) / 1e6} mUSDC` : "sin crédito"}`,
  );
  console.log(
    `     ${EXPLORADOR}/tx/${hashBuena}   (gas ${reciboBuena.gasUsed})`,
  );
  console.log(
    `\n  Junta #${MALA} "Los del Mercado" — ${NOMBRES[0]} cobró y dejó de pagar`,
  );
  console.log(
    `     score ${mala.score} · ${mala.conCredito ? "con crédito" : "CRÉDITO SUSPENDIDO"}`,
  );
  console.log(`     ${EXPLORADOR}/tx/${hashMala}`);
  console.log(`\n  Integridad del contrato:`);
  console.log(
    `     aportado ${integridad[0]} − distribuido ${integridad[1]} = ${integridad[2]}`,
  );
  console.log(
    `     saldo real del token: ${integridad[2]}  →  ${integridad[3] ? "CUADRA ✓" : "NO CUADRA ✗"}`,
  );
  console.log(
    "════════════════════════════════════════════════════════════════",
  );
  console.log(
    `\n  Las dos juntas están completas, así que su historial ya no cambia:\n` +
      `  se puede demostrar cuando sea sin que nada se degrade.\n`,
  );
}

main().catch((e) => {
  console.error(`\nFalló: ${e.shortMessage ?? e.message}`);
  process.exit(1);
});
