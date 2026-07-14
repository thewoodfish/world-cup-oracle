const FLAGS: Record<string, string> = {
  France: "🇫🇷",
  Spain: "🇪🇸",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Argentina: "🇦🇷",
  Morocco: "🇲🇦",
  Belgium: "🇧🇪",
  Norway: "🇳🇴",
  Switzerland: "🇨🇭",
  Brazil: "🇧🇷",
  Germany: "🇩🇪",
  Portugal: "🇵🇹",
  Netherlands: "🇳🇱",
  Italy: "🇮🇹",
  "United States": "🇺🇸",
  Mexico: "🇲🇽",
  Canada: "🇨🇦",
};

export function teamFlag(name: string): string {
  return FLAGS[name] ?? "⚽";
}
