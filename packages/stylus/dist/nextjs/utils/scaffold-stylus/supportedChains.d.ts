import { arbitrum, arbitrumSepolia, arbitrumNova, eduChainTestnet, eduChain, superposition } from "viem/chains";
declare const arbitrumNitro: {
    blockExplorers?: {
        [key: string]: {
            name: string;
            url: string;
            apiUrl?: string | undefined;
        };
        default: {
            name: string;
            url: string;
            apiUrl?: string | undefined;
        };
    } | undefined | undefined;
    blockTime?: number | undefined | undefined;
    contracts?: {
        [x: string]: import("viem").ChainContract | {
            [sourceId: number]: import("viem").ChainContract | undefined;
        } | undefined;
        ensRegistry?: import("viem").ChainContract | undefined;
        ensUniversalResolver?: import("viem").ChainContract | undefined;
        multicall3?: import("viem").ChainContract | undefined;
        erc6492Verifier?: import("viem").ChainContract | undefined;
    } | undefined;
    ensTlds?: readonly string[] | undefined;
    id: 412346;
    name: "Nitro DevNode";
    nativeCurrency: {
        readonly name: "Ether";
        readonly symbol: "ETH";
        readonly decimals: 18;
    };
    experimental_preconfirmationTime?: number | undefined | undefined;
    rpcUrls: {
        readonly default: {
            readonly http: readonly ["http://localhost:8547"];
        };
        readonly public: {
            readonly http: readonly ["http://localhost:8547"];
        };
    };
    sourceId?: number | undefined | undefined;
    testnet?: boolean | undefined | undefined;
    custom?: Record<string, unknown> | undefined;
    fees?: import("viem").ChainFees<undefined> | undefined;
    formatters?: undefined;
    serializers?: import("viem").ChainSerializers<undefined, import("viem").TransactionSerializable> | undefined;
    readonly network: "arbitrum-nitro";
    readonly accounts: readonly [{
        readonly privateKey: "0xb6b15c8cb491557369f3c7d2c287b053eb229daa9c22138887752191c9520659";
        readonly address: "0x3f1Eae7D46d88F08fc2F8ed27FCb2AB183EB2d0E";
    }, {
        readonly privateKey: "0x64cf8b4376aca8e153f2aca74b7f5f59e19b8bbb2da594a98095729ba12a9f6c";
        readonly address: "0xDD09b55496EaA3cFAe23137ABDeA52a9a979B70e";
    }, {
        readonly privateKey: "0x7a56d99de9eb0977d6dfab1f8465b2705a4c3ca9342ad4fc8cc97aa6f42056c4";
        readonly address: "0xE9cB1563bE49002383D08386ee287aF7BAD08c3b";
    }, {
        readonly privateKey: "0xc011740e64cd1bcefb4b5b869ac1169f79e8524cd7c6d409b3fe5b7dfd92afa6";
        readonly address: "0x838d568Ffb16BC74083e88fd769df85E8d3afcE6";
    }, {
        readonly privateKey: "0xf2e04103742c7623c6019ca2b7e4710c1bad9bde003383d29f92c6be026fa29c";
        readonly address: "0xA491d1134388c78AeEDf6b1Ca3F21657015Ff8E1";
    }];
};
declare const superpositionTestnet: {
    blockExplorers: {
        readonly default: {
            readonly name: "Superposition Testnet Explorer";
            readonly url: "https://testnet-explorer.superposition.so/";
        };
    };
    blockTime?: number | undefined | undefined;
    contracts?: {
        [x: string]: import("viem").ChainContract | {
            [sourceId: number]: import("viem").ChainContract | undefined;
        } | undefined;
        ensRegistry?: import("viem").ChainContract | undefined;
        ensUniversalResolver?: import("viem").ChainContract | undefined;
        multicall3?: import("viem").ChainContract | undefined;
        erc6492Verifier?: import("viem").ChainContract | undefined;
    } | undefined;
    ensTlds?: readonly string[] | undefined;
    id: 98985;
    name: "Superposition Testnet";
    nativeCurrency: {
        readonly name: "SPN";
        readonly symbol: "SPN";
        readonly decimals: 18;
    };
    experimental_preconfirmationTime?: number | undefined | undefined;
    rpcUrls: {
        readonly default: {
            readonly http: readonly ["https://testnet-rpc.superposition.so/"];
        };
        readonly public: {
            readonly http: readonly ["https://testnet-rpc.superposition.so/"];
        };
    };
    sourceId?: number | undefined | undefined;
    testnet: true;
    custom?: Record<string, unknown> | undefined;
    fees?: import("viem").ChainFees<undefined> | undefined;
    formatters?: undefined;
    serializers?: import("viem").ChainSerializers<undefined, import("viem").TransactionSerializable> | undefined;
    readonly network: "superposition-testnet";
};
export { arbitrum, arbitrumSepolia, arbitrumNova, arbitrumNitro, superposition, eduChainTestnet, superpositionTestnet, eduChain, };
//# sourceMappingURL=supportedChains.d.ts.map