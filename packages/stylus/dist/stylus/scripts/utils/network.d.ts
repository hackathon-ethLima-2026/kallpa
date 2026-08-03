import { Address, Chain } from "viem";
export declare const SUPPORTED_NETWORKS: Record<string, Chain>;
export declare const ALIASES: Record<string, string>;
export declare const ORBIT_CHAINS: Chain[];
export declare function getChain(networkName: string): Chain | null;
export declare function getPrivateKey(networkName: string): string;
export declare const getAccountAddress: (networkName: string) => Address | undefined;
export declare function getRpcUrlFromChain(chain: Chain): string;
export declare function getBlockExplorerUrlFromChain(chain: Chain): string | undefined;
//# sourceMappingURL=network.d.ts.map