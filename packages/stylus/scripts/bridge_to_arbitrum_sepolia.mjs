/**
 * Lleva ETH de prueba desde Sepolia de capa 1 hacia Arbitrum Sepolia.
 *
 * Existe porque los faucets de Arbitrum Sepolia exigen tener saldo real en Ethereum
 * mainnet como filtro antiabuso, cosa que una wallet recién creada no tiene. El camino que
 * sí funciona sin pedir nada es conseguir ETH en Sepolia de capa 1 y puentearlo.
 *
 * Hace lo mismo que la interfaz del puente oficial, pero desde la terminal: una llamada a
 * `depositEth()` en el contrato de entrada de Arbitrum. Evita tener que importar la clave
 * privada a una extensión del navegador solo para mover fondos de prueba.
 *
 * Uso:
 *   node scripts/bridge_to_arbitrum_sepolia.mjs [monto_en_eth]
 *
 * El monto es opcional; por defecto puentea todo lo disponible menos una reserva para el
 * gas. La clave sale de `packages/stylus/.env`, la misma que usa el despliegue.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, sepolia } from "viem/chains";

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Contrato de entrada de Arbitrum Sepolia, desplegado en Sepolia de capa 1.
 *
 * Verificado contra la documentación oficial de Arbitrum y comprobado en la cadena: la
 * dirección tiene código desplegado. Enviar a una dirección equivocada quemaría los fondos
 * sin ningún aviso, así que no conviene copiarla de memoria ni de un tutorial.
 */
const INBOX_ARBITRUM_SEPOLIA = "0xaAe29B0366299461418F5324a79Afc425BE5ae21";

/**
 * Puntos de acceso a cada cadena.
 *
 * Se declaran explícitamente porque los que viem trae por defecto para Sepolia limitan el
 * tráfico y devuelven error sin explicar por qué. Estos dos están comprobados.
 */
const RPC_L1 = "https://ethereum-sepolia-rpc.publicnode.com";
const RPC_L2 = "https://sepolia-rollup.arbitrum.io/rpc";

/** Se deja sin puentear para poder pagar el gas de la propia transacción de depósito. */
const RESERVA_PARA_GAS = parseEther("0.005");

function leerClave() {
  const ruta = resolve(AQUI, "..", ".env");
  const contenido = readFileSync(ruta, "utf8");
  const linea = contenido
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("PRIVATE_KEY_SEPOLIA="));
  if (!linea) {
    throw new Error(
      `No se encontró PRIVATE_KEY_SEPOLIA en ${ruta}. Es el mismo archivo que usa el despliegue.`,
    );
  }
  const clave = linea.split("=")[1].trim();
  return clave.startsWith("0x") ? clave : `0x${clave}`;
}

async function main() {
  const cuenta = privateKeyToAccount(leerClave());
  console.log(`Cuenta: ${cuenta.address}\n`);

  const l1 = createPublicClient({ chain: sepolia, transport: http(RPC_L1) });
  const l2 = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC_L2) });

  const saldoL1 = await l1.getBalance({ address: cuenta.address });
  const saldoL2Antes = await l2.getBalance({ address: cuenta.address });
  console.log(`Sepolia (capa 1):  ${formatEther(saldoL1)} ETH`);
  console.log(`Arbitrum Sepolia:  ${formatEther(saldoL2Antes)} ETH\n`);

  if (saldoL1 <= RESERVA_PARA_GAS) {
    console.log(
      "No hay saldo suficiente en Sepolia de capa 1 para puentear nada.\n" +
        "Consigue ETH de prueba primero, por ejemplo en https://sepolia-faucet.pk910.de",
    );
    process.exit(1);
  }

  const pedido = process.argv[2];
  const monto = pedido ? parseEther(pedido) : saldoL1 - RESERVA_PARA_GAS;
  if (monto <= 0n || monto > saldoL1 - RESERVA_PARA_GAS) {
    console.log(
      `El monto pedido no cabe. Disponible para puentear: ` +
        `${formatEther(saldoL1 - RESERVA_PARA_GAS)} ETH`,
    );
    process.exit(1);
  }

  console.log(`Puenteando ${formatEther(monto)} ETH hacia Arbitrum Sepolia...`);

  const wallet = createWalletClient({
    account: cuenta,
    chain: sepolia,
    transport: http(RPC_L1),
  });

  const hash = await wallet.sendTransaction({
    to: INBOX_ARBITRUM_SEPOLIA,
    value: monto,
    data: encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "depositEth",
          stateMutability: "payable",
          inputs: [],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "depositEth",
    }),
  });

  console.log(`Transacción en capa 1: https://sepolia.etherscan.io/tx/${hash}`);
  const recibo = await l1.waitForTransactionReceipt({ hash });
  console.log(`Confirmada en el bloque ${recibo.blockNumber}\n`);

  // El depósito se replica en la capa 2 con unos minutos de retraso. Se espera aquí para
  // que quede claro cuándo se puede desplegar, en vez de dejarlo a la adivinanza.
  console.log("Esperando a que los fondos aparezcan en Arbitrum Sepolia...");
  const limite = Date.now() + 20 * 60 * 1000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 15_000));
    const ahora = await l2.getBalance({ address: cuenta.address });
    if (ahora > saldoL2Antes) {
      console.log(
        `\n¡Llegaron! Saldo en Arbitrum Sepolia: ${formatEther(ahora)} ETH`,
      );
      console.log("Ya se puede desplegar:  yarn deploy --network sepolia");
      return;
    }
    process.stdout.write(".");
  }

  console.log(
    "\nPasaron veinte minutos sin que aparecieran. El depósito no se pierde: " +
      "vuelve a correr este script para ver el saldo, o revisa la transacción en el explorador.",
  );
}

main().catch((error) => {
  console.error(`\nFalló: ${error.shortMessage ?? error.message}`);
  process.exit(1);
});
