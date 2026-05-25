import { ethers } from "hardhat";

async function main() {
  const USDC = "0x3600000000000000000000000000000000000000";
  const CHALLENGE_WINDOW = 3600; // 1 hour

  console.log("Deploying MarketFactory...");
  const Factory = await ethers.getContractFactory("MarketFactory");
  const factory = await Factory.deploy(USDC, CHALLENGE_WINDOW);
  await factory.waitForDeployment();

  const addr = await factory.getAddress();
  console.log(`MarketFactory deployed to: ${addr}`);
  console.log(`USDC: ${USDC}`);
  console.log(`Challenge window: ${CHALLENGE_WINDOW}s`);
  console.log(`\nVerify on ArcScan: https://testnet.arcscan.app/address/${addr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
