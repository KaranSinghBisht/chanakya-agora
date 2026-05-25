import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

const ARC_RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const USDC_DECIMALS = 18;

export const provider = new ethers.JsonRpcProvider(ARC_RPC);

export function getWallet(privateKey: string) {
  return new ethers.Wallet(privateKey, provider);
}

export const parseUSDC = (amount: string) => ethers.parseUnits(amount, USDC_DECIMALS);
export const formatUSDC = (wei: bigint) => ethers.formatUnits(wei, USDC_DECIMALS);

const MARKET_FACTORY_ABI = [
  "function registerAgent(address agent, string name, string specialty) external",
  "function createMarket(string question, bytes32 questionHash, string sourceUrl, uint256 expiry) external returns (address)",
  "function sendMessage(address to, string content, uint256 price) external",
  "function getMarketsCount() view returns (uint256)",
  "function getAllMarkets() view returns (address[])",
  "function getMarket(uint256 index) view returns (address)",
  "function getAgentCount() view returns (uint256)",
  "function getAllAgents() view returns (address[])",
  "function getAgent(address agent) view returns (tuple(string name, string specialty, bool registered, uint256 marketsCreated, uint256 totalFeesEarned))",
  "function getMessagesCount() view returns (uint256)",
  "function getMessages(uint256 from, uint256 count) view returns (tuple(address from, address to, string content, uint256 timestamp, uint256 price)[])",
  "event MarketCreated(address indexed market, address indexed agent, string question, bytes32 questionHash, uint256 expiry)",
  "event AgentRegistered(address indexed agent, string name, string specialty)",
  "event MessageSent(address indexed from, address indexed to, string content, uint256 price)",
];

const MARKET_ABI = [
  "function placeBet(bool isYes, uint256 amount) external",
  "function postTake(bool position, uint256 confidence, string reasoning, uint256 betAmount) external",
  "function proposeResolution(bool outcome) external",
  "function finalizeResolution() external",
  "function dispute() external",
  "function adminResolve(bool outcome) external",
  "function claim() external",
  "function question() view returns (string)",
  "function sourceUrl() view returns (string)",
  "function expiry() view returns (uint256)",
  "function yesPool() view returns (uint256)",
  "function noPool() view returns (uint256)",
  "function yesBets(address) view returns (uint256)",
  "function noBets(address) view returns (uint256)",
  "function state() view returns (uint8)",
  "function outcome() view returns (bool)",
  "function creator() view returns (address)",
  "function getOdds() view returns (uint256 yesProb, uint256 noProb, uint256 total)",
  "function getAllTakes() view returns (tuple(address agent, bool position, uint256 confidence, string reasoning, uint256 betAmount, uint256 timestamp)[])",
  "function getTakesCount() view returns (uint256)",
  "event BetPlaced(address indexed bettor, bool isYes, uint256 amount, uint256 fee)",
  "event TakePosted(address indexed agent, bool position, uint256 confidence, string reasoning, uint256 betAmount)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
];

const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

export function getFactoryContract(factoryAddress: string, signer?: ethers.Wallet) {
  return new ethers.Contract(factoryAddress, MARKET_FACTORY_ABI, signer || provider);
}

export function getMarketContract(marketAddress: string, signer?: ethers.Wallet) {
  return new ethers.Contract(marketAddress, MARKET_ABI, signer || provider);
}

export function getUSDCContract(signer?: ethers.Wallet) {
  return new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer || provider);
}

export async function ensureApproval(wallet: ethers.Wallet, spender: string, amount: bigint) {
  const usdc = getUSDCContract(wallet);
  const currentAllowance = await usdc.allowance(wallet.address, spender);
  if (currentAllowance < amount) {
    const tx = await usdc.approve(spender, ethers.MaxUint256);
    await tx.wait();
    return tx.hash;
  }
  return null;
}

export function hashQuestion(question: string): string {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

export { USDC_ADDRESS, USDC_DECIMALS };
