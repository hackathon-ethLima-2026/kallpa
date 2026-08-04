import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetNetworks } = scaffoldConfig;

rainbowkitBurnerWallet.rpcUrls = {
  [arbitrumNitro.id]: arbitrumNitro.rpcUrls.default.http[0],
};

/**
 * Aquí falta Coinbase Wallet a propósito, y conviene dejar escrito por qué.
 *
 * Si quien entra no tiene la extensión de Coinbase instalada, el conector abre una ventana que
 * crea una billetera con passkey: la Smart Wallet. Esa billetera **no opera en Arbitrum
 * Sepolia** —su documentación solo declara Base Sepolia y Sepolia como redes de prueba—, así
 * que la conexión se completa y después nada funciona, que es la peor forma de fallar.
 *
 * Tampoco se puede evitar desde aquí: el conector que expone RainbowKit 2.2.9 solo acepta
 * `appName` y `appIcon`, sin manera de forzar el modo de solo extensión. Ofrecer un botón que
 * lleva a un callejón sin salida es peor que no ofrecerlo, y quien tenga la extensión de
 * Coinbase igual puede entrar por WalletConnect.
 */
const wallets = [
  ...(!targetNetworks.some(network => network.id !== (arbitrumNitro as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
  braveWallet,
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  rainbowWallet,
  safeWallet,
];

/**
 * wagmi connectors for the wagmi context
 */
export const wagmiConnectors = () => {
  // Only create connectors on client-side to avoid SSR issues
  // TODO: update when https://github.com/rainbow-me/rainbowkit/issues/2476 is resolved
  if (typeof window === "undefined") {
    return [];
  }

  return connectorsForWallets(
    [
      {
        groupName: "Supported Wallets",
        wallets,
      },
    ],
    {
      appName: "Kallpa",
      projectId: scaffoldConfig.walletConnectProjectId,
    },
  );
};
