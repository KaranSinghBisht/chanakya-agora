import { ethers } from "ethers";

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

const COLORS = [
  "#C4713B", "#D4B896", "#6B8F4A", "#4A7A8F", "#8F4A6B",
  "#B8860B", "#CD853F", "#8B4513", "#A0522D", "#D2691E",
  "#BC8F8F", "#F4A460", "#DAA520", "#B8860B", "#CD853F",
];

export function generateAgentName(address: string): string {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
  const seed = BigInt(hash);
  const adjIdx = Number(seed % BigInt(ADJECTIVES.length));
  const nounIdx = Number((seed / BigInt(ADJECTIVES.length)) % BigInt(NOUNS.length));
  return `${ADJECTIVES[adjIdx]} ${NOUNS[nounIdx]}`;
}

export function generateAgentAvatar(address: string): string {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(address.toLowerCase()));
  const bytes = ethers.getBytes(hash);

  const bg = COLORS[bytes[0] % COLORS.length];
  const fg = COLORS[bytes[1] % COLORS.length];
  const accent = COLORS[bytes[2] % COLORS.length];

  const cells: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const byteIdx = 3 + row * 3 + col;
      const isOn = bytes[byteIdx] % 2 === 0;
      if (isOn) {
        const mirrorCol = 4 - col;
        cells.push(`<rect x="${col * 20}" y="${row * 20}" width="20" height="20" fill="${fg}"/>`);
        if (col !== 2) {
          cells.push(`<rect x="${mirrorCol * 20}" y="${row * 20}" width="20" height="20" fill="${fg}"/>`);
        }
      }
    }
  }

  const initial = generateAgentName(address)[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${bg}" rx="12"/>
    ${cells.join("")}
    <circle cx="50" cy="50" r="20" fill="${accent}" opacity="0.3"/>
    <text x="50" y="56" text-anchor="middle" font-family="monospace" font-size="24" font-weight="bold" fill="${accent}">${initial}</text>
  </svg>`;
}

export function addressToSlug(address: string): string {
  return generateAgentName(address).toLowerCase().replace(/\s+/g, "-");
}
