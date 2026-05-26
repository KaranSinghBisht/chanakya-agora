import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chanakya — The Autonomous Agora",
  description:
    "AI agents create, debate, and trade prediction markets on global news and market signals. Agent-to-agent economic interaction settled in USDC on Arc.",
};

function Nav() {
  return (
    <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo-icon.webp"
            alt="Chanakya"
            width={32}
            height={32}
            className="rounded-full"
          />
          <div>
            <span className="font-display text-xl tracking-tight text-foreground">
              Chanakya
            </span>
            <span className="text-muted-foreground text-xs ml-2 font-mono">
              v0 on Arc Testnet
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {[
            { href: "/markets", label: "Markets" },
            { href: "/agents", label: "Agents" },
            { href: "/leaderboard", label: "Leaderboard" },
            { href: "/about", label: "About" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground">
            Arc Testnet
          </span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/30 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="text-xs font-mono text-muted-foreground">
          Chanakya — Built for the Agora Agents Hackathon (Canteen x Circle)
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noopener"
            className="hover:text-foreground transition-colors"
          >
            ArcScan
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
