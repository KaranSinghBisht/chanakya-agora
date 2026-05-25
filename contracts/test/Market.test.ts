import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { MarketFactory, Market } from "../typechain-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deployMockUSDC(deployer: SignerWithAddress) {
  const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  return usdc;
}

async function mintAndApprove(
  usdc: Awaited<ReturnType<typeof deployMockUSDC>>,
  to: SignerWithAddress,
  spender: string,
  amount: bigint
) {
  await usdc.mint(to.address, amount);
  await usdc.connect(to).approve(spender, amount);
}

const CHALLENGE_WINDOW = 3600; // 1 hour
const QUESTION = "Will BTC exceed $100k by end of 2026?";
const SOURCE_URL = "https://coinmarketcap.com/currencies/bitcoin/";

async function setupFactory(deployer: SignerWithAddress, usdcAddr: string) {
  const Factory = await ethers.getContractFactory("MarketFactory", deployer);
  const factory = (await Factory.deploy(usdcAddr, CHALLENGE_WINDOW)) as unknown as MarketFactory;
  await factory.waitForDeployment();
  return factory;
}

async function registerAgent(
  factory: MarketFactory,
  agent: SignerWithAddress,
  name = "Agent Alpha",
  specialty = "macro"
) {
  const tx = await factory.registerAgent(agent.address, name, specialty);
  await tx.wait();
}

async function createMarket(
  factory: MarketFactory,
  agent: SignerWithAddress,
  question = QUESTION,
  expiryOffset = 86400 // 1 day
): Promise<Market> {
  const now = await time.latest();
  const expiry = now + expiryOffset;
  const tx = await factory.connect(agent).createMarket(question, SOURCE_URL, expiry);
  const receipt = await tx.wait();
  const event = receipt!.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "MarketCreated");

  const marketAddr = event!.args.market as string;
  return ethers.getContractAt("Market", marketAddr) as unknown as Promise<Market>;
}

// ---------------------------------------------------------------------------
// MockERC20 contract is defined inline via a separate artifact file below.
// We deploy it from a Hardhat factory, so we need it compiled first.
// ---------------------------------------------------------------------------

describe("MarketFactory", () => {
  let deployer: SignerWithAddress;
  let agent: SignerWithAddress;
  let agent2: SignerWithAddress;
  let user: SignerWithAddress;
  let usdc: Awaited<ReturnType<typeof deployMockUSDC>>;
  let factory: MarketFactory;

  beforeEach(async () => {
    [deployer, agent, agent2, user] = await ethers.getSigners();
    usdc = await deployMockUSDC(deployer);
    factory = await setupFactory(deployer, await usdc.getAddress());
  });

  // -------------------------------------------------------------------------
  // 1. Deployment
  // -------------------------------------------------------------------------
  describe("Deployment", () => {
    it("stores the USDC address", async () => {
      expect(await factory.usdc()).to.equal(await usdc.getAddress());
    });

    it("stores the challenge window", async () => {
      expect(await factory.challengeWindow()).to.equal(CHALLENGE_WINDOW);
    });

    it("sets the deployer as admin", async () => {
      expect(await factory.admin()).to.equal(deployer.address);
    });

    it("grants DEFAULT_ADMIN_ROLE to deployer", async () => {
      const role = await factory.DEFAULT_ADMIN_ROLE();
      expect(await factory.hasRole(role, deployer.address)).to.be.true;
    });
  });

  // -------------------------------------------------------------------------
  // 2. Agent registration
  // -------------------------------------------------------------------------
  describe("Agent registration", () => {
    it("admin can register an agent", async () => {
      await registerAgent(factory, agent, "Kautilya", "economics");
      const profile = await factory.getAgent(agent.address);
      expect(profile.registered).to.be.true;
      expect(profile.name).to.equal("Kautilya");
      expect(profile.specialty).to.equal("economics");
    });

    it("emits AgentRegistered event", async () => {
      await expect(factory.registerAgent(agent.address, "Kautilya", "economics"))
        .to.emit(factory, "AgentRegistered")
        .withArgs(agent.address, "Kautilya", "economics");
    });

    it("grants AGENT_ROLE to the registered address", async () => {
      await registerAgent(factory, agent);
      const role = await factory.AGENT_ROLE();
      expect(await factory.hasRole(role, agent.address)).to.be.true;
    });

    it("non-admin cannot register an agent", async () => {
      await expect(
        factory.connect(user).registerAgent(agent.address, "A", "B")
      ).to.be.reverted;
    });

    it("duplicate registration reverts with ALREADY_REGISTERED", async () => {
      await registerAgent(factory, agent);
      await expect(
        factory.registerAgent(agent.address, "Kautilya2", "politics")
      ).to.be.revertedWith("ALREADY_REGISTERED");
    });

    it("increments agent count after registration", async () => {
      expect(await factory.getAgentCount()).to.equal(0);
      await registerAgent(factory, agent);
      expect(await factory.getAgentCount()).to.equal(1);
      await registerAgent(factory, agent2, "Beta", "finance");
      expect(await factory.getAgentCount()).to.equal(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Market creation
  // -------------------------------------------------------------------------
  describe("Market creation", () => {
    beforeEach(async () => {
      await registerAgent(factory, agent);
    });

    it("registered agent can create a market", async () => {
      const market = await createMarket(factory, agent);
      expect(await market.getAddress()).to.be.properAddress;
    });

    it("emits MarketCreated event", async () => {
      const now = await time.latest();
      const expiry = now + 86400;
      await expect(
        factory.connect(agent).createMarket(QUESTION, SOURCE_URL, expiry)
      ).to.emit(factory, "MarketCreated");
    });

    it("increments markets count", async () => {
      expect(await factory.getMarketsCount()).to.equal(0);
      await createMarket(factory, agent, "Q1?");
      expect(await factory.getMarketsCount()).to.equal(1);
    });

    it("increments agent marketsCreated", async () => {
      await createMarket(factory, agent, "Q-counter?");
      const profile = await factory.getAgent(agent.address);
      expect(profile.marketsCreated).to.equal(1);
    });

    it("non-agent cannot create a market", async () => {
      const now = await time.latest();
      await expect(
        factory.connect(user).createMarket(QUESTION, SOURCE_URL, now + 86400)
      ).to.be.reverted;
    });

    it("duplicate question reverts with DUPLICATE", async () => {
      await createMarket(factory, agent, QUESTION);
      const now = await time.latest();
      await expect(
        factory.connect(agent).createMarket(QUESTION, SOURCE_URL, now + 86400)
      ).to.be.revertedWith("DUPLICATE");
    });

    it("past expiry reverts with EXPIRY_PAST", async () => {
      const past = (await time.latest()) - 1;
      await expect(
        factory.connect(agent).createMarket(QUESTION, SOURCE_URL, past)
      ).to.be.revertedWith("EXPIRY_PAST");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Market verification
  // -------------------------------------------------------------------------
  describe("Market verification (isMarket)", () => {
    beforeEach(async () => {
      await registerAgent(factory, agent);
    });

    it("returns true for a factory-created market", async () => {
      const market = await createMarket(factory, agent);
      expect(await factory.isMarket(await market.getAddress())).to.be.true;
    });

    it("returns false for a random address", async () => {
      expect(await factory.isMarket(user.address)).to.be.false;
    });

    it("getAllMarkets returns the correct list", async () => {
      const m1 = await createMarket(factory, agent, "Q-alpha?");
      const m2 = await createMarket(factory, agent, "Q-beta?");
      const all = await factory.getAllMarkets();
      expect(all).to.include(await m1.getAddress());
      expect(all).to.include(await m2.getAddress());
      expect(all.length).to.equal(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Market contract tests
// ---------------------------------------------------------------------------
describe("Market", () => {
  let deployer: SignerWithAddress;
  let agent: SignerWithAddress;
  let agent2: SignerWithAddress;
  let bettor1: SignerWithAddress;
  let bettor2: SignerWithAddress;
  let random: SignerWithAddress;
  let usdc: Awaited<ReturnType<typeof deployMockUSDC>>;
  let factory: MarketFactory;
  let market: Market;

  const BET = ethers.parseUnits("100", 6); // 100 USDC
  const FEE_BPS = 200n;

  function netAmount(amount: bigint): bigint {
    return amount - (amount * FEE_BPS) / 10000n;
  }

  beforeEach(async () => {
    [deployer, agent, agent2, bettor1, bettor2, random] = await ethers.getSigners();
    usdc = await deployMockUSDC(deployer);
    factory = await setupFactory(deployer, await usdc.getAddress());
    await registerAgent(factory, agent);

    market = await createMarket(factory, agent);
    const marketAddr = await market.getAddress();

    // Fund bettors
    await mintAndApprove(usdc, bettor1, marketAddr, ethers.parseUnits("10000", 6));
    await mintAndApprove(usdc, bettor2, marketAddr, ethers.parseUnits("10000", 6));
  });

  // -------------------------------------------------------------------------
  // 5. Placing bets
  // -------------------------------------------------------------------------
  describe("Placing bets", () => {
    it("YES bet updates yesPool and yesBets correctly", async () => {
      await market.connect(bettor1).placeBet(true, BET);
      const net = netAmount(BET);
      expect(await market.yesPool()).to.equal(net);
      expect(await market.yesBets(bettor1.address)).to.equal(net);
    });

    it("NO bet updates noPool and noBets correctly", async () => {
      await market.connect(bettor1).placeBet(false, BET);
      const net = netAmount(BET);
      expect(await market.noPool()).to.equal(net);
      expect(await market.noBets(bettor1.address)).to.equal(net);
    });

    it("2% fee goes to creator on YES bet", async () => {
      const creatorBefore = await usdc.balanceOf(agent.address);
      await market.connect(bettor1).placeBet(true, BET);
      const creatorAfter = await usdc.balanceOf(agent.address);
      const fee = (BET * FEE_BPS) / 10000n;
      expect(creatorAfter - creatorBefore).to.equal(fee);
    });

    it("2% fee goes to creator on NO bet", async () => {
      const creatorBefore = await usdc.balanceOf(agent.address);
      await market.connect(bettor1).placeBet(false, BET);
      const creatorAfter = await usdc.balanceOf(agent.address);
      const fee = (BET * FEE_BPS) / 10000n;
      expect(creatorAfter - creatorBefore).to.equal(fee);
    });

    it("emits BetPlaced event", async () => {
      const net = netAmount(BET);
      const fee = BET - net;
      await expect(market.connect(bettor1).placeBet(true, BET))
        .to.emit(market, "BetPlaced")
        .withArgs(bettor1.address, true, net, fee);
    });

    it("reverts with ZERO_AMOUNT for zero bet", async () => {
      await expect(market.connect(bettor1).placeBet(true, 0)).to.be.revertedWith("ZERO_AMOUNT");
    });

    it("reverts after market expiry", async () => {
      await time.increase(86401);
      await expect(market.connect(bettor1).placeBet(true, BET)).to.be.revertedWith("EXPIRED");
    });

    it("accumulates multiple bets from same bettor", async () => {
      await market.connect(bettor1).placeBet(true, BET);
      await market.connect(bettor1).placeBet(true, BET);
      expect(await market.yesBets(bettor1.address)).to.equal(netAmount(BET) * 2n);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Agent takes
  // -------------------------------------------------------------------------
  describe("Agent takes (postTake)", () => {
    beforeEach(async () => {
      const marketAddr = await market.getAddress();
      await mintAndApprove(usdc, agent, marketAddr, ethers.parseUnits("10000", 6));
    });

    it("stores take with correct fields (no bet)", async () => {
      await market.connect(agent).postTake(true, 80, "BTC is going to moon", 0);
      const take = await market.getTake(0);
      expect(take.agent).to.equal(agent.address);
      expect(take.position).to.be.true;
      expect(take.confidence).to.equal(80);
      expect(take.reasoning).to.equal("BTC is going to moon");
      expect(take.betAmount).to.equal(0);
    });

    it("postTake with betAmount also places a bet", async () => {
      await market.connect(agent).postTake(true, 75, "Bullish macro", BET);
      const net = netAmount(BET);
      expect(await market.yesPool()).to.equal(net);
      expect(await market.yesBets(agent.address)).to.equal(net);
    });

    it("emits TakePosted event", async () => {
      await expect(market.connect(agent).postTake(false, 60, "Bear market", 0))
        .to.emit(market, "TakePosted")
        .withArgs(agent.address, false, 60, "Bear market", 0);
    });

    it("getTakesCount increments per take", async () => {
      expect(await market.getTakesCount()).to.equal(0);
      await market.connect(agent).postTake(true, 70, "R1", 0);
      await market.connect(agent).postTake(false, 30, "R2", 0);
      expect(await market.getTakesCount()).to.equal(2);
    });

    it("getAllTakes returns all stored takes", async () => {
      await market.connect(agent).postTake(true, 70, "Reason A", 0);
      const all = await market.getAllTakes();
      expect(all.length).to.equal(1);
      expect(all[0].reasoning).to.equal("Reason A");
    });

    it("reverts postTake after market is not OPEN", async () => {
      // Expire and propose resolution
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await expect(
        market.connect(agent).postTake(true, 50, "Late", 0)
      ).to.be.revertedWith("WRONG_STATE");
    });
  });

  // -------------------------------------------------------------------------
  // 7. Resolution flow
  // -------------------------------------------------------------------------
  describe("Resolution flow", () => {
    beforeEach(async () => {
      await market.connect(bettor1).placeBet(true, BET);
      await market.connect(bettor2).placeBet(false, BET);
    });

    it("creator can propose resolution after expiry", async () => {
      await time.increase(86401);
      await expect(market.connect(agent).proposeResolution(true))
        .to.emit(market, "ResolutionProposed")
        .withArgs(agent.address, true);
      expect(await market.state()).to.equal(1); // PROPOSED
    });

    it("admin can propose resolution after expiry", async () => {
      await time.increase(86401);
      await market.connect(deployer).proposeResolution(false);
      expect(await market.state()).to.equal(1); // PROPOSED
    });

    it("non-creator/admin cannot propose", async () => {
      await time.increase(86401);
      await expect(
        market.connect(bettor1).proposeResolution(true)
      ).to.be.revertedWith("NOT_AUTHORIZED");
    });

    it("cannot propose before expiry", async () => {
      await expect(
        market.connect(agent).proposeResolution(true)
      ).to.be.revertedWith("NOT_EXPIRED");
    });

    it("finalizeResolution works after challenge window", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await time.increase(CHALLENGE_WINDOW + 1);
      await expect(market.finalizeResolution())
        .to.emit(market, "ResolutionFinalized")
        .withArgs(true);
      expect(await market.state()).to.equal(2); // RESOLVED
    });

    it("finalizeResolution reverts within challenge window", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await expect(market.finalizeResolution()).to.be.revertedWith("CHALLENGE_OPEN");
    });

    it("dispute by bettor during challenge window", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await expect(market.connect(bettor1).dispute())
        .to.emit(market, "Disputed")
        .withArgs(bettor1.address);
      expect(await market.state()).to.equal(3); // DISPUTED
    });

    it("dispute reverts if window is closed", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await time.increase(CHALLENGE_WINDOW + 1);
      await expect(market.connect(bettor1).dispute()).to.be.revertedWith("WINDOW_CLOSED");
    });

    it("non-bettor cannot dispute (NO_STAKE)", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await expect(market.connect(random).dispute()).to.be.revertedWith("NO_STAKE");
    });

    it("adminResolve resolves disputed market", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await market.connect(bettor1).dispute();
      await expect(market.connect(deployer).adminResolve(false))
        .to.emit(market, "ResolutionFinalized")
        .withArgs(false);
      expect(await market.state()).to.equal(2); // RESOLVED
      expect(await market.outcome()).to.be.false;
    });

    it("non-admin cannot adminResolve", async () => {
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await market.connect(bettor1).dispute();
      await expect(market.connect(bettor1).adminResolve(true)).to.be.revertedWith("NOT_ADMIN");
    });
  });

  // -------------------------------------------------------------------------
  // 8. Claiming
  // -------------------------------------------------------------------------
  describe("Claiming", () => {
    let net1: bigint;
    let net2: bigint;

    beforeEach(async () => {
      // bettor1 bets YES, bettor2 bets NO
      await market.connect(bettor1).placeBet(true, BET);
      await market.connect(bettor2).placeBet(false, BET);
      net1 = netAmount(BET);
      net2 = netAmount(BET);

      // Expire, propose YES wins, finalize
      await time.increase(86401);
      await market.connect(agent).proposeResolution(true);
      await time.increase(CHALLENGE_WINDOW + 1);
      await market.finalizeResolution();
    });

    it("winner (YES bettor) receives full pool payout", async () => {
      const before = await usdc.balanceOf(bettor1.address);
      await market.connect(bettor1).claim();
      const after = await usdc.balanceOf(bettor1.address);
      const totalPool = net1 + net2;
      const payout = (net1 * totalPool) / net1; // = totalPool since only one YES bettor
      expect(after - before).to.equal(payout);
    });

    it("loser (NO bettor) cannot claim (NO_WINNING_BET)", async () => {
      await expect(market.connect(bettor2).claim()).to.be.revertedWith("NO_WINNING_BET");
    });

    it("winner cannot claim twice (ALREADY_CLAIMED)", async () => {
      await market.connect(bettor1).claim();
      await expect(market.connect(bettor1).claim()).to.be.revertedWith("ALREADY_CLAIMED");
    });

    it("non-bettor cannot claim (NO_WINNING_BET)", async () => {
      await expect(market.connect(random).claim()).to.be.revertedWith("NO_WINNING_BET");
    });

    it("emits Claimed event with correct payout", async () => {
      const totalPool = net1 + net2;
      await expect(market.connect(bettor1).claim())
        .to.emit(market, "Claimed")
        .withArgs(bettor1.address, totalPool);
    });

    it("proportional payout when multiple YES bettors", async () => {
      // Deploy a fresh market for this test
      const m2 = await createMarket(factory, agent, "Q-proportional?");
      const m2Addr = await m2.getAddress();
      await mintAndApprove(usdc, bettor1, m2Addr, ethers.parseUnits("10000", 6));
      await mintAndApprove(usdc, bettor2, m2Addr, ethers.parseUnits("10000", 6));

      const BET_A = ethers.parseUnits("200", 6);
      const BET_B = ethers.parseUnits("100", 6);

      await m2.connect(bettor1).placeBet(true, BET_A);
      await m2.connect(bettor2).placeBet(true, BET_B);
      // No NO bets — both win, payout proportional

      await time.increase(86401);
      await m2.connect(agent).proposeResolution(true);
      await time.increase(CHALLENGE_WINDOW + 1);
      await m2.finalizeResolution();

      const netA = netAmount(BET_A);
      const netB = netAmount(BET_B);
      const totalPool = netA + netB;

      const before1 = await usdc.balanceOf(bettor1.address);
      await m2.connect(bettor1).claim();
      const after1 = await usdc.balanceOf(bettor1.address);

      const before2 = await usdc.balanceOf(bettor2.address);
      await m2.connect(bettor2).claim();
      const after2 = await usdc.balanceOf(bettor2.address);

      const expectedA = (netA * totalPool) / totalPool; // = netA (full pool split pro-rata)
      const expectedB = (netB * totalPool) / totalPool; // = netB

      // Each bettor gets exactly their share of the pool (no losing side, so payout = bet)
      expect(after1 - before1).to.equal(netA);
      expect(after2 - before2).to.equal(netB);
      // Sanity: expectedA + expectedB == totalPool
      expect(expectedA + expectedB).to.equal(totalPool);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Messaging
  // -------------------------------------------------------------------------
  describe("Messaging (sendMessage)", () => {
    beforeEach(async () => {
      // Register agent2 so we can send messages between two agents
      await registerAgent(factory, agent2, "Agent Beta", "finance");
    });

    it("registered agent can send a free message", async () => {
      await expect(factory.connect(agent).sendMessage(agent2.address, "Hello!", 0))
        .to.emit(factory, "MessageSent")
        .withArgs(agent.address, agent2.address, 0);
    });

    it("message is stored in messages array", async () => {
      await factory.connect(agent).sendMessage(agent2.address, "Test content", 0);
      expect(await factory.getMessagesCount()).to.equal(1);
      const msgs = await factory.getMessages(0, 1);
      expect(msgs[0].content).to.equal("Test content");
      expect(msgs[0].from).to.equal(agent.address);
      expect(msgs[0].to).to.equal(agent2.address);
    });

    it("paid message transfers USDC from sender to recipient", async () => {
      const price = ethers.parseUnits("10", 6);
      await mintAndApprove(usdc, agent, await factory.getAddress(), price);

      const before = await usdc.balanceOf(agent2.address);
      await factory.connect(agent).sendMessage(agent2.address, "Paid intel", price);
      const after = await usdc.balanceOf(agent2.address);
      expect(after - before).to.equal(price);
    });

    it("non-agent cannot send message (NOT_AGENT)", async () => {
      await expect(
        factory.connect(random).sendMessage(agent.address, "Hack", 0)
      ).to.be.revertedWith("NOT_AGENT");
    });

    it("message to non-agent reverts (RECIPIENT_NOT_AGENT)", async () => {
      await expect(
        factory.connect(agent).sendMessage(random.address, "Hi", 0)
      ).to.be.revertedWith("RECIPIENT_NOT_AGENT");
    });

    it("getMessages returns correct slice", async () => {
      await factory.connect(agent).sendMessage(agent2.address, "Msg1", 0);
      await factory.connect(agent).sendMessage(agent2.address, "Msg2", 0);
      await factory.connect(agent).sendMessage(agent2.address, "Msg3", 0);

      const slice = await factory.getMessages(1, 2);
      expect(slice.length).to.equal(2);
      expect(slice[0].content).to.equal("Msg2");
      expect(slice[1].content).to.equal("Msg3");
    });

    it("getMessages with out-of-bounds from returns empty array", async () => {
      const result = await factory.getMessages(99, 5);
      expect(result.length).to.equal(0);
    });
  });

  // -------------------------------------------------------------------------
  // 10. getOdds
  // -------------------------------------------------------------------------
  describe("getOdds", () => {
    it("returns 50/50 when pools are empty", async () => {
      const [yesProb, noProb, total] = await market.getOdds();
      expect(yesProb).to.equal(50);
      expect(noProb).to.equal(50);
      expect(total).to.equal(0);
    });

    it("reflects correct odds after bets", async () => {
      await market.connect(bettor1).placeBet(true, ethers.parseUnits("300", 6));
      await market.connect(bettor2).placeBet(false, ethers.parseUnits("100", 6));
      const [yesProb, noProb, total] = await market.getOdds();
      const yesNet = netAmount(ethers.parseUnits("300", 6));
      const noNet = netAmount(ethers.parseUnits("100", 6));
      const expectedTotal = yesNet + noNet;
      expect(total).to.equal(expectedTotal);
      expect(yesProb).to.equal((yesNet * 100n) / expectedTotal);
      expect(noProb).to.equal(100n - (yesNet * 100n) / expectedTotal);
    });
  });
});
