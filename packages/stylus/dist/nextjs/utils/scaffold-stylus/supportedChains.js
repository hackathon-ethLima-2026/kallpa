"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eduChain = exports.superpositionTestnet = exports.eduChainTestnet = exports.superposition = exports.arbitrumNitro = exports.arbitrumNova = exports.arbitrumSepolia = exports.arbitrum = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
Object.defineProperty(exports, "arbitrum", { enumerable: true, get: function () { return chains_1.arbitrum; } });
Object.defineProperty(exports, "arbitrumSepolia", { enumerable: true, get: function () { return chains_1.arbitrumSepolia; } });
Object.defineProperty(exports, "arbitrumNova", { enumerable: true, get: function () { return chains_1.arbitrumNova; } });
Object.defineProperty(exports, "eduChainTestnet", { enumerable: true, get: function () { return chains_1.eduChainTestnet; } });
Object.defineProperty(exports, "eduChain", { enumerable: true, get: function () { return chains_1.eduChain; } });
Object.defineProperty(exports, "superposition", { enumerable: true, get: function () { return chains_1.superposition; } });
const arbitrumNitro = (0, viem_1.defineChain)({
    id: 412346,
    name: "Nitro DevNode",
    network: "arbitrum-nitro",
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ["http://localhost:8547"],
        },
        public: {
            http: ["http://localhost:8547"],
        },
    },
    accounts: [
        {
            privateKey: "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659",
            address: "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E",
        },
        {
            privateKey: "0x64cf8b4376aca8e153f2aca74b7f5f59e19b8bbb2da594a98095729ba12a9f6c",
            address: "0xDD09b55496EaA3cFAe23137ABDeA52a9a979B70e",
        },
        {
            privateKey: "0x7a56d99de9eb0977d6dfab1f8465b2705a4c3ca9342ad4fc8cc97aa6f42056c4",
            address: "0xE9cB1563bE49002383D08386ee287aF7BAD08c3b",
        },
        {
            privateKey: "0xc011740e64cd1bcefb4b5b869ac1169f79e8524cd7c6d409b3fe5b7dfd92afa6",
            address: "0x838d568Ffb16BC74083e88fd769df85E8d3afcE6",
        },
        {
            privateKey: "0xf2e04103742c7623c6019ca2b7e4710c1bad9bde003383d29f92c6be026fa29c",
            address: "0xA491d1134388c78AeEDf6b1Ca3F21657015Ff8E1",
        },
    ],
});
exports.arbitrumNitro = arbitrumNitro;
const superpositionTestnet = (0, viem_1.defineChain)({
    id: 98985,
    name: "Superposition Testnet",
    network: "superposition-testnet",
    nativeCurrency: {
        name: "SPN",
        symbol: "SPN",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ["https://testnet-rpc.superposition.so/"],
        },
        public: {
            http: ["https://testnet-rpc.superposition.so/"],
        },
    },
    blockExplorers: {
        default: {
            name: "Superposition Testnet Explorer",
            url: "https://testnet-explorer.superposition.so/",
        },
    },
    testnet: true,
});
exports.superpositionTestnet = superpositionTestnet;
//# sourceMappingURL=supportedChains.js.map