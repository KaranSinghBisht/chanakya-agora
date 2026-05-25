const ADJECTIVES = [
  "Amber", "Bronze", "Coral", "Crimson", "Crystal", "Dusk", "Ember",
  "Frost", "Golden", "Ivory", "Jade", "Lunar", "Marble", "Neon",
  "Obsidian", "Onyx", "Opal", "Pearl", "Phantom", "Prism",
  "Raven", "Ruby", "Sage", "Scarlet", "Shadow", "Silver", "Solar",
  "Storm", "Tidal", "Velvet", "Violet", "Vivid", "Wild", "Zinc",
];

const NOUNS = [
  "Aegis", "Archer", "Atlas", "Cipher", "Cobra", "Condor", "Dagger",
  "Drake", "Echo", "Falcon", "Forge", "Griffin", "Hawk", "Herald",
  "Hydra", "Jackal", "Kraken", "Lynx", "Manticore", "Nexus",
  "Oracle", "Phalanx", "Phoenix", "Raptor", "Sage", "Sentinel",
  "Serpent", "Sphinx", "Talon", "Tempest", "Titan", "Viper",
  "Warden", "Zenith",
];

const PALETTE = [
  "#C4713B", "#D4B896", "#6B8F4A", "#4A7A8F", "#8F4A6B",
  "#B8860B", "#CD853F", "#8B4513", "#A0522D", "#D2691E",
  "#BC8F8F", "#F4A460", "#DAA520", "#556B2F", "#708090",
];

function simpleHash(str: string): number {
  let hash = 0;
  const s = str.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export function generateName(address: string): string {
  const h = simpleHash(address);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  return `${adj} ${noun}`;
}

export function generateColors(address: string): { bg: string; fg: string; accent: string } {
  const h = simpleHash(address);
  return {
    bg: PALETTE[h % PALETTE.length],
    fg: PALETTE[(h >> 4) % PALETTE.length],
    accent: PALETTE[(h >> 8) % PALETTE.length],
  };
}

export function generateAvatarSvg(address: string): string {
  const { bg, fg, accent } = generateColors(address);
  const h = simpleHash(address);
  const initial = generateName(address)[0];

  const cells: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const bit = (h >> (row * 3 + col)) & 1;
      if (bit) {
        const mirrorCol = 4 - col;
        cells.push(`<rect x="${col * 20}" y="${row * 20}" width="20" height="20" fill="${fg}" opacity="0.6"/>`);
        if (col !== 2) {
          cells.push(`<rect x="${mirrorCol * 20}" y="${row * 20}" width="20" height="20" fill="${fg}" opacity="0.6"/>`);
        }
      }
    }
  }

  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}" rx="12"/>${cells.join("")}<circle cx="50" cy="50" r="22" fill="${accent}" opacity="0.3"/><text x="50" y="58" text-anchor="middle" font-family="monospace" font-size="26" font-weight="bold" fill="${accent}">${initial}</text></svg>`)}`;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
