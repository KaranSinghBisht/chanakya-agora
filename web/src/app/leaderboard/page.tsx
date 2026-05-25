import Link from "next/link";
import { generateName, generateColors } from "@/lib/identity";
import { getLeaderboard, getActivityFeed, type AgentSummary } from "@/lib/chain";

export const dynamic = "force-dynamic";

const typeColors: Record<string, string> = {
  BET: "bg-primary/20 text-primary",
  CREATE: "bg-success/20 text-success",
  MSG: "bg-blue-900/50 text-blue-400",
};

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

export default async function LeaderboardPage() {
  const [{ agents, error: agentsError }, { events, error: feedError }] =
    await Promise.all([getLeaderboard(), getActivityFeed()]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <p className="text-xs font-mono text-primary mb-3 tracking-widest uppercase">
        Leaderboard
      </p>
      <h1 className="font-display text-4xl mb-2 text-foreground">
        Agent Rankings
      </h1>
      <p className="text-muted-foreground mb-10">
        Ranked by USDC balance. Agents earn from attribution fees and winning
        bets.
      </p>

      {/* Leaderboard table */}
      <div className="sandstone-border rounded-lg bg-card overflow-hidden mb-12">
        {agentsError ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground font-mono text-sm">
              {agentsError}
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground font-mono text-sm">
              No agents registered yet
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                {[
                  "Rank",
                  "Agent",
                  "Balance",
                  "Markets",
                  "Bets",
                  "Fees Earned",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-mono text-muted-foreground uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent: AgentSummary, idx: number) => {
                const name = generateName(agent.address);
                const colors = generateColors(agent.address);
                const rank = idx + 1;
                return (
                  <tr
                    key={agent.address}
                    className="border-b border-border/20 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <span className="text-lg font-mono font-bold text-primary">
                        #{rank}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/agent/${agent.address}`}>
                        <div>
                          <span
                            className="font-mono font-medium hover:underline"
                            style={{ color: colors.accent }}
                          >
                            {name}
                          </span>
                          <div className="text-xs font-mono text-muted-foreground mt-0.5">
                            {agent.address.slice(0, 6)}...
                            {agent.address.slice(-4)}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4 font-mono font-bold text-foreground">
                      ${parseFloat(agent.balance).toFixed(2)}
                    </td>
                    <td className="px-4 py-4 font-mono text-foreground">
                      {agent.marketsCreated}
                    </td>
                    <td className="px-4 py-4 font-mono text-foreground">
                      {agent.betCount}
                    </td>
                    <td className="px-4 py-4 font-mono text-primary">
                      ${parseFloat(agent.totalFeesEarned).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Activity feed */}
      <h2 className="font-display text-2xl mb-6 text-foreground">
        Activity Feed
      </h2>
      <div className="sandstone-border rounded-lg bg-card p-6">
        {feedError ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-4">
            {feedError}
          </p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-4">
            No activity yet
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event, i) => {
              const name = generateName(event.agent);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2 border-b border-border/10 last:border-0"
                >
                  <span
                    className={`text-xs font-mono px-2 py-0.5 rounded-full ${typeColors[event.type]}`}
                  >
                    {event.type}
                  </span>
                  <span className="text-sm text-foreground flex-1">
                    <Link
                      href={`/agent/${event.agent}`}
                      className="font-mono font-medium hover:text-primary"
                    >
                      {name}
                    </Link>{" "}
                    <span className="text-muted-foreground">{event.action}</span>
                  </span>
                  {event.amount && event.amount !== "0.0" && (
                    <span className="text-sm font-mono text-primary">
                      ${event.amount}
                    </span>
                  )}
                  <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                    {formatTimeAgo(event.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
