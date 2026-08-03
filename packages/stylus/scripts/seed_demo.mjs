/**
 * Siembra la demostración y ejecuta el primer cómputo de score en la cadena.
 *
 * Crea la junta protagonista, acuña el dinero de prueba, hace que sus miembros aporten, y
 * después llama a `record_score` — que es la transacción que deja el rastro verificable: un
 * hash en el explorador y un número de gas que se puede citar sin inventarlo.
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

/** Un ciclo por minuto: la junta entera corre en ocho minutos y luego queda congelada. */
const PERIODO = 60n;
const CUOTA = 50_000_000n; // 50 mUSDC, seis decimales

function leerClave() {
  const contenido = readFileSync(resolve(AQUI, "..", ".env"), "utf8");
  const linea = contenido
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("PRIVATE_KEY_SEPOLIA="));
  const clave = linea.split("=")[1].trim();
  return clave.startsWith("0x") ? clave : `0x${clave}`;
}

const fn = (name, inputs, outputs, mut = "nonpayable") => [
  { type: "function", name, stateMutability: mut, inputs, outputs },
];

async function main() {
  const cuenta = privateKeyToAccount(leerClave());
  const publico = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(RPC),
  });
  const wallet = createWalletClient({
    account: cuenta,
    chain: arbitrumSepolia,
    transport: http(RPC),
  });

  console.log(`Cuenta: ${cuenta.address}`);
  console.log(
    `Saldo:  ${formatEther(await publico.getBalance({ address: cuenta.address }))} ETH\n`,
  );

  // La demostración corre con una sola cuenta como miembro. Alcanza para lo que se quiere
  // demostrar —que el score se computa dentro de la cadena a partir de hechos reales— y
  // evita repartir ETH entre ocho wallets solo para firmar depósitos.
  const miembros = [cuenta.address];

  console.log("1. Creando la junta...");
  let hash = await wallet.writeContract({
    address: JUNTA,
    abi: fn(
      "createJunta",
      [
        { name: "miembros", type: "address[]" },
        { name: "cuota", type: "uint256" },
        { name: "periodo", type: "uint64" },
      ],
      [{ type: "uint32" }],
    ),
    functionName: "createJunta",
    args: [miembros, CUOTA, PERIODO],
  });
  await publico.waitForTransactionReceipt({ hash });
  const juntaId =
    Number(
      await publico.readContract({
        address: JUNTA,
        abi: fn("totalJuntas", [], [{ type: "uint32" }], "view"),
        functionName: "totalJuntas",
      }),
    ) - 1;
  console.log(`   junta #${juntaId} creada · ${EXPLORADOR}/tx/${hash}\n`);

  console.log("2. Acuñando mUSDC y autorizando a la junta...");
  hash = await wallet.writeContract({
    address: USDC,
    abi: fn(
      "mint",
      [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
      [],
    ),
    functionName: "mint",
    args: [cuenta.address, CUOTA * 20n],
  });
  await publico.waitForTransactionReceipt({ hash });

  hash = await wallet.writeContract({
    address: USDC,
    abi: fn(
      "approve",
      [
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
      ],
      [{ type: "bool" }],
    ),
    functionName: "approve",
    args: [JUNTA, CUOTA * 20n],
  });
  await publico.waitForTransactionReceipt({ hash });
  console.log("   listo\n");

  console.log("3. Depositando la cuota del ciclo en curso...");
  hash = await wallet.writeContract({
    address: JUNTA,
    abi: fn("deposit", [{ name: "juntaId", type: "uint32" }], []),
    functionName: "deposit",
    args: [juntaId],
  });
  await publico.waitForTransactionReceipt({ hash });
  console.log(`   depósito confirmado · ${EXPLORADOR}/tx/${hash}\n`);

  console.log("4. Leyendo el historial que la junta expone...");
  const historial = await publico.readContract({
    address: JUNTA,
    abi: fn(
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
    functionName: "history",
    args: [juntaId, cuenta.address],
  });
  const nombres = [
    "tasa_cumplimiento",
    "pagos_puntuales",
    "pagos_atrasados",
    "defaults",
    "atraso_max_periodos",
    "defaults_tras_cobro",
    "antiguedad_periodos",
    "disputas_perdidas",
  ];
  nombres.forEach((n, i) => console.log(`   ${n.padEnd(22)} ${historial[i]}`));

  const scoreVista = await publico.readContract({
    address: MOTOR,
    abi: fn(
      "computeScore",
      [
        { name: "juntaId", type: "uint32" },
        { name: "member", type: "address" },
      ],
      [{ type: "uint16" }],
      "view",
    ),
    functionName: "computeScore",
    args: [juntaId, cuenta.address],
  });
  console.log(
    `\n   score computado por el contrato (vista): ${scoreVista}\n`,
  );

  console.log(
    "5. Registrando el score EN LA CADENA (esta es la transacción del pitch)...",
  );
  hash = await wallet.writeContract({
    address: MOTOR,
    abi: fn(
      "recordScore",
      [
        { name: "juntaId", type: "uint32" },
        { name: "member", type: "address" },
      ],
      [{ type: "uint16" }],
    ),
    functionName: "recordScore",
    args: [juntaId, cuenta.address],
  });
  const recibo = await publico.waitForTransactionReceipt({ hash });

  const guardado = await publico.readContract({
    address: MOTOR,
    abi: fn(
      "latestScore",
      [
        { name: "juntaId", type: "uint32" },
        { name: "member", type: "address" },
      ],
      [{ type: "uint16" }, { type: "bool" }, { type: "uint64" }],
      "view",
    ),
    functionName: "latestScore",
    args: [juntaId, cuenta.address],
  });

  console.log(`\n   ══════════════════════════════════════════════════════`);
  console.log(`   Transacción : ${EXPLORADOR}/tx/${hash}`);
  console.log(`   Bloque      : ${recibo.blockNumber}`);
  console.log(`   Gas usado   : ${recibo.gasUsed}`);
  console.log(`   Score       : ${guardado[0]}  (positivo: ${guardado[1]})`);
  console.log(`   junta       : #${juntaId}`);
  console.log(`   ══════════════════════════════════════════════════════`);
  console.log(
    `\n   Ese gas cubre leer el historial de otro contrato, correr el modelo en\n` +
      `   aritmética de punto fijo, escribir el resultado y emitir el evento.\n`,
  );

  const integridad = await publico.readContract({
    address: JUNTA,
    abi: fn(
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
    functionName: "verifyIntegrity",
  });
  console.log(`6. Integridad de la caja:`);
  console.log(
    `   aportado ${integridad[0]} − distribuido ${integridad[1]} = ${integridad[2]}`,
  );
  console.log(`   ${integridad[3] ? "CUADRA ✓" : "NO CUADRA ✗"}`);
}

main().catch((e) => {
  console.error(`\nFalló: ${e.shortMessage ?? e.message}`);
  process.exit(1);
});
