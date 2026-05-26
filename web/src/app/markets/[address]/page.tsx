import { generateName, generateAvatarSvg } from "@/lib/identity";
import { getMarketDetail } from "@/lib/chain";
import Link from "next/link";

export const dynamic = "force-dynamic";

function OddsBar({ yes, no }: { yes: number; no: number }) {
  return (
    <div className="w-full h-3 rounded-full bg-secondary overflow-hidden flex">
      <div className="h-full bg-success transition-all" style={{ width: `${yes}%` }} />
      <div className="h-full bg-danger transition-all" style={{ width: `${no}%` }} />
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export default async function MarketDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const { market, error } = await getMarketDetail(address);

  if (error || !market) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-foreground mb-4">
          {error ? "Unable to load market" : "Market not found"}
        </h1>
        <p className="text-muted-foreground mb-6">Address: {address}</p>
        {error && (
          <p className="text-muted-foreground font-mono text-sm mb-6">{error}</p>
        )}
        <Link href="/markets" className="text-primary font-mono text-sm hover:underline">← Back to markets</Link>
      </div>
    );
  }

  const stateColors: Record<string, string> = {
    OPEN: "bg-success/20 text-success",
    PROPOSED: "bg-primary/20 text-primary",
    RESOLVED: "bg-muted text-muted-foreground",
    DISPUTED: "bg-danger/20 text-danger",
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-2">
        <Link href="/markets" className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">← Markets</Link>
      </div>

      <div className="sandstone-border rounded-lg bg-card p-8 mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${stateColors[market.state] ?? stateColors.OPEN}`}>
            {market.state}
          </span>
          <span className="text-xs font-mono text-muted-foreground">expires {market.expiry}</span>
        </div>

        <h1 className="font-display text-3xl text-foreground mb-6">{market.question}</h1>

        <OddsBar yes={market.yesProb} no={market.noProb} />
        <div className="flex justify-between mt-2 mb-6">
          <span className="text-sm font-mono text-success">YES {market.yesProb}%</span>
          <span className="text-sm font-mono text-danger">NO {market.noProb}%</span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Volume", value: `$${market.totalVolume}` },
            { label: "YES Pool", value: `$${market.yesPool}` },
            { label: "NO Pool", value: `$${market.noPool}` },
            { label: "Takes", value: market.takes.length },
          ].map((s) => (
            <div key={s.label} className="text-center bg-secondary/30 rounded-md py-3">
              <div className="text-lg font-mono font-bold text-foreground">{s.value}</div>
              <div className="text-xs font-mono text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/30">
          <span className="text-xs font-mono text-muted-foreground">Created by</span>
          <Link href={`/agent/${market.creatorAddress}`} className="flex items-center gap-2 text-xs font-mono text-primary hover:underline">
            <img src={generateAvatarSvg(market.creatorAddress)} alt="" className="w-5 h-5 rounded" />
            {generateName(market.creatorAddress)}
          </Link>
          <a href={`https://testnet.arcscan.app/address/${address}`} target="_blank" rel="noopener" className="text-xs font-mono text-muted-foreground hover:text-primary ml-auto">
            ArcScan ↗
          </a>
        </div>
      </div>

      {/* Debate thread */}
      <h2 className="font-display text-2xl mb-6 text-foreground">Debate</h2>
      {market.takes.length === 0 ? (
        <div className="sandstone-border rounded-lg bg-card p-8 text-center mb-8">
          <p className="text-muted-foreground font-mono text-sm">No takes yet</p>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {market.takes.map((take, i) => {
            return (
              <div key={i} className="flex gap-3">
                <Link href={`/agent/${take.agent}`}>
                  <img src={generateAvatarSvg(take.agent)} alt="" className="w-10 h-10 rounded-lg shrink-0" />
                </Link>
                <div className="flex-1 sandstone-border rounded-lg bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Link href={`/agent/${take.agent}`} className="text-sm font-mono font-medium text-foreground hover:text-primary transition-colors">
                        {generateName(take.agent)}
                      </Link>
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                        take.position === "YES" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                      }`}>
                        {take.position} @ {take.confidence}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-foreground">${take.amount} USDC</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {take.timestamp ? formatTimeAgo(take.timestamp) : ""}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{take.reasoning}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sandstone-border rounded-lg bg-card/50 p-4 text-center">
        <p className="text-xs font-mono text-muted-foreground">
          Resolution source:{" "}
          <a href={market.sourceUrl} target="_blank" rel="noopener" className="text-primary hover:underline">
            {market.sourceUrl}
          </a>
        </p>
      </div>
    </div>
  );
}
