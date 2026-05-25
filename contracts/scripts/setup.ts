import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const USDC = "0x3600000000000000000000000000000000000000";
const FUND_AMOUNT = ethers.parseUnits("500", 18); // 500 USDC per wallet

const AGENTS = [
  { key: process.env.AGENT1_PRIVATE_KEY!, address: process.env.AGENT1_ADDRESS!, name: "RBI Watcher", specialty: "Indian monetary policy and macroeconomics" },
  { key: process.env.AGENT2_PRIVATE_KEY!, address: process.env.AGENT2_ADDRESS!, name: "Macro Analyst", specialty: "Quantitative macro strategy and cross-border correlations" },
  { key: process.env.AGENT3_PRIVATE_KEY!, address: process.env.AGENT3_ADDRESS!, name: "Contrarian", specialty: "Skeptical devil's advocate and tail-risk analysis" },
];

const USER_KEYS = [
  process.env.USER1_KEY,
  process.env.USER2_KEY,
  process.env.USER3_KEY,
  process.env.USER4_KEY,
  process.env.USER5_KEY,
].filter(Boolean) as string[];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatUnits(balance, 18), "USDC\n");

  // 1. Deploy MarketFactory
  console.log("=== Deploying MarketFactory ===");
  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy(USDC, 3600);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`MarketFactory: ${factoryAddr}`);
  console.log(`ArcScan: https://testnet.arcscan.app/address/${factoryAddr}\n`);

  // 2. Register agents
  console.log("=== Registering Agents ===");
  for (const agent of AGENTS) {
    const tx = await factory.registerAgent(agent.address, agent.name, agent.specialty);
    await tx.wait();
    console.log(`Registered ${agent.name} (${agent.address})`);
  }

  // 3. Fund agent wallets
  console.log("\n=== Funding Agent Wallets ===");
  for (const agent of AGENTS) {
    const tx = await deployer.sendTransaction({
      to: agent.address,
      value: FUND_AMOUNT,
    });
    await tx.wait();
    console.log(`Funded ${agent.name} with 500 USDC`);
  }

  // 4. Fund user wallets
  console.log("\n=== Funding User Wallets ===");
  const userFund = ethers.parseUnits("100", 18);
  for (let i = 0; i < USER_KEYS.length; i++) {
    const userWallet = new ethers.Wallet(USER_KEYS[i], ethers.provider);
    const tx = await deployer.sendTransaction({
      to: userWallet.address,
      value: userFund,
    });
    await tx.wait();
    console.log(`Funded User ${i + 1} (${userWallet.address}) with 100 USDC`);
  }

  console.log("\n=== DONE ===");
  console.log(`\nAdd to .env:\nFACTORY_ADDRESS=${factoryAddr}`);
  console.log(`\nTotal USDC spent: ${ethers.formatUnits(FUND_AMOUNT * BigInt(AGENTS.length) + userFund * BigInt(USER_KEYS.length), 18)} USDC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
