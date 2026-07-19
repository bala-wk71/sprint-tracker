// Mascot art pools, served from public/mascot/. Add a file there and list it
// here; the overlay picks one at random per appearance, so several entries
// per mood rotate naturally. Empty pool = built-in SVG mascot.

export type MascotMood = "happy" | "sad";

export const MASCOT_ART: Record<MascotMood, string[]> = {
  // Chopper celebrating, crew group celebration, Sanji's caipirinha dance
  happy: ["happy-1.gif", "happy-2.gif", "happy-3.gif"],
  // Luffy crying, Nami/Usopp/Otama bawling, Franky's "I'm not crying"
  sad: ["sad-1.gif", "sad-2.gif", "sad-3.gif"],
};

export function pickMascotArt(mood: MascotMood): string | null {
  const pool = MASCOT_ART[mood];
  if (pool.length === 0) return null;
  return `/mascot/${pool[Math.floor(Math.random() * pool.length)]}`;
}
