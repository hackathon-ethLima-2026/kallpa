/**
 * Reparte ETH de prueba a quien lo necesite, en Arbitrum Sepolia.
 *
 * Existe porque el camino "oficial" para conseguir gas en esta red es malo: casi todos los
 * grifos exigen tener saldo en la red principal de Ethereum, y el que no lo exige entrega
 * Sepolia L1, que después hay que pasar por un puente y tarda unos diez minutos. Hacerle eso
 * a cada persona del equipo es media hora regalada.
 *
 * Si alguien ya tiene saldo aquí, mandarlo es instantáneo y cuesta céntimos de gas. Este
 * guion solo automatiza eso para varias direcciones a la vez.
 *
 *   PRIVATE_KEY_SEPOLIA=0x... node scripts/repartir_gas.mjs 0xAmigo1 0xAmigo2
 *   PRIVATE_KEY_SEPOLIA=0x... node scripts/repartir_gas.mjs 0xAmigo1 --monto 0.02
 *
 * El dinero de la aplicación es otra cosa: el mUSDC se acuña desde la propia interfaz con el
 * botón "Conseguir 500 mUSDC de prueba". Esto es solo el gas.
 */

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  isAddress,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RPC = "https://sepolia-rollup.arbitrum.io/rpc";

/** Alcanza de sobra para decenas de transacciones: en Arbitrum el gas es barato. */
const MONTO_POR_OMISION = "0.01";

function leerClave() {
  if (process.env.PRIVATE_KEY_SEPOLIA)
    return process.env.PRIVATE_KEY_SEPOLIA.trim();
  const archivo = resolve(AQUI, "..", ".env");
  if (existsSync(archivo)) {
    const linea = readFileSync(archivo, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("PRIVATE_KEY_SEPOLIA="));
    if (linea) return linea.split("=")[1].trim();
  }
  throw new Error(
    "Falta PRIVATE_KEY_SEPOLIA, por variable de entorno o en packages/stylus/.env",
  );
}

const argumentos = process.argv.slice(2);
const iMonto = argumentos.indexOf("--monto");
const hayMonto = iMonto !== -1;
const monto = hayMonto ? argumentos[iMonto + 1] : MONTO_POR_OMISION;
// El `hayMonto` no sobra: sin él, cuando no se pasa `--monto` el índice vale -1, su
// siguiente es 0, y el filtro se comía el primer destinatario de la lista.
const destinos = argumentos.filter(
  (a, i) => a !== "--monto" && !(hayMonto && i === iMonto + 1),
);

if (destinos.length === 0) {
  console.error(
    "Uso: node scripts/repartir_gas.mjs 0xDireccion [0xOtra ...] [--monto 0.02]",
  );
  process.exit(1);
}

// Se validan TODAS antes de mandar nada. Una dirección mal copiada a mitad del reparto
// dejaría el trabajo hecho a medias y sin forma de saber a quién le llegó.
const invalidas = destinos.filter((d) => !isAddress(d));
if (invalidas.length > 0) {
  console.error(
    "Estas direcciones no son válidas:\n  " + invalidas.join("\n  "),
  );
  process.exit(1);
}

const cuenta = privateKeyToAccount(
  leerClave().startsWith("0x") ? leerClave() : `0x${leerClave()}`,
);
const publico = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(RPC),
});
const cartera = createWalletClient({
  account: cuenta,
  chain: arbitrumSepolia,
  transport: http(RPC),
});

const saldo = await publico.getBalance({ address: cuenta.address });
const total = parseEther(monto) * BigInt(destinos.length);
console.log(`Desde   : ${cuenta.address}`);
console.log(`Saldo   : ${formatEther(saldo)} ETH`);
console.log(
  `A enviar: ${monto} ETH × ${destinos.length} = ${formatEther(total)} ETH\n`,
);

if (saldo < total) {
  console.error("No alcanza. Baja el monto o quita destinatarios.");
  process.exit(1);
}

for (const destino of destinos) {
  const previo = await publico.getBalance({ address: destino });
  const hash = await cartera.sendTransaction({
    to: destino,
    value: parseEther(monto),
  });
  await publico.waitForTransactionReceipt({ hash });
  // Se relee el saldo en vez de confiar en el recibo: lo que importa es que llegó, no que
  // la transacción no falló.
  const despues = await publico.getBalance({ address: destino });
  console.log(
    `✓ ${destino}  ${formatEther(previo)} → ${formatEther(despues)} ETH`,
  );
  console.log(`  https://sepolia.arbiscan.io/tx/${hash}`);
}

console.log(
  `\nListo. Te quedan ${formatEther(await publico.getBalance({ address: cuenta.address }))} ETH.`,
);
