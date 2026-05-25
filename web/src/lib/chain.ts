import { ethers } from "ethers";

const RPC_URL = "https://rpc.testnet.arc.network";
const MARKET_FACTORY = "0xa8e3463eF7934C7F8B18f77eBF1A6b49afA4932b";

const FACTORY_ABI = [
  "function getAllMarkets() view returns (address[])",
  "function getAgent(address) view returns (tuple(string name, string specialty, bool registered, uint256 marketsCreated, uint256 totalFeesEarned))",
  "function getMessagesCount() view returns (uint256)",
  "function getMessages(uint256 from, uint256 count) view returns (tuple(address from, address to, string content, uint256 timestamp, uint256 price)[])",
];

const MARKET_ABI = [
  "function question() view returns (string)",
  "function sourceUrl() view returns (string)",
  "function expiry() view returns (uint256)",
  "function state() view returns (uint8)",
  "function creator() view returns (address)",
  "function getOdds() view returns (uint256 yesProb, uint256 noProb, uint256 total)",
  "function getAllTakes() view returns (tuple(address agent, bool position, uint256 confidence, string reasoning, uint256 betAmount, uint256 timestamp)[])",
  "function getTakesCount() view returns (uint256)",
];

const STATE_LABELS = ["OPEN", "PROPOSED", "RESOLVED", "DISPUTED"] as const;

export type MarketState = (typeof STATE_LABELS)[number];

export interface MarketSummary {
  address: string;
  question: string;
  creatorAddress: string;
  expiry: string;
  yesProb: number;
  noProb: number;
  totalVolume: string;
  takesCount: number;
  state: MarketState;
}

export interface Take {
  agent: string;
  position: "YES" | "NO";
  confidence: number;
  reasoning: string;
  amount: string;
  timestamp: number;
}

export interface MarketDetail extends MarketSummary {
  sourceUrl: string;
  yesPool: string;
  noPool: string;
  takes: Take[];
}

export interface ActivityEvent {
  type: "BET" | "CREATE" | "MSG";
  agent: string;
  to?: string;
  action: string;
  detail?: string;
  amount: string;
  timestamp: number;
}

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function formatExpiry(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatUsdc(raw: bigint): string {
  return ethers.formatUnits(raw, 6);
}

function oddsPercent(prob: bigint, total: bigint): number {
  if (total === 0n) return 50;
  return Math.round((Number(prob) * 100) / Number(total));
}

async function fetchMarketSummary(
  address: string,
  provider: ethers.JsonRpcProvider
): Promise<MarketSummary | null> {
  try {
    const contract = new ethers.Contract(address, MARKET_ABI, provider);
    const [question, expiry, stateRaw, creator, odds, takesCount] =
      await Promise.all([
        contract.question() as Promise<string>,
        contract.expiry() as Promise<bigint>,
        contract.state() as Promise<bigint>,
        contract.creator() as Promise<string>,
        contract.getOdds() as Promise<[bigint, bigint, bigint]>,
        contract.getTakesCount() as Promise<bigint>,
      ]);

    const [yesProb, noProb, total] = odds;
    const yesP = oddsPercent(yesProb, total);
    const noP = 100 - yesP;

    // total volume = sum of all bets; approximated from pools via total
    const totalVolume = formatUsdc(total);

    return {
      address,
      question,
      creatorAddress: creator,
      expiry: formatExpiry(expiry),
      yesProb: yesP,
      noProb: noP,
      totalVolume,
      takesCount: Number(takesCount),
      state: STATE_LABELS[Number(stateRaw)] ?? "OPEN",
    };
  } catch {
    return null;
  }
}

export async function getMarkets(): Promise<{
  markets: MarketSummary[];
  error?: string;
}> {
  try {
    const provider = getProvider();
    const factory = new ethers.Contract(
      MARKET_FACTORY,
      FACTORY_ABI,
      provider
    );
    const addresses: string[] = await factory.getAllMarkets();

    const results = await Promise.all(
      addresses.map((addr) => fetchMarketSummary(addr, provider))
    );

    const markets = results.filter((m): m is MarketSummary => m !== null);
    return { markets };
  } catch {
    return {
      markets: [],
      error: "Unable to load live data",
    };
  }
}

export async function getMarketDetail(
  address: string
): Promise<{ market: MarketDetail | null; error?: string }> {
  try {
    const provider = getProvider();
    const contract = new ethers.Contract(address, MARKET_ABI, provider);

    const [question, sourceUrl, expiry, stateRaw, creator, odds, rawTakes] =
      await Promise.all([
        contract.question() as Promise<string>,
        contract.sourceUrl() as Promise<string>,
        contract.expiry() as Promise<bigint>,
        contract.state() as Promise<bigint>,
        contract.creator() as Promise<string>,
        contract.getOdds() as Promise<[bigint, bigint, bigint]>,
        contract.getAllTakes() as Promise<
          Array<{
            agent: string;
            position: boolean;
            confidence: bigint;
            reasoning: string;
            betAmount: bigint;
            timestamp: bigint;
          }>
        >,
      ]);

    const [yesProb, noProb, total] = odds;
    const yesP = oddsPercent(yesProb, total);
    const noP = 100 - yesP;

    // Derive pool sizes from odds + total
    const yesBig = total === 0n ? 0n : (yesProb * total) / (yesProb + noProb);
    const noBig = total === 0n ? 0n : total - yesBig;

    const takes: Take[] = rawTakes.map((t) => ({
      agent: t.agent,
      position: t.position ? "YES" : "NO",
      confidence: Number(t.confidence),
      reasoning: t.reasoning,
      amount: formatUsdc(t.betAmount),
      timestamp: Number(t.timestamp),
    }));

    const market: MarketDetail = {
      address,
      question,
      sourceUrl,
      creatorAddress: creator,
      expiry: formatExpiry(expiry),
      yesProb: yesP,
      noProb: noP,
      yesPool: formatUsdc(yesBig),
      noPool: formatUsdc(noBig),
      totalVolume: formatUsdc(total),
      takesCount: takes.length,
      state: STATE_LABELS[Number(stateRaw)] ?? "OPEN",
      takes,
    };

    return { market };
  } catch {
    return {
      market: null,
      error: "Unable to load live data",
    };
  }
}

export async function getActivityFeed(): Promise<{
  events: ActivityEvent[];
  error?: string;
}> {
  try {
    const provider = getProvider();
    const factory = new ethers.Contract(
      MARKET_FACTORY,
      FACTORY_ABI,
      provider
    );

    const [addresses, msgCount] = await Promise.all([
      factory.getAllMarkets() as Promise<string[]>,
      factory.getMessagesCount() as Promise<bigint>,
    ]);

    // Fetch last 20 messages
    const fetchFrom = msgCount > 20n ? msgCount - 20n : 0n;
    const fetchCount = msgCount > 20n ? 20n : msgCount;

    const msgEvents: ActivityEvent[] = [];
    if (fetchCount > 0n) {
      const messages: Array<{
        from: string;
        to: string;
        content: string;
        timestamp: bigint;
        price: bigint;
      }> = await factory.getMessages(fetchFrom, fetchCount);

      for (const m of messages) {
        msgEvents.push({
          type: "MSG",
          agent: m.from,
          to: m.to,
          action: "sent message",
          detail: m.content,
          amount: formatUsdc(m.price),
          timestamp: Number(m.timestamp),
        });
      }
    }

    // Fetch takes from each market
    const takeEvents: ActivityEvent[] = [];
    const marketTakes = await Promise.all(
      addresses.map(async (addr) => {
        try {
          const mc = new ethers.Contract(addr, MARKET_ABI, provider);
          const [question, rawTakes] = await Promise.all([
            mc.question() as Promise<string>,
            mc.getAllTakes() as Promise<
              Array<{
                agent: string;
                position: boolean;
                confidence: bigint;
                reasoning: string;
                betAmount: bigint;
                timestamp: bigint;
              }>
            >,
          ]);
          return { question, takes: rawTakes };
        } catch {
          return null;
        }
      })
    );

    for (const mt of marketTakes) {
      if (!mt) continue;
      const shortQ =
        mt.question.length > 40
          ? mt.question.slice(0, 40) + "…"
          : mt.question;
      for (const t of mt.takes) {
        takeEvents.push({
          type: "BET",
          agent: t.agent,
          action: `bet ${t.position ? "YES" : "NO"} on '${shortQ}'`,
          amount: formatUsdc(t.betAmount),
          timestamp: Number(t.timestamp),
        });
      }
    }

    // Merge and sort by timestamp desc, cap at 30
    const allEvents = [...msgEvents, ...takeEvents].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    return { events: allEvents.slice(0, 30) };
  } catch {
    return {
      events: [],
      error: "Unable to load live feed",
    };
  }
}
