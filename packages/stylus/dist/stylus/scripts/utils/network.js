"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountAddress = exports.ORBIT_CHAINS = exports.ALIASES = exports.SUPPORTED_NETWORKS = void 0;
exports.getChain = getChain;
exports.getPrivateKey = getPrivateKey;
exports.getRpcUrlFromChain = getRpcUrlFromChain;
exports.getBlockExplorerUrlFromChain = getBlockExplorerUrlFromChain;
const chains_1 = require("viem/chains");
const supportedChains_1 = require("../../../nextjs/utils/scaffold-stylus/supportedChains");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const dotenv_1 = require("dotenv");
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    (0, dotenv_1.config)({ path: envPath });
}
exports.SUPPORTED_NETWORKS = {
    arbitrum: chains_1.arbitrum,
    arbitrumSepolia: chains_1.arbitrumSepolia,
    arbitrumNitro: supportedChains_1.arbitrumNitro,
    arbitrumNova: chains_1.arbitrumNova,
    eduChainTestnet: supportedChains_1.eduChainTestnet,
    eduChain: supportedChains_1.eduChain,
    superposition: supportedChains_1.superposition,
    superpositionTestnet: supportedChains_1.superpositionTestnet,
};
exports.ALIASES = {
    mainnet: "arbitrum",
    sepolia: "arbitrumSepolia",
    devnet: "arbitrumNitro",
    nova: "arbitrumNova",
    educhainTesnet: "eduChainTestnet",
    educhain: "eduChain",
    superposition: "superposition",
    superpositionTestnet: "superpositionTestnet",
};
// TODO: add more compatible Orbit Chains here
exports.ORBIT_CHAINS = [
    supportedChains_1.eduChain,
    supportedChains_1.eduChainTestnet,
    supportedChains_1.superposition,
    supportedChains_1.superpositionTestnet,
];
function getChain(networkName) {
    try {
        // First try exact match (for camelCase aliases)
        let actualNetworkName = exports.ALIASES[networkName] || networkName;
        // If no exact match, try lowercase match (for backward compatibility)
        if (actualNetworkName === networkName) {
            actualNetworkName = exports.ALIASES[networkName.toLowerCase()] || networkName;
        }
        const chainEntry = Object.entries(exports.SUPPORTED_NETWORKS).find(([key]) => key.toLowerCase() === actualNetworkName.toLowerCase());
        if (chainEntry)
            return chainEntry[1];
        const supportedNetworks = Object.keys(exports.SUPPORTED_NETWORKS);
        console.warn(`⚠️  Network '${networkName}' is not supported. Supported networks: ${supportedNetworks.join(", ")}`);
        return null;
    }
    catch (error) {
        console.error(`Error getting chain for network ${networkName}:`, error);
        return null;
    }
}
function getPrivateKey(networkName) {
    // First try exact match (for camelCase aliases)
    let actualNetworkName = exports.ALIASES[networkName] || networkName;
    // If no exact match, try lowercase match (for backward compatibility)
    if (actualNetworkName === networkName) {
        actualNetworkName = exports.ALIASES[networkName.toLowerCase()] || networkName;
    }
    switch (actualNetworkName.toLowerCase()) {
        case "arbitrum":
            if (process.env["PRIVATE_KEY_MAINNET"]) {
                return process.env["PRIVATE_KEY_MAINNET"];
            }
            else {
                throw new Error("PRIVATE_KEY_MAINNET is not set");
            }
        case "arbitrumsepolia":
            if (process.env["PRIVATE_KEY_SEPOLIA"]) {
                return process.env["PRIVATE_KEY_SEPOLIA"];
            }
            else {
                throw new Error("PRIVATE_KEY_SEPOLIA is not set");
            }
        case "arbitrumnova":
            if (process.env["PRIVATE_KEY_NOVA"]) {
                return process.env["PRIVATE_KEY_NOVA"];
            }
            else {
                throw new Error("PRIVATE_KEY_NOVA is not set");
            }
        case "educhaintestnet":
            if (process.env["PRIVATE_KEY_EDUCHAIN_TESTNET"]) {
                return process.env["PRIVATE_KEY_EDUCHAIN_TESTNET"];
            }
            else {
                throw new Error("PRIVATE_KEY_EDUCHAIN_TESTNET is not set");
            }
        case "educhain":
            if (process.env["PRIVATE_KEY_EDUCHAIN"]) {
                return process.env["PRIVATE_KEY_EDUCHAIN"];
            }
            else {
                throw new Error("PRIVATE_KEY_EDUCHAIN is not set");
            }
        case "superposition":
            if (process.env["PRIVATE_KEY_SUPERPOSITION"]) {
                return process.env["PRIVATE_KEY_SUPERPOSITION"];
            }
            else {
                throw new Error("PRIVATE_KEY_SUPERPOSITION is not set");
            }
        case "superpositiontestnet":
            if (process.env["PRIVATE_KEY_SUPERPOSITION_TESTNET"]) {
                return process.env["PRIVATE_KEY_SUPERPOSITION_TESTNET"];
            }
            else {
                throw new Error("PRIVATE_KEY_SUPERPOSITION_TESTNET is not set");
            }
        default:
            return (process.env["PRIVATE_KEY"] ||
                "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659");
    }
}
const getAccountAddress = (networkName) => {
    // First try exact match (for camelCase aliases)
    let actualNetworkName = exports.ALIASES[networkName] || networkName;
    // If no exact match, try lowercase match (for backward compatibility)
    if (actualNetworkName === networkName) {
        actualNetworkName = exports.ALIASES[networkName.toLowerCase()] || networkName;
    }
    switch (actualNetworkName.toLowerCase()) {
        case "arbitrum":
            return process.env["ACCOUNT_ADDRESS_MAINNET"];
        case "arbitrumsepolia":
            return process.env["ACCOUNT_ADDRESS_SEPOLIA"];
        case "arbitrumnova":
            return process.env["ACCOUNT_ADDRESS_NOVA"];
        case "educhaintestnet":
            return process.env["ACCOUNT_ADDRESS_EDUCHAIN_TESTNET"];
        case "educhain":
            return process.env["ACCOUNT_ADDRESS_EDUCHAIN"];
        case "superposition":
            return process.env["ACCOUNT_ADDRESS_SUPERPOSITION"];
        case "superpositiontestnet":
            return process.env["ACCOUNT_ADDRESS_SUPERPOSITION_TESTNET"];
        default:
            return (process.env["ACCOUNT_ADDRESS"] ||
                "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E");
    }
};
exports.getAccountAddress = getAccountAddress;
function getRpcUrlFromChain(chain) {
    //Prefer user rpc url from env
    switch (chain.id) {
        case chains_1.arbitrum.id:
            if (process.env["RPC_URL_MAINNET"]) {
                return process.env["RPC_URL_MAINNET"];
            }
            break;
        case chains_1.arbitrumSepolia.id:
            if (process.env["RPC_URL_SEPOLIA"]) {
                return process.env["RPC_URL_SEPOLIA"];
            }
            break;
        case chains_1.arbitrumNova.id:
            if (process.env["RPC_URL_NOVA"]) {
                return process.env["RPC_URL_NOVA"];
            }
            break;
        case supportedChains_1.eduChainTestnet.id:
            if (process.env["RPC_URL_EDUCHAIN_TESTNET"]) {
                return process.env["RPC_URL_EDUCHAIN_TESTNET"];
            }
            break;
        case supportedChains_1.eduChain.id:
            if (process.env["RPC_URL_EDUCHAIN"]) {
                return process.env["RPC_URL_EDUCHAIN"];
            }
            break;
        case supportedChains_1.superposition.id:
            if (process.env["RPC_URL_SUPERPOSITION"]) {
                return process.env["RPC_URL_SUPERPOSITION"];
            }
            break;
        case supportedChains_1.superpositionTestnet.id:
            if (process.env["RPC_URL_SUPERPOSITION_TESTNET"]) {
                return process.env["RPC_URL_SUPERPOSITION_TESTNET"];
            }
            break;
        default:
            if (process.env["RPC_URL"]) {
                return process.env["RPC_URL"];
            }
    }
    if (chain.rpcUrls?.default?.http && chain.rpcUrls.default.http.length > 0) {
        return chain.rpcUrls.default.http[0];
    }
    if ("public" in chain.rpcUrls &&
        chain.rpcUrls.public?.http &&
        chain.rpcUrls.public.http.length > 0) {
        return chain.rpcUrls.public.http[0];
    }
    throw new Error(`No RPC URL found for chain ${chain.name}`);
}
function getBlockExplorerUrlFromChain(chain) {
    return (chain.blockExplorers?.default?.url || chain.blockExplorers?.etherscan?.url);
}
//# sourceMappingURL=network.js.map