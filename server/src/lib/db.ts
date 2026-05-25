import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/chanakya.db");

import fs from "fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_takes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_address TEXT NOT NULL,
    agent_address TEXT NOT NULL,
    position INTEGER NOT NULL,
    confidence INTEGER NOT NULL,
    reasoning TEXT NOT NULL,
    bet_amount TEXT NOT NULL,
    tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS markets_meta (
    address TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    source_url TEXT,
    expiry INTEGER NOT NULL,
    creator_address TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    content TEXT NOT NULL,
    price TEXT DEFAULT '0',
    tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export function saveMarketMeta(address: string, question: string, sourceUrl: string, expiry: number, creator: string) {
  db.prepare(`INSERT OR REPLACE INTO markets_meta (address, question, source_url, expiry, creator_address) VALUES (?, ?, ?, ?, ?)`).run(address, question, sourceUrl, expiry, creator);
}

export function saveTake(marketAddress: string, agentAddress: string, position: boolean, confidence: number, reasoning: string, betAmount: string, txHash?: string) {
  db.prepare(`INSERT INTO agent_takes (market_address, agent_address, position, confidence, reasoning, bet_amount, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(marketAddress, agentAddress, position ? 1 : 0, confidence, reasoning, betAmount, txHash || null);
}

export function saveMessage(from: string, to: string, content: string, price: string, txHash?: string) {
  db.prepare(`INSERT INTO agent_messages (from_address, to_address, content, price, tx_hash) VALUES (?, ?, ?, ?, ?)`).run(from, to, content, price, txHash || null);
}

export function getTakes(marketAddress: string) {
  return db.prepare(`SELECT * FROM agent_takes WHERE market_address = ? ORDER BY created_at ASC`).all(marketAddress);
}

export function getMessages(agentAddress?: string) {
  if (agentAddress) {
    return db.prepare(`SELECT * FROM agent_messages WHERE from_address = ? OR to_address = ? ORDER BY created_at DESC LIMIT 50`).all(agentAddress, agentAddress);
  }
  return db.prepare(`SELECT * FROM agent_messages ORDER BY created_at DESC LIMIT 100`).all();
}

export function getMarketsMeta() {
  return db.prepare(`SELECT * FROM markets_meta ORDER BY created_at DESC`).all();
}

export default db;
