import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as dotenv from "dotenv";
import {
  provider,
  getWallet,
  getFactoryContract,
  getMarketContract,
  getUSDCContract,
  ensureApproval,
  hashQuestion,
  parseUSDC,
  formatUSDC,
  USDC_ADDRESS,
} from "./lib/contracts.js";
import { saveMarketMeta, saveTake, saveMessage, getTakes, getMessages, getMarketsMeta } from "./lib/db.js";

dotenv.config({ path: "../../.env" });

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY || "";

const server = new McpServer({
  name: "chanakya-agora",
  version: "1.0.0",
});

function getAgentWallet() {
  if (!AGENT_KEY) throw new Error("AGENT_PRIVATE_KEY not set");
  return getWallet(AGENT_KEY);
}

function factory(signer?: ReturnType<typeof getWallet>) {
  return getFactoryContract(FACTORY_ADDRESS, signer);
}

server.tool(
  "get_markets",
  "List all open prediction markets with current odds",
  {},
  async () => {
    try {
      const f = factory();
      const marketAddresses: string[] = await f.getAllMarkets();
      const markets = [];

      for (const addr of marketAddresses) {
        const m = getMarketContract(addr);
        const [question, expiry, state, creator] = await Promise.all([
          m.question(),
          m.expiry(),
          m.state(),
          m.creator(),
        ]);
        const [yesProb, noProb, total] = await m.getOdds();

        markets.push({
          address: addr,
          question,
          expiry: Number(expiry),
          expiryDate: new Date(Number(expiry) * 1000).toISOString(),
          state: ["OPEN", "PROPOSED", "RESOLVED", "DISPUTED"][Number(state)],
          creator,
          odds: { yes: Number(yesProb), no: Number(noProb) },
          totalVolume: formatUSDC(total),
        });
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(markets, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "create_market",
  "Create a new prediction market from a news event. Provide a clear binary question, resolution source URL, and expiry timestamp.",
  {
    question: z.string().describe("Binary YES/NO question, e.g. 'Will RBI cut the repo rate on June 6, 2026?'"),
    source_url: z.string().describe("URL of the resolution source (e.g. RBI press release page)"),
    expiry_timestamp: z.number().describe("Unix timestamp when the market expires"),
    initial_probability: z.number().min(1).max(99).describe("Your estimated probability of YES outcome (1-99)"),
    reasoning: z.string().describe("Your reasoning for creating this market and setting this probability"),
  },
  async ({ question, source_url, expiry_timestamp, initial_probability, reasoning }) => {
    try {
      const wallet = getAgentWallet();
      const f = factory(wallet);
      const qHash = hashQuestion(question);

      const tx = await f.createMarket(question, qHash, source_url, expiry_timestamp);
      const receipt = await tx.wait();

      const event = receipt.logs.find((l: any) => {
        try {
          return f.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "MarketCreated";
        } catch { return false; }
      });

      let marketAddress = "";
      if (event) {
        const parsed = f.interface.parseLog({ topics: event.topics as string[], data: event.data });
        marketAddress = parsed?.args[0] || "";
      }

      saveMarketMeta(marketAddress, question, source_url, expiry_timestamp, wallet.address);

      if (marketAddress && initial_probability > 0) {
        const seedAmount = parseUSDC("100");
        const yesAmount = (seedAmount * BigInt(initial_probability)) / 100n;
        const noAmount = seedAmount - yesAmount;

        await ensureApproval(wallet, marketAddress, seedAmount);
        const market = getMarketContract(marketAddress, wallet);

        if (yesAmount > 0n) await (await market.placeBet(true, yesAmount)).wait();
        if (noAmount > 0n) await (await market.placeBet(false, noAmount)).wait();

        saveTake(marketAddress, wallet.address, true, initial_probability, reasoning, formatUSDC(yesAmount));
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            market: marketAddress,
            question,
            txHash: tx.hash,
            arcscan: `https://testnet.arcscan.app/tx/${tx.hash}`,
            initialProbability: initial_probability,
            reasoning,
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error creating market: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "place_bet",
  "Place a bet on an existing market. Post your reasoning explaining why you agree or disagree with current odds.",
  {
    market_address: z.string().describe("Address of the market to bet on"),
    position: z.enum(["YES", "NO"]).describe("Your bet: YES or NO"),
    amount: z.string().describe("Amount of USDC to bet (e.g. '50')"),
    confidence: z.number().min(1).max(100).describe("Your confidence level 1-100"),
    reasoning: z.string().describe("Your reasoning for this bet — be specific, cite data, disagree with other agents if needed"),
  },
  async ({ market_address, position, amount, confidence, reasoning }) => {
    try {
      const wallet = getAgentWallet();
      const market = getMarketContract(market_address, wallet);
      const betAmount = parseUSDC(amount);
      const isYes = position === "YES";

      await ensureApproval(wallet, market_address, betAmount);

      const tx = await market.postTake(isYes, confidence, reasoning, betAmount);
      const receipt = await tx.wait();

      saveTake(market_address, wallet.address, isYes, confidence, reasoning, amount, tx.hash);

      const [yesProb, noProb, total] = await market.getOdds();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            position,
            amount,
            confidence,
            reasoning,
            txHash: tx.hash,
            arcscan: `https://testnet.arcscan.app/tx/${tx.hash}`,
            newOdds: { yes: Number(yesProb), no: Number(noProb) },
            totalVolume: formatUSDC(total),
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error placing bet: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "send_message",
  "Send a private message to another agent. You can charge or pay USDC for intelligence sharing.",
  {
    to_address: z.string().describe("Wallet address of the recipient agent"),
    content: z.string().describe("Message content"),
    price: z.string().default("0").describe("USDC amount to pay the recipient for intelligence (0 for free messages)"),
  },
  async ({ to_address, content, price }) => {
    try {
      const wallet = getAgentWallet();
      const f = factory(wallet);
      const priceWei = parseUSDC(price);

      if (priceWei > 0n) {
        await ensureApproval(wallet, FACTORY_ADDRESS, priceWei);
      }

      const tx = await f.sendMessage(to_address, content, priceWei);
      await tx.wait();

      saveMessage(wallet.address, to_address, content, price, tx.hash);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            to: to_address,
            content,
            price,
            txHash: tx.hash,
            arcscan: `https://testnet.arcscan.app/tx/${tx.hash}`,
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error sending message: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_agent_profile",
  "Get an agent's profile including P&L, markets created, and bet history",
  {
    agent_address: z.string().describe("Wallet address of the agent"),
  },
  async ({ agent_address }) => {
    try {
      const f = factory();
      const profile = await f.getAgent(agent_address);
      const usdc = getUSDCContract();
      const balance = await usdc.balanceOf(agent_address);

      const agentMessages = getMessages(agent_address);
      const allMarkets = await f.getAllMarkets();

      let totalBets = 0;
      let positions: any[] = [];

      for (const addr of allMarkets) {
        const m = getMarketContract(addr);
        const yesBet = await m.yesBets(agent_address);
        const noBet = await m.noBets(agent_address);
        if (yesBet > 0n || noBet > 0n) {
          const question = await m.question();
          totalBets++;
          positions.push({
            market: addr,
            question,
            yesBet: formatUSDC(yesBet),
            noBet: formatUSDC(noBet),
          });
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            address: agent_address,
            name: profile.name,
            specialty: profile.specialty,
            registered: profile.registered,
            marketsCreated: Number(profile.marketsCreated),
            balance: formatUSDC(balance),
            totalBets,
            positions,
            recentMessages: agentMessages.slice(0, 10),
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_market_detail",
  "Get detailed info about a specific market including debate thread and all agent takes",
  {
    market_address: z.string().describe("Address of the market"),
  },
  async ({ market_address }) => {
    try {
      const m = getMarketContract(market_address);
      const [question, sourceUrl, expiry, state, creator, yesPool, noPool] = await Promise.all([
        m.question(), m.sourceUrl(), m.expiry(), m.state(), m.creator(), m.yesPool(), m.noPool(),
      ]);
      const [yesProb, noProb, total] = await m.getOdds();
      const takes = await m.getAllTakes();

      const formattedTakes = takes.map((t: any) => ({
        agent: t.agent,
        position: t.position ? "YES" : "NO",
        confidence: Number(t.confidence),
        reasoning: t.reasoning,
        betAmount: formatUSDC(t.betAmount),
        timestamp: new Date(Number(t.timestamp) * 1000).toISOString(),
      }));

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            address: market_address,
            question,
            sourceUrl,
            expiry: Number(expiry),
            expiryDate: new Date(Number(expiry) * 1000).toISOString(),
            state: ["OPEN", "PROPOSED", "RESOLVED", "DISPUTED"][Number(state)],
            creator,
            odds: { yes: Number(yesProb), no: Number(noProb) },
            yesPool: formatUSDC(yesPool),
            noPool: formatUSDC(noPool),
            totalVolume: formatUSDC(total),
            debate: formattedTakes,
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_leaderboard",
  "Get all agents ranked by balance and activity",
  {},
  async () => {
    try {
      const f = factory();
      const agentAddresses = await f.getAllAgents();
      const usdc = getUSDCContract();
      const leaderboard = [];

      for (const addr of agentAddresses) {
        const profile = await f.getAgent(addr);
        const balance = await usdc.balanceOf(addr);
        leaderboard.push({
          address: addr,
          name: profile.name,
          specialty: profile.specialty,
          marketsCreated: Number(profile.marketsCreated),
          balance: formatUSDC(balance),
          balanceRaw: balance,
        });
      }

      leaderboard.sort((a, b) => (b.balanceRaw > a.balanceRaw ? 1 : -1));
      const ranked = leaderboard.map(({ balanceRaw, ...rest }, i) => ({ rank: i + 1, ...rest }));

      return { content: [{ type: "text" as const, text: JSON.stringify(ranked, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_my_balance",
  "Check your USDC balance on Arc testnet",
  {},
  async () => {
    try {
      const wallet = getAgentWallet();
      const usdc = getUSDCContract();
      const balance = await usdc.balanceOf(wallet.address);
      const nativeBalance = await provider.getBalance(wallet.address);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            address: wallet.address,
            usdcBalance: formatUSDC(balance),
            nativeBalance: formatUSDC(nativeBalance),
          }, null, 2),
        }],
      };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Chanakya MCP server running");
}

main().catch(console.error);
