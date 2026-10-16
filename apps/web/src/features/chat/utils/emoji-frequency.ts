import { ALL_EMOJIS, EmojiItem } from "./emoji-data";

const STORAGE_KEY = "slack_emoji_frequencies";
const DEFAULT_FREQUENT_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "🚀", "👀", "🙌", "👏", "✅", "💯", "🙏"];

export function getEmojiFrequencies(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function trackEmojiUsage(emoji: string): void {
  if (typeof window === "undefined") return;
  try {
    const freqs = getEmojiFrequencies();
    freqs[emoji] = (freqs[emoji] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freqs));
    window.dispatchEvent(
      new CustomEvent("emoji_frequency_updated", {
        detail: { emoji, count: freqs[emoji] },
      })
    );
  } catch (err) {
    console.error("Failed to track emoji usage", err);
  }
}

export function getFrequentlyUsedEmojis(limit = 18): EmojiItem[] {
  const freqs = getEmojiFrequencies();
  const emojiMap = new Map<string, EmojiItem>();
  for (const item of ALL_EMOJIS) {
    if (!emojiMap.has(item.emoji)) {
      emojiMap.set(item.emoji, item);
    }
  }

  const sortedFromStorage = Object.entries(freqs)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emojiMap.get(emoji))
    .filter((item): item is EmojiItem => Boolean(item));

  const results: EmojiItem[] = [...sortedFromStorage];
  const seen = new Set(results.map((r) => r.emoji));

  for (const def of DEFAULT_FREQUENT_EMOJIS) {
    if (results.length >= limit) break;
    if (!seen.has(def)) {
      const item = emojiMap.get(def);
      if (item) {
        results.push(item);
        seen.add(def);
      }
    }
  }

  return results.slice(0, limit);
}

export function searchEmojis(query: string, limit = 60): EmojiItem[] {
  const cleanQuery = query.trim().toLowerCase().replace(/^:|:$/g, "");
  if (!cleanQuery) return [];

  const freqs = getEmojiFrequencies();

  interface ScoredEmoji {
    item: EmojiItem;
    score: number;
    frequency: number;
  }

  const scored: ScoredEmoji[] = [];

  for (const item of ALL_EMOJIS) {
    const name = item.name.toLowerCase();
    const frequency = freqs[item.emoji] || 0;
    let matchScore = 0;

    if (item.emoji === cleanQuery) {
      matchScore = 1000;
    } else if (name === cleanQuery) {
      matchScore = 500;
    } else if (name.startsWith(cleanQuery)) {
      matchScore = 300 - (name.length - cleanQuery.length);
    } else if (name.includes(cleanQuery)) {
      matchScore = 200 - name.indexOf(cleanQuery);
    } else {
      const matchedKeyword = item.keywords.find((k) =>
        k.toLowerCase().includes(cleanQuery)
      );
      if (matchedKeyword) {
        if (matchedKeyword.toLowerCase() === cleanQuery) {
          matchScore = 150;
        } else if (matchedKeyword.toLowerCase().startsWith(cleanQuery)) {
          matchScore = 120;
        } else {
          matchScore = 90;
        }
      }
    }

    if (matchScore > 0) {
      const finalScore = matchScore + Math.min(frequency * 15, 300);
      scored.push({ item, score: finalScore, frequency });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

