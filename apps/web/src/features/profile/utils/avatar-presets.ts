export interface AvatarPreset {
  id: string;
  name: string;
  category: "Professional" | "Creative" | "Minimal & Geometric" | "Animals & Fun";
  url: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // 1. Professional & Clean
  {
    id: "prof-1",
    name: "Alex",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Alex&backgroundColor=b6e3f4",
  },
  {
    id: "prof-2",
    name: "Jordan",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Jordan&backgroundColor=c0aede",
  },
  {
    id: "prof-3",
    name: "Taylor",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Taylor&backgroundColor=d1d4f9",
  },
  {
    id: "prof-4",
    name: "Morgan",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Morgan&backgroundColor=ffd5dc",
  },
  {
    id: "prof-5",
    name: "Casey",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Casey&backgroundColor=ffdfbf",
  },
  {
    id: "prof-6",
    name: "Riley",
    category: "Professional",
    url: "https://api.dicebear.com/7.x/notionists/svg?seed=Riley&backgroundColor=b6e3f4",
  },

  // 2. Creative & Colorful
  {
    id: "creat-1",
    name: "Avery",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Avery&backgroundColor=b6e3f4",
  },
  {
    id: "creat-2",
    name: "Quinn",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Quinn&backgroundColor=ffd5dc",
  },
  {
    id: "creat-3",
    name: "Sam",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Sam&backgroundColor=c0aede",
  },
  {
    id: "creat-4",
    name: "Robin",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Robin&backgroundColor=d1d4f9",
  },
  {
    id: "creat-5",
    name: "Harper",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Harper&backgroundColor=ffdfbf",
  },
  {
    id: "creat-6",
    name: "Jamie",
    category: "Creative",
    url: "https://api.dicebear.com/7.x/lorelei/svg?seed=Jamie&backgroundColor=c0aede",
  },

  // 3. Minimal & Geometric
  {
    id: "geo-1",
    name: "Prism Cyan",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismCyan&backgroundColor=0284c7",
  },
  {
    id: "geo-2",
    name: "Prism Purple",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismPurple&backgroundColor=7c3aed",
  },
  {
    id: "geo-3",
    name: "Prism Emerald",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismEmerald&backgroundColor=059669",
  },
  {
    id: "geo-4",
    name: "Prism Amber",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismAmber&backgroundColor=d97706",
  },
  {
    id: "geo-5",
    name: "Prism Rose",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismRose&backgroundColor=e11d48",
  },
  {
    id: "geo-6",
    name: "Prism Slate",
    category: "Minimal & Geometric",
    url: "https://api.dicebear.com/7.x/shapes/svg?seed=PrismSlate&backgroundColor=475569",
  },

  // 4. Animals & Fun
  {
    id: "fun-1",
    name: "Felix Fox",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=FelixFox&backgroundColor=ffd5dc",
  },
  {
    id: "fun-2",
    name: "Sparky Bot",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=SparkyBot&backgroundColor=b6e3f4",
  },
  {
    id: "fun-3",
    name: "Pixel Panda",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=PixelPanda&backgroundColor=c0aede",
  },
  {
    id: "fun-4",
    name: "Cosmo Cat",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=CosmoCat&backgroundColor=d1d4f9",
  },
  {
    id: "fun-5",
    name: "Ziggy Owl",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=ZiggyOwl&backgroundColor=ffdfbf",
  },
  {
    id: "fun-6",
    name: "Blaze Dragon",
    category: "Animals & Fun",
    url: "https://api.dicebear.com/7.x/bottts/svg?seed=BlazeDragon&backgroundColor=ffd5dc",
  },
];

