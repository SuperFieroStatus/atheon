import { customAlphabet } from 'nanoid';

export const id = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16);
export const now = () => new Date().toISOString();

// Avatars show white initials, so these are all dark enough to read on (>4:1).
export const AVATAR_COLORS = [
  '#5B4FC4', // indigo
  '#1E7A5A', // emerald
  '#2065B0', // blue
  '#C0562F', // burnt orange
  '#B83C6E', // rose
  '#12798A', // teal
  '#9A6A1E', // bronze
  '#B23A3A', // red
  '#4A5568', // slate
  '#7A4FB0', // violet
];
export function randomColor(seed?: string): string {
  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Category header dots — distinct, pleasant colours (no white text on them,
// so they don't need the tag/avatar contrast constraint).
export const CATEGORY_COLORS = [
  '#5BA4CF', // blue
  '#F2A65A', // orange
  '#9B7EDE', // purple
  '#61BD4F', // green
  '#EB5A46', // red
  '#00C2A8', // teal
  '#E9C544', // yellow
  '#EF7FB4', // pink
  '#7F8C9A', // slate
  '#B3BAC5', // grey
];

// Tag pills render white text, so every colour here is intentionally dark
// enough for that text to stay easily readable (contrast > ~4:1).
export const TAG_COLORS = [
  '#C0392B', // red
  '#B9600E', // orange
  '#8E7B0A', // gold (dark yellow)
  '#3C7A34', // green
  '#0E7C8C', // teal
  '#1F5FA8', // blue
  '#7D3C98', // purple
  '#A83E7C', // magenta
  '#34495E', // slate
  '#5D6D7E', // grey
];

/* ---- keep white tag text readable on any colour ---- */
function srgbToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}
function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
  );
}

// Darken a colour until white text sits comfortably on it (luminance <= ~0.2,
// i.e. contrast ratio > ~4:1 against white). Returns colours already dark
// enough unchanged. Falls back to the input on an unparseable value.
export function darkenForWhiteText(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  let { r, g, b } = rgb;
  let guard = 0;
  while (luminance(r, g, b) > 0.2 && guard++ < 60) {
    r *= 0.92;
    g *= 0.92;
    b *= 0.92;
  }
  return toHex(r, g, b);
}
