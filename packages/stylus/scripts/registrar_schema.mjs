/**
 * Registra el schema de Kallpa en el SchemaRegistry de EAS. Se corre UNA sola vez por red.
 *
 * Un schema de EAS es la forma de la attestation: qué campos lleva y de qué tipo. Vive en un
 * registro público y se identifica por un UID que sale del hash de su propio texto, así que
 * cualquiera puede recalcularlo y comprobar que la attestation que lee es de la forma que
 * dice ser. Sin este registro, `attest` revierte con `InvalidSchema`.
 *
 * Las direcciones están comprobadas contra el bytecode de la cadena en
 * `docs/eas-arbitrum-sepolia.md`, no copiadas de la documentación: las de otras redes no
 * existen aquí, y una dirección equivocada cuesta un redespliegue.
 *
 *   PRIVATE_KEY_SEPOLIA=0x... node scripts/registrar_schema.mjs
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  encodePacked,
  keccak256,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RPC = "https://sepolia-rollup.arbitrum.io/rpc";
const REGISTRY = "0x45CB6Fa0870a8Af06796Ac15915619a0f22cd475";

// El texto va con los espacios EXACTAMENTE como está en el build-spec §6.5. El UID es el
// hash del texto crudo: quitar un espacio no produce el mismo schema mejor formateado,
// produce otro schema distinto.
const SCHEMA =
  "uint16 score, bool positive, uint32 juntaId, bytes32 modelHash, bytes32 featuresCommitment";
const RESOLVER = zeroAddress;
const REVOCABLE = true;

const abi = parseAbi([
  "function register(string schema, address resolver, bool revocable) returns (bytes32)",
  "struct SchemaRecord { bytes32 uid; address resolver; bool revocable; string schema; }",
  "function getSchema(bytes32 uid) view returns (SchemaRecord)",
]);

/** Acepta la clave por variable de entorno o por `.env`, en ese orden. */
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

const clave = leerClave();
const cuenta = privateKeyToAccount(
  clave.startsWith("0x") ? clave : `0x${clave}`,
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

// El UID se calcula antes de mandar nada: registrar dos veces revierte con AlreadyExists, y
// enterarse sin gastar gas es preferible.
const uid = keccak256(
  encodePacked(["string", "address", "bool"], [SCHEMA, RESOLVER, REVOCABLE]),
);
console.log("Cuenta      :", cuenta.address);
console.log("UID previsto:", uid);

const existente = await publico.readContract({
  address: REGISTRY,
  abi,
  functionName: "getSchema",
  args: [uid],
});
if (existente.uid !== `0x${"0".repeat(64)}`) {
  console.log("Ya estaba registrado. No hay nada que hacer.");
  process.exit(0);
}

const hash = await cartera.writeContract({
  address: REGISTRY,
  abi,
  functionName: "register",
  args: [SCHEMA, RESOLVER, REVOCABLE],
});
console.log("tx          :", `https://sepolia.arbiscan.io/tx/${hash}`);
await publico.waitForTransactionReceipt({ hash });

// Se relee de la cadena en vez de confiar en el recibo. Es la misma disciplina que usamos con
// las direcciones desplegadas: no se copian del registro de despliegue, se le preguntan al
// contrato.
const guardado = await publico.readContract({
  address: REGISTRY,
  abi,
  functionName: "getSchema",
  args: [uid],
});
console.log("UID en cadena:", guardado.uid);
console.log("texto        :", JSON.stringify(guardado.schema));
console.log(
  guardado.uid === uid
    ? "COINCIDE"
    : "NO COINCIDE — revisar el texto del schema",
);
