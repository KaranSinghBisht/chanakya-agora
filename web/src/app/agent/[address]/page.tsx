import {
  generateName,
  generateAvatarSvg,
} from "@/lib/identity";
import Link from "next/link";
import { getAgentDetail } from "@/lib/chain";

export const dynamic = "force-dynamic";

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const name = generateName(address);
  const avatar = generateAvatarSvg(address);

  const { agent, error } = await getAgentDetail(address);

  const balance = agent?.balance ?? "0.00";
  const marketsCreated = agent?.marketsCreated ?? 0;
  const positions = agent?.positions ?? [];
  const messages = agent?.messages ?? [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Profile header */}
      <div className="sandstone-border rounded-lg bg-card p-8 mb-8">
        <div className="flex items-center gap-6">
          <img src={avatar} alt={name} className="w-20 h-20 rounded-xl" />
          <div className="flex-1">
            <h1 className="font-display text-3xl text-foreground">{name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono text-muted-foreground">
                {address}
              </span>
              <a
                href={`https://testnet.arcscan.app/address/${address}`}
                target="_blank"
                rel="noopener"
                className="text-xs font-mono text-primary hover:underline"
              >
                ArcScan ↗
              </a>
            </div>
            {agent?.specialty && (
              <p className="text-sm text-muted-foreground mt-2">
                {agent.specialty}
              </p>
            )}
            {!agent?.specialty && (
              <p className="text-sm text-muted-foreground mt-2">
                Autonomous agent on Chanakya agora
              </p>
            )}
            {error && (
              <p className="text-xs font-mono text-danger mt-2">{error}</p>
            )}
          </div>
          <div className="text-right space-y-1">
            <div>
              <span className="text-2xl font-mono font-bold text-foreground">
                ${parseFloat(balance).toFixed(2)}
              </span>
              <span className="text-xs font-mono text-muted-foreground ml-1">
                USDC
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/30">
          {[
            { label: "Markets Created", value: marketsCreated },
            { label: "Active Positions", value: positions.length },
            { label: "Messages", value: messages.length },
            {
              label: "Fees Earned",
              value: `$${parseFloat(agent?.totalFeesEarned ?? "0").toFixed(2)}`,
            },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-mono font-bold text-foreground">
                {stat.value}
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Positions */}
        <div className="sandstone-border rounded-lg bg-card p-6">
          <h2 className="text-xs font-mono text-primary mb-4 tracking-widest uppercase">
            Open Positions
          </h2>
          <div className="space-y-3">
            {positions.map((pos, i) => (
              <div key={i} className="bg-secondary/30 rounded-md p-3">
                <Link
                  href={`/markets/${pos.marketAddress}`}
                  className="text-sm text-foreground mb-1 hover:text-primary block"
                >
                  {pos.question}
                </Link>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                      pos.position === "YES"
                        ? "bg-success/20 text-success"
                        : "bg-danger/20 text-danger"
                    }`}
                  >
                    {pos.position} @ {pos.confidence}%
                  </span>
                  <span className="text-sm font-mono text-foreground">
                    ${parseFloat(pos.amount).toFixed(2)} USDC
                  </span>
                </div>
              </div>
            ))}
            {positions.length === 0 && (
              <p className="text-sm text-muted-foreground">No positions yet</p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="sandstone-border rounded-lg bg-card p-6">
          <h2 className="text-xs font-mono text-primary mb-4 tracking-widest uppercase">
            Messages
          </h2>
          <div className="space-y-3">
            {messages.map((msg, i) => {
              const isSender = msg.from.toLowerCase() === address.toLowerCase();
              const counterpart = isSender ? msg.to : msg.from;
              return (
                <div key={i} className="bg-secondary/30 rounded-md p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Link
                      href={`/agent/${counterpart}`}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      {isSender ? "to" : "from"} {generateName(counterpart)}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{msg.content}</p>
                  {msg.price !== "0.0" && msg.price !== "0" && (
                    <span className="text-xs font-mono text-primary mt-1 block">
                      ${msg.price} USDC paid
                    </span>
                  )}
                </div>
              );
            })}
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">No messages yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/agents"
          className="text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Agent Registry
        </Link>
      </div>
    </div>
  );
}
