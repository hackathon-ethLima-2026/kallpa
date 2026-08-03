"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils/");
const utils_2 = require("./utils/");
function testNetworkFunctionality() {
    console.log("🧪 Testing network functionality...\n");
    const testNetworks = [...Object.keys(utils_2.SUPPORTED_NETWORKS)];
    testNetworks.forEach((network) => {
        const chain = (0, utils_1.getChain)(network);
        if (chain) {
            console.log(`✅ ${network}: ${(0, utils_1.getRpcUrlFromChain)(chain)}`);
        }
        else {
            console.log(`❌ ${network}: Not found in viem chains`);
        }
    });
    console.log("\n📝 Usage examples:");
    Object.keys(utils_2.SUPPORTED_NETWORKS).forEach((network) => {
        const chain = (0, utils_1.getChain)(network);
        // Find the alias for this network (reverse lookup)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const alias = Object.entries(utils_1.ALIASES).find(([_, value]) => value === network)?.[0];
        const networkName = alias || network;
        console.log(`  yarn deploy --network ${networkName}\t# Deploy to ${chain?.name}`);
    });
}
if (require.main === module) {
    testNetworkFunctionality();
}
//# sourceMappingURL=test_network.js.map