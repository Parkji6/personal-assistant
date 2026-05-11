import Parser from 'rss-parser';
import { fetchWithTimeout } from '@/lib/http';

export interface Headline {
  title: string;
  link: string;
  source: string;
  category: string;
  icon: string;
  publishedAt?: string;
}

export interface FeedSource {
  category: string; // "Global", "France", "Poland", "AI", "OM"
  icon: string;
  name: string; // display name
  url: string;
}

// One headline per category. Order is preserved in the brief.
export const DEFAULT_FEEDS: FeedSource[] = [
  {
    category: 'Global',
    icon: '🌍',
    name: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  },
  {
    category: 'France',
    icon: '🇫🇷',
    name: 'Le Monde',
    url: 'https://www.lemonde.fr/rss/une.xml',
  },
  {
    category: 'Poland',
    icon: '🇵🇱',
    name: 'Notes from Poland',
    url: 'https://notesfrompoland.com/feed/',
  },
  {
    category: 'AI',
    icon: '🤖',
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
  },
  {
    category: 'OM',
    icon: '⚽',
    name: 'Google News',
    url: 'https://news.google.com/rss/search?q=Olympique+de+Marseille&hl=fr&gl=FR&ceid=FR:fr',
  },
  {
    category: 'Spurs',
    icon: '🏀',
    name: 'Google News Spurs',
    url: 'https://news.google.com/rss/search?q=San+Antonio+Spurs&hl=en&gl=US&ceid=US:en',
  },
  {
    category: 'Warsaw',
    icon: '📍',
    name: 'Google News Warsaw',
    url: 'https://news.google.com/rss/search?q=Wydarzenia+Warszawa&hl=pl&gl=PL&ceid=PL:pl',
  },
];

const parser = new Parser();

export async function fetchHeadlines(
  feeds: FeedSource[] = DEFAULT_FEEDS,
  perFeed = 1,
): Promise<Headline[]> {
  const results = await Promise.allSettled(feeds.map((f) => fetchOne(f, perFeed)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

async function fetchOne(feed: FeedSource, perFeed: number): Promise<Headline[]> {
  const res = await fetchWithTimeout(feed.url);
  if (!res.ok) throw new Error(`${feed.name} ${res.status}`);
  const xml = await res.text();
  const parsed = await parser.parseString(xml);
  return (parsed.items ?? []).slice(0, perFeed).map((item) => ({
    title: (item.title ?? '(no title)').trim(),
    link: item.link ?? '#',
    source: feed.name,
    category: feed.category,
    icon: feed.icon,
    publishedAt: item.isoDate ?? item.pubDate,
  }));
}
