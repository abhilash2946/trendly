export type TierType = "Best Seller" | "Low Price" | "Premium" | "Best Discount";

export interface ShoppingResult {
  title: string;
  price: string;
  priceNumeric: number;
  originalPrice?: number;   // MRP
  discount?: string;         // e.g. "40% off"
  discountPct?: number;
  discountLabel?: string;    // e.g. "Mega Deal"
  rating?: number;
  ratingCount?: number;      // Proxy for sales volume
  source: "Amazon" | "Flipkart" | "Myntra" | "Shopsy";
  url: string;
  tier: TierType;
  imageUrl?: string;
  rank: number;              // 1 = best in tier
}

interface FetchConfig {
  source: ShoppingResult["source"];
  urlFn: (q: string) => string;
}

const FETCH_CONFIGS: FetchConfig[] = [
  {
    source: "Amazon",
    urlFn: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}&s=review-rank`,
  },
  {
    source: "Flipkart",
    urlFn: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    source: "Myntra",
    urlFn: (q) => `https://www.myntra.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    source: "Shopsy",
    urlFn: (q) => `https://www.shopsy.in/search?q=${encodeURIComponent(q)}`,
  },
];

const AMAZON_IMG_RE = /https?:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9%_.+\-]{10,}\.(jpg|jpeg|webp|png)/gi;
const FLIPKART_IMG_RE = /https?:\/\/rukminim\d*\.flixcart\.com\/image\/[A-Za-z0-9\/_. -]{6,}\.(jpg|jpeg|webp)/gi;
const MYNTRA_IMG_RE = /https?:\/\/assets\.myntassets\.com\/[A-Za-z0-9\/,._=-]+/gi;
const GENERIC_IMG_RE = /https?:\/\/[^\s"')>]{10,}\.(jpg|jpeg|png|webp)(\?[^\s"')>]{0,200})?/gi;
const IMG_BLOCKLIST_RE = /(sprite|logo|icon|banner|pixel|favicon|nav-|gno\/sprites|prime.?join|join.?prime|header|footer|\/cart|\/search|arrow|star-rating|button|badge|seal|watermark|noimage|placeholder|default|blank|grey|gray|spinner|loading|gift|flag)/i;

function extractProductImages(text: string, source: ShoppingResult["source"]): string[] {
  let matches: string[] = [];
  const re = source === "Amazon" ? AMAZON_IMG_RE :
             (source === "Flipkart" || source === "Shopsy") ? FLIPKART_IMG_RE :
             source === "Myntra" ? MYNTRA_IMG_RE : GENERIC_IMG_RE;

  matches = (text.match(new RegExp(re.source, "gi")) || []).filter((u) => !IMG_BLOCKLIST_RE.test(u));

  if (matches.length < 4) {
    const generic = (text.match(new RegExp(GENERIC_IMG_RE.source, "gi")) || []).filter((u) => !IMG_BLOCKLIST_RE.test(u));
    const seen = new Set(matches);
    for (const u of generic) { if (!seen.has(u)) { matches.push(u); seen.add(u); } }
  }
  return Array.from(new Set(matches));
}

const PRODUCT_TEXT_RE = /\u20b9|Rs\.|shirt|dress|top|shoe|kurta|jeans|jacket|blazer|trouser|saree|ethnic|pant|suit|set|kurti|salwar|lehenga|sherwani|polo|tshirt|t-shirt|cotton|linen|silk|formal|casual|hoodie|sweater|denim/i;

interface RawProduct {
  title: string;
  priceNumeric: number;
  priceRaw: string;
  originalPriceNumeric: number;
  discountPct: number;
  ratingCount: number;
  rating: number;
  hasBestSellerBadge: boolean;
  source: ShoppingResult["source"];
  url: string;
  imageUrl: string | undefined;
}

function parseProducts(text: string, source: ShoppingResult["source"], url: string): RawProduct[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const allImgs = extractProductImages(text, source);
  const priceAnchors: Array<{ lineIdx: number; numeric: number; raw: string }> = [];

  lines.forEach((line, i) => {
    const m = line.match(/\u20b9\s*([\d,]+)/);
    if (m) {
      const numeric = Number(m[1].replace(/,/g, ""));
      if (numeric >= 99 && numeric <= 150000 && !/m\.r\.p|mrp|original|was\s/i.test(line)) {
        priceAnchors.push({ lineIdx: i, numeric, raw: `\u20b9${m[1]}` });
      }
    }
  });

  const deduped: typeof priceAnchors = [];
  let lastIdx = -10;
  for (const a of priceAnchors) { if (a.lineIdx - lastIdx > 4) { deduped.push(a); lastIdx = a.lineIdx; } }

  return deduped.slice(0, 10).map((anchor, idx) => {
    const window = lines.slice(Math.max(0, anchor.lineIdx - 7), Math.min(lines.length, anchor.lineIdx + 8));
    const winText = window.join(" ");

    let imgRe = source === "Amazon" ? AMAZON_IMG_RE : (source === "Flipkart" || source === "Shopsy") ? FLIPKART_IMG_RE : MYNTRA_IMG_RE;
    const imageUrl = (winText.match(new RegExp(imgRe.source, "gi")) || [])[0] ?? allImgs[idx] ?? allImgs[0];

    const titleCandidates = window.filter((l) => !l.match(/^\u20b9/) && !l.match(/^\d+(\.\d+)?$/) && !l.match(/^https?:\/\//) && l.length > 10 && PRODUCT_TEXT_RE.test(l)).sort((a, b) => b.length - a.length);
    const title = (titleCandidates[0] || `${source} product`).replace(/Title\s*:\s*/i, "").replace(/[#>*`\-]/g, "").trim().slice(0, 90);

    const mrpMatch = winText.match(/(?:MRP|List\s*price|Original\s*price|was)[:\s]*\u20b9\s*([\d,]+)/i);
    const mrp = mrpMatch ? Number(mrpMatch[1].replace(/,/g, "")) : 0;

    const discountMatch = winText.match(/(\d+)\s*%\s*off/i);
    const dPct = discountMatch ? Number(discountMatch[1]) : (mrp > anchor.numeric ? Math.round(((mrp - anchor.numeric) / mrp) * 100) : 0);

    const rMatch = winText.match(/(\d+\.?\d*)\s*(?:out\s*of\s*5|stars?|\u2605)/i);
    const rating = rMatch ? Number(rMatch[1]) : 0;

    const rcMatch = winText.match(/([\d,]+)\s*(?:ratings?|reviews?|customers)/i);
    const ratingCount = rcMatch ? Number(rcMatch[1].replace(/,/g, "")) : 0;

    return { title, priceNumeric: anchor.numeric, priceRaw: anchor.raw, originalPriceNumeric: mrp, discountPct: dPct, ratingCount, rating, hasBestSellerBadge: /best.?seller/i.test(winText), source, url, imageUrl };
  });
}

function classifyProducts(raw: RawProduct[]): ShoppingResult[] {
  if (raw.length === 0) return [];

  const prices = raw.map(p => p.priceNumeric).filter(p => p > 0).sort((a, b) => a - b);
  const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const p20 = prices[Math.floor(prices.length * 0.2)] ?? prices[0] ?? 0;
  const p80 = prices[Math.floor(prices.length * 0.8)] ?? prices[prices.length - 1] ?? 0;

  const counts = raw.map(p => p.ratingCount).filter(c => c > 0).sort((a, b) => a - b);
  const top10Threshold = counts[Math.floor(counts.length * 0.90)] ?? counts[counts.length - 1] ?? 0;

  const assignments = raw.map((p) => {
    let tier: TierType;
    // Strict priority: High Discount > Best Seller > Premium > Low Price
    if (p.discountPct >= 40) tier = "Best Discount";
    else if (p.hasBestSellerBadge || (p.ratingCount >= top10Threshold && p.ratingCount > 0)) tier = "Best Seller";
    else if (p.priceNumeric >= p80 || (avgPrice > 0 && p.priceNumeric > avgPrice * 1.5)) tier = "Premium";
    else if (p.priceNumeric > 0 && (p.priceNumeric <= p20)) tier = "Low Price";
    else tier = "Best Seller"; // Mid-range fallback

    let discountLabel = undefined;
    if (p.discountPct >= 60) discountLabel = "Mega Deal";
    else if (p.discountPct >= 40) discountLabel = "High Discount";
    else if (p.discountPct >= 20) discountLabel = "Good Deal";
    else if (p.discountPct >= 10) discountLabel = "Small Discount";

    return { p, tier, discountLabel };
  });

  const ALL_TIERS: TierType[] = ["Best Seller", "Low Price", "Premium", "Best Discount"];
  const results: ShoppingResult[] = [];

  for (const tier of ALL_TIERS) {
    let items = assignments.filter(a => a.tier === tier);

    // Ensure all tiers have at least 1 result via promotion
    if (items.length === 0) {
      if (tier === "Low Price") items = [...assignments].sort((a, b) => a.p.priceNumeric - b.p.priceNumeric).slice(0, 1).map(x => ({ ...x, tier }));
      if (tier === "Premium") items = [...assignments].sort((a, b) => b.p.priceNumeric - a.p.priceNumeric).slice(0, 1).map(x => ({ ...x, tier }));
      if (tier === "Best Discount") items = [...assignments].sort((a, b) => b.p.discountPct - a.p.discountPct).slice(0, 1).map(x => ({ ...x, tier }));
      if (tier === "Best Seller") items = [...assignments].sort((a, b) => ((b.p.ratingCount * b.p.rating) || 0) - ((a.p.ratingCount * a.p.rating) || 0)).slice(0, 1).map(x => ({ ...x, tier }));
    }

    // Ranking logic per tier
    if (tier === "Best Seller") items = items.sort((a, b) => ((b.p.ratingCount * b.p.rating) || 0) - ((a.p.ratingCount * a.p.rating) || 0));
    else if (tier === "Low Price") items = items.sort((a, b) => a.p.priceNumeric - b.p.priceNumeric);
    else if (tier === "Premium") items = items.sort((a, b) => b.p.priceNumeric - a.p.priceNumeric);
    else if (tier === "Best Discount") items = items.sort((a, b) => b.p.discountPct - a.p.discountPct);

    items.slice(0, 3).forEach((a, rank) => {
      results.push({
        title: a.p.title,
        price: a.p.priceRaw,
        priceNumeric: a.p.priceNumeric,
        originalPrice: a.p.originalPriceNumeric > a.p.priceNumeric ? a.p.originalPriceNumeric : undefined,
        discount: a.p.discountPct > 0 ? `${a.p.discountPct}% off` : undefined,
        discountPct: a.p.discountPct,
        discountLabel: a.discountLabel,
        rating: a.p.rating > 0 ? a.p.rating : undefined,
        ratingCount: a.p.ratingCount > 0 ? a.p.ratingCount : undefined,
        source: a.p.source,
        url: a.p.url,
        tier,
        imageUrl: a.p.imageUrl,
        rank: rank + 1
      });
    });
  }
  return results;
}

function buildEmptyFallback(q: string): ShoppingResult[] {
  return (["Best Seller", "Low Price", "Premium", "Best Discount"] as TierType[]).map((tier, i) => ({
    title: `${q} — ${tier}`, price: "See listing", priceNumeric: 0, source: i === 0 ? "Amazon" : i === 1 ? "Flipkart" : i === 2 ? "Myntra" : "Shopsy", url: "https://www.google.com/search?q=" + encodeURIComponent(q), tier, rank: 1
  }));
}

export async function searchShoppingPlatforms(query: string): Promise<ShoppingResult[]> {
  const calls = FETCH_CONFIGS.map(async (cfg) => {
    try {
      const res = await fetch(`https://r.jina.ai/${cfg.urlFn(query)}`, { signal: AbortSignal.timeout(15_000) });
      return res.ok ? parseProducts(await res.text(), cfg.source, cfg.urlFn(query)) : [];
    } catch { return []; }
  });
  const allRaw = (await Promise.all(calls)).flat().filter(p => p.title.length > 4);
  const seen = new Set<string>();
  const deduped = allRaw.filter(p => { const k = p.title.toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  return deduped.length === 0 ? buildEmptyFallback(query) : classifyProducts(deduped);
}
