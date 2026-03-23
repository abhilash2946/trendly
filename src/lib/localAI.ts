import type { WardrobeCategory, WardrobeSubCategory } from '../types';
import { fileToDataUrl } from './aiGateway';

const LOCAL_AI_BASE = 'http://localhost:5000';
const SD_BASE = 'http://127.0.0.1:7860';

export interface TrendlyAIServerReply {
  message: string;
  suggestion: string;
  items: string[];
  summary: string;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${detail || 'Request failed'}`.trim());
  }

  return (await response.json()) as T;
}

export async function askTrendlyAI(prompt: string) {
  return postJson<TrendlyAIServerReply>(`${LOCAL_AI_BASE}/ai-stylist`, { prompt });
}

export async function askTrendlyAIWithHistory(prompt: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return postJson<TrendlyAIServerReply>(`${LOCAL_AI_BASE}/ai-stylist`, { prompt, history });
}

export async function generateOutfitImage(prompt: string) {
  const response = await postJson<{ images?: string[] }>(`${SD_BASE}/sdapi/v1/txt2img`, {
    prompt,
    steps: 20,
  });

  const image = response.images?.[0];
  if (!image) {
    throw new Error('Stable Diffusion returned no image data.');
  }

  return `data:image/png;base64,${image}`;
}

export type ClassifyResult = {
  category: WardrobeCategory;
  sub_category: WardrobeSubCategory | null;
  color: string;
  tags: string[];
};

// Returns 1 result normally, or 2 results if a multi-garment image (top+bottom) is detected
export async function classifyWardrobeImage(file: File): Promise<ClassifyResult[]> {
  // ── Try YOLO multi-item detection via local Express server ─────────────────
  try {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch(`${LOCAL_AI_BASE}/detect-wardrobe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ image: dataUrl, filename: file.name }),
    });
    if (response.ok) {
      const data = await response.json();
      const valid: WardrobeCategory[] = ['Tops','Bottoms','Dresses','Outerwear','Shoes','Accessories'];
      // Handle multi-item response { items: [...], count: N }
      const items = Array.isArray(data.items) ? data.items : (data.category ? [data] : []);
      const results: ClassifyResult[] = items
        .filter((item: any) => item.category && valid.includes(item.category))
        .map((item: any) => ({
          category: item.category as WardrobeCategory,
          sub_category: (item.sub_category as WardrobeSubCategory) || null,
          color: String(item.color || 'gray').toLowerCase(),
          tags: Array.isArray(item.tags) && item.tags.length
            ? item.tags
            : [item.category.toUpperCase(), String(item.color || 'gray').toUpperCase()],
        }));
      if (results.length > 0) return results;
    }
  } catch {
    // YOLO server not running — fall through to canvas analysis
  }

  // ── Fallback: canvas pixel analysis (no server needed) ────────────────────
  try {
    return await analyzeImageLocally(file);
  } catch {
    const category = inferCategoryFromFileName(file.name) || 'Tops';
    const color = inferColorFromFileName(file.name) || 'gray';
    return [{ category, sub_category: null, color, tags: [category.toUpperCase(), color.toUpperCase()] }];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL IMAGE ANALYSIS — no API, no internet, 100% browser canvas
//
// Handles both isolated product shots AND full-body model photos.
//
// Pipeline:
//  1. Aggressive background removal (multi-tolerance BFS + gradient bg sweep)
//  2. Connected-component labeling → find the LARGEST foreground blob
//  3. Divide the blob into vertical zones to determine category
//  4. Sample color from the DOMINANT zone only (not the whole image)
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeImageLocally(
  file: File
): Promise<ClassifyResult[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const W = 150, H = 150;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0, W, H);
        const { data: px } = ctx.getImageData(0, 0, W, H);

        // ── 1. BACKGROUND COLOR — sample full edge ring ─────────────────────
        const edgePixels: [number,number,number][] = [];
        for (let x = 0; x < W; x++) {
          for (const y of [0, 1, H-2, H-1]) {
            const i = (y*W+x)*4;
            edgePixels.push([px[i], px[i+1], px[i+2]]);
          }
        }
        for (let y = 2; y < H-2; y++) {
          for (const x of [0, 1, W-2, W-1]) {
            const i = (y*W+x)*4;
            edgePixels.push([px[i], px[i+1], px[i+2]]);
          }
        }
        const bgR = edgePixels.reduce((s,c)=>s+c[0],0)/edgePixels.length;
        const bgG = edgePixels.reduce((s,c)=>s+c[1],0)/edgePixels.length;
        const bgB = edgePixels.reduce((s,c)=>s+c[2],0)/edgePixels.length;
        const bgBright = (bgR+bgG+bgB)/3;

        // ── 2. ADAPTIVE TOLERANCE ─────────────────────────────────────────────
        // Light studio backgrounds need high tolerance (gradient near subject).
        // Dark backgrounds need LOW tolerance — the product may also be dark,
        // so we can't afford to eat into it. Instead we use a two-signal approach.
        const TOL_BASE = bgBright > 210 ? 65
                       : bgBright > 170 ? 55
                       : bgBright > 120 ? 45
                       : bgBright < 60  ? 22   // dark bg — very tight tolerance
                       : 42;

        const colorDist = (r:number,g:number,b:number) =>
          Math.sqrt((r-bgR)**2+(g-bgG)**2+(b-bgB)**2);

        // Saturation helper — highly saturated pixels are almost never background
        const getSat = (r:number,g:number,b:number) => {
          const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
          return mx === 0 ? 0 : (mx-mn)/mx;
        };

        // Background variance — how uniform is the bg? Low variance = plain studio
        const bgVarR = edgePixels.reduce((s,c)=>s+Math.abs(c[0]-bgR),0)/edgePixels.length;
        const bgVarG = edgePixels.reduce((s,c)=>s+Math.abs(c[1]-bgG),0)/edgePixels.length;
        const bgVarB = edgePixels.reduce((s,c)=>s+Math.abs(c[2]-bgB),0)/edgePixels.length;
        const bgVariance = (bgVarR+bgVarG+bgVarB)/3;
        const isComplexBg = bgVariance > 18; // textured/noisy bg (wood, fabric, etc.)

        const isLikelyBg = (r:number,g:number,b:number,a:number) => {
          if (a < 30) return true;
          const dist = colorDist(r,g,b);
          if (dist < TOL_BASE) return true;
          // For plain light backgrounds: also mark very light neutrals
          if (!isComplexBg && bgBright > 150 && r > 200 && g > 200 && b > 200) return true;
          // For complex/dark backgrounds: protect highly saturated pixels from being
          // marked as background — those are almost certainly the product
          if (isComplexBg && getSat(r,g,b) > 0.25 && dist > 15) return false;
          return false;
        };

        // ── 3. BFS FLOOD FILL from all edge pixels ───────────────────────────
        const isBg = new Uint8Array(W*H);
        const queue: number[] = [];

        const tryMark = (x:number,y:number) => {
          if (x<0||x>=W||y<0||y>=H) return;
          const idx = y*W+x;
          if (isBg[idx]) return;
          const pi = idx*4;
          if (isLikelyBg(px[pi],px[pi+1],px[pi+2],px[pi+3])) {
            isBg[idx]=1; queue.push(idx);
          }
        };

        for (let x=0;x<W;x++) { tryMark(x,0); tryMark(x,H-1); }
        for (let y=1;y<H-1;y++) { tryMark(0,y); tryMark(W-1,y); }

        let qi=0;
        while (qi<queue.length) {
          const idx=queue[qi++];
          const x=idx%W, y=(idx/W)|0;
          tryMark(x+1,y); tryMark(x-1,y);
          tryMark(x,y+1); tryMark(x,y-1);
        }

        // ── 4. SECOND PASS — sweep remaining near-bg pixels not reached by BFS
        // (handles interior bg pockets like the gap between legs)
        for (let y=0;y<H;y++) {
          for (let x=0;x<W;x++) {
            const idx=y*W+x;
            if (isBg[idx]) continue;
            const pi=idx*4;
            if (isLikelyBg(px[pi],px[pi+1],px[pi+2],px[pi+3])) isBg[idx]=1;
          }
        }

        // ── 5. EROSION — remove halo fringe pixels (≥3 bg neighbors) ─────────
        for (let pass=0;pass<3;pass++) {
          for (let y=1;y<H-1;y++) {
            for (let x=1;x<W-1;x++) {
              const idx=y*W+x;
              if (isBg[idx]) continue;
              const bgN = (isBg[(y-1)*W+x]?1:0)+(isBg[(y+1)*W+x]?1:0)
                        + (isBg[y*W+(x-1)]?1:0)+(isBg[y*W+(x+1)]?1:0);
              if (bgN>=3) isBg[idx]=1;
            }
          }
        }

        // ── 6. CONNECTED COMPONENTS — label all foreground blobs ─────────────
        const label = new Int32Array(W*H); // 0 = unlabeled, -1 = bg
        for (let i=0;i<W*H;i++) if (isBg[i]) label[i]=-1;

        let nextLabel = 1;
        const blobSizes: number[] = [0]; // index = label id, value = pixel count

        for (let y=0;y<H;y++) {
          for (let x=0;x<W;x++) {
            const idx=y*W+x;
            if (label[idx]!==0) continue; // already labeled or bg
            // BFS to label this blob
            const blobQ: number[] = [idx];
            label[idx]=nextLabel;
            let size=0;
            let bqi=0;
            while (bqi<blobQ.length) {
              const cur=blobQ[bqi++]; size++;
              const cx=cur%W, cy=(cur/W)|0;
              for (const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
                if (nx<0||nx>=W||ny<0||ny>=H) continue;
                const ni=ny*W+nx;
                if (label[ni]!==0) continue;
                label[ni]=nextLabel;
                blobQ.push(ni);
              }
            }
            blobSizes.push(size);
            nextLabel++;
          }
        }

        // Find the largest blob
        let largestLabel=1, largestSize=0;
        for (let l=1;l<blobSizes.length;l++) {
          if (blobSizes[l]>largestSize) { largestSize=blobSizes[l]; largestLabel=l; }
        }

        // ── 7. COLLECT LARGEST BLOB PIXELS ───────────────────────────────────
        // Row occupancy of the largest blob only
        const rowFg = new Float32Array(H);
        let minRow=H, maxRow=0, minCol=W, maxCol=0;
        let allR=0,allG=0,allB=0,allN=0;

        for (let y=0;y<H;y++) {
          let cnt=0;
          for (let x=0;x<W;x++) {
            const idx=y*W+x;
            if (label[idx]!==largestLabel) continue;
            const pi=idx*4;
            allR+=px[pi]; allG+=px[pi+1]; allB+=px[pi+2]; allN++;
            cnt++;
            if (y<minRow) minRow=y;
            if (y>maxRow) maxRow=y;
            if (x<minCol) minCol=x;
            if (x>maxCol) maxCol=x;
          }
          rowFg[y]=cnt/W;
        }

        const bbH = Math.max(1, maxRow-minRow);
        const bbW = Math.max(1, maxCol-minCol);
        const bbAspect = bbW / bbH; // blob width/height ratio — KEY shape signal

        // ── 8. CATEGORY — vertical zone analysis of largest blob ──────────────
        // Split blob into 4 quarters vertically
        const q = Math.floor(bbH/4);
        const q1=minRow+q, q2=minRow+q*2, q3=minRow+q*3;

        let fillQ1=0,fillQ2=0,fillQ3=0,fillQ4=0;
        for (let y=minRow; y<q1;   y++) fillQ1+=rowFg[y];
        for (let y=q1;     y<q2;   y++) fillQ2+=rowFg[y];
        for (let y=q2;     y<q3;   y++) fillQ3+=rowFg[y];
        for (let y=q3;     y<=maxRow;y++) fillQ4+=rowFg[y];
        fillQ1/=q||1; fillQ2/=q||1; fillQ3/=q||1; fillQ4/=(maxRow-q3+1)||1;

        const topHalf = (fillQ1+fillQ2)/2;
        const botHalf = (fillQ3+fillQ4)/2;
        const blobHeightRatio = bbH/H; // how tall the blob is relative to canvas

        // Aspect ratio from natural image dimensions
        const imgAspect = img.naturalWidth / img.naturalHeight;

        // ── BLOB SHAPE METRICS ────────────────────────────────────────────────
        // bbAspect = blob width / blob height (from bounding box of fg pixels)
        // <0.5  = very tall narrow  (leggings, boots, long dress)
        // 0.5–0.8 = tall portrait   (jeans, pants, shirt on hanger)
        // 0.8–1.4 = roughly square  (t-shirt, folded item, short dress)
        // >1.4  = wide landscape    (shoes laid flat, belt, bag)
        // blobHeightRatio = how much of the CANVAS HEIGHT the blob occupies
        // <0.4  = small centered product (isolated shoe, accessory)
        // 0.4–0.7 = mid-size product (shirt, folded pants)
        // >0.7  = full-height (model photo, hanging dress)

        let category: WardrobeCategory = 'Tops';

        // ── DEBUG — open browser DevTools console to see these values ────────
        console.log(`[Trendly Classifier] "${file.name}"`, {
          bbAspect: bbAspect.toFixed(3),
          blobHeightRatio: blobHeightRatio.toFixed(3),
          bbH, bbW,
          fillQ1: fillQ1.toFixed(3), fillQ2: fillQ2.toFixed(3),
          fillQ3: fillQ3.toFixed(3), fillQ4: fillQ4.toFixed(3),
          imgAspect: imgAspect.toFixed(3),
          bgBright: bgBright.toFixed(1),
          bgVariance: bgVariance.toFixed(1),
          isComplexBg,
          largestBlobSize: largestSize,
          totalPixels: W*H,
        });

        // ── STEP 0: Jewelry / Necklace detection BEFORE clothing checks ─────────
        // Strategy: detect the characteristic necklace arch pattern.
        // A necklace worn on a neck OR laid on a surface shows:
        //   - Pixels concentrated in a curved band across the TOP portion of blob
        //   - The TOP-LEFT and TOP-RIGHT corners of the blob have MORE pixels than center-top
        //   - High brightness / metallic color (silver, gold, pearl)
        //   - The blob's TOP ROW DENSITY is higher than MID ROW DENSITY (arch hangs down)

        // Sample row density in top-third vs middle-third of blob
        const topThirdEnd  = minRow + Math.floor(bbH * 0.33);
        const midThirdEnd  = minRow + Math.floor(bbH * 0.66);
        let topThirdFg=0, midThirdFg=0, topThirdTotal=0, midThirdTotal=0;
        for (let y=minRow; y<topThirdEnd; y++) {
          for (let x=0; x<W; x++) {
            topThirdTotal++;
            if (label[y*W+x]===largestLabel) topThirdFg++;
          }
        }
        for (let y=topThirdEnd; y<midThirdEnd; y++) {
          for (let x=0; x<W; x++) {
            midThirdTotal++;
            if (label[y*W+x]===largestLabel) midThirdFg++;
          }
        }
        const topThirdDensity = topThirdFg / (topThirdTotal||1);
        const midThirdDensity = midThirdFg / (midThirdTotal||1);

        // For necklaces: top-third is denser than mid-third (the chain curves at top)
        // For shirts: top-third has collar/shoulders, mid is body — roughly equal or mid denser
        const isArchShape = topThirdDensity > midThirdDensity * 1.3 && topThirdDensity > 0.15;

        // Pixel color — necklaces are metallic/bright
        const previewColor = rgbToColorName(allR/(allN||1), allG/(allN||1), allB/(allN||1));
        const isMetallic = ['silver','white','gold','cream','beige','gray'].includes(previewColor);

        // Also check: left-edge and right-edge of TOP THIRD have pixels (= necklace arch ends)
        // but center-top might be sparse (= arch gap above chest)
        let topLeftFg=0, topRightFg=0, topCenterFg=0;
        const archW = maxCol - minCol;
        for (let y=minRow; y<topThirdEnd; y++) {
          for (let x=minCol; x<minCol+Math.floor(archW*0.25); x++)
            if (label[y*W+x]===largestLabel) topLeftFg++;
          for (let x=minCol+Math.floor(archW*0.75); x<=maxCol; x++)
            if (label[y*W+x]===largestLabel) topRightFg++;
          for (let x=minCol+Math.floor(archW*0.35); x<minCol+Math.floor(archW*0.65); x++)
            if (label[y*W+x]===largestLabel) topCenterFg++;
        }
        const hasArchEnds = topLeftFg > 0 && topRightFg > 0;
        const topCenterSparse = topCenterFg < (topLeftFg + topRightFg) * 0.6;
        const isNecklaceArch = hasArchEnds && topCenterSparse && isArchShape;

        let jewelryHint: string | null = null;
        if (isNecklaceArch) {
          category = 'Accessories';
          jewelryHint = 'Necklace';
        }

        // ── STEP A: Blob aspect ratio is the strongest shape signal ──────────
        if (category === 'Tops' && bbAspect > 1.6) {
          // Wider than tall → almost certainly shoes or accessories
          category = 'Shoes';

        } else if (category === 'Tops' && bbAspect > 1.1 && blobHeightRatio < 0.45) {
          // Moderately wide + small blob → shoes or accessories
          category = 'Shoes';

        } else if (category === 'Tops' && bbAspect < 0.55 && blobHeightRatio > 0.65) {
          // Very tall narrow blob → leggings, jeans, or long dress
          // Distinguish: leggings/jeans have TWO narrow columns (legs), dress is single wider column
          // Use mid-width fill: if middle X-columns are mostly empty → two legs → Bottoms
          let midColFg = 0, midColTotal = 0;
          const midX1 = Math.floor(minCol + (maxCol-minCol)*0.35);
          const midX2 = Math.floor(minCol + (maxCol-minCol)*0.65);
          for (let y = minRow; y <= maxRow; y++) {
            for (let x = midX1; x <= midX2; x++) {
              midColTotal++;
              if (label[y*W+x] === largestLabel) midColFg++;
            }
          }
          const midDensity = midColTotal > 0 ? midColFg/midColTotal : 1;
          category = midDensity < 0.4 ? 'Bottoms' : 'Dresses'; // sparse middle = two legs

        } else if (category === 'Tops' && blobHeightRatio > 0.65 && fillQ1>0.12 && fillQ4>0.12) {
          // Full/tall blob → likely a model photo with top + bottom garments
          // Strategy: compare pixel area of top-40% vs bottom-40% of blob
          // The garment with MORE pixels in its zone is the featured item

          // Count foreground pixels in top 40% and bottom 40% of blob
          const splitLine = minRow + Math.floor(bbH * 0.45); // approx waist
          let topPx = 0, botPx = 0;
          for (let y = minRow; y <= maxRow; y++) {
            for (let x = 0; x < W; x++) {
              if (label[y*W+x] !== largestLabel) continue;
              if (y < splitLine) topPx++; else botPx++;
            }
          }

          // Also measure color contrast between top and bottom zones
          // If colors differ a lot → two garments → pick the one with more pixels
          let tR=0,tG=0,tB=0,tN=0, bR=0,bG=0,bB=0,bN=0;
          const topZoneEnd   = minRow + Math.floor(bbH * 0.30);
          const botZoneStart = minRow + Math.floor(bbH * 0.60);
          for (let y = minRow; y <= maxRow; y++) {
            for (let x = 0; x < W; x++) {
              const idx = y*W+x;
              if (label[idx] !== largestLabel) continue;
              const pi = idx*4;
              if (y < topZoneEnd)       { tR+=px[pi];tG+=px[pi+1];tB+=px[pi+2];tN++; }
              else if (y > botZoneStart){ bR+=px[pi];bG+=px[pi+1];bB+=px[pi+2];bN++; }
            }
          }
          const colorDiff = (tN>0 && bN>0)
            ? Math.sqrt(((tR/tN)-(bR/bN))**2+((tG/tN)-(bG/bN))**2+((tB/tN)-(bB/bN))**2)
            : 0;

          const lowerDominance = (fillQ3+fillQ4) / (fillQ1+fillQ2+0.001);
          const upperDominance = (fillQ1+fillQ2) / (fillQ3+fillQ4+0.001);

          if (colorDiff > 18) {
            // Two visually different garments — the one covering more pixels wins
            // Pants always cover more area than a shirt in a model photo
            category = botPx >= topPx ? 'Bottoms' : 'Tops';
          } else if (lowerDominance > 1.1) {
            category = 'Bottoms';
          } else if (upperDominance > 1.5) {
            category = 'Outerwear';
          } else if (bbAspect < 0.65) {
            category = 'Dresses';
          } else {
            // Tall blob, similar color top-to-bottom
            // In model photos, pants dominate by pixel count → use botPx
            category = botPx >= topPx ? 'Bottoms' : 'Tops';
          }

        } else if (category === 'Tops' && bbAspect >= 0.55 && bbAspect <= 1.35) {
          // Isolated product shot (not full-body)
          // Use pixel area distribution: count fg pixels in top half vs bottom half of blob
          let topHalfPx = 0, botHalfPx = 0;
          const blobMid = minRow + Math.floor(bbH * 0.5);
          for (let y = minRow; y <= maxRow; y++) {
            for (let x = 0; x < W; x++) {
              if (label[y*W+x] !== largestLabel) continue;
              if (y < blobMid) topHalfPx++; else botHalfPx++;
            }
          }
          // Shirts/tops: wider at shoulders → more pixels in top half
          // Pants/jeans: wider at hips/thighs → more pixels in bottom half
          // Ratio threshold 1.15 = top has 15% more pixels → Tops
          const topBotRatio = topHalfPx / (botHalfPx + 1);
          if (topBotRatio > 1.15) {
            category = 'Tops';
          } else if (topBotRatio < 0.88) {
            category = 'Bottoms';
          } else {
            // Very balanced — use blob aspect: wider = top, narrower = bottom
            category = bbAspect > 0.85 ? 'Tops' : 'Bottoms';
          }
        }

        // ── 9. COLOR from the DOMINANT ZONE of the largest blob ───────────────
        // For a model photo (tall blob), the pants are in the lower 60%.
        // We identify which zone is the "featured" garment and sample only that.
        let colorR=0,colorG=0,colorB=0,colorN=0;

        // Determine color sampling zone — only sample the TARGET garment zone
        // For model photos: skip the other garment entirely
        let sampleMinY: number, sampleMaxY: number;
        if (category === 'Bottoms') {
          // For model photos (tall blob): pants start ~40% down from top of blob
          // For isolated pants shots: sample full blob
          sampleMinY = blobHeightRatio > 0.65
            ? minRow + Math.floor(bbH * 0.42)   // model photo — skip shirt zone
            : minRow + Math.floor(bbH * 0.1);    // isolated product
          sampleMaxY = maxRow - Math.floor(bbH * 0.05); // skip shoes at very bottom
        } else if (category === 'Tops') {
          sampleMinY = minRow;
          sampleMaxY = blobHeightRatio > 0.65
            ? minRow + Math.floor(bbH * 0.42)   // model photo — only shirt zone
            : minRow + Math.floor(bbH * 0.75);   // isolated product
        } else if (category === 'Outerwear') {
          sampleMinY = minRow;
          sampleMaxY = minRow + Math.floor(bbH * 0.60);
        } else {
          // Dress / full garment — sample the middle 60%
          sampleMinY = minRow + Math.floor(bbH * 0.15);
          sampleMaxY = minRow + Math.floor(bbH * 0.85);
        }

        // Collect candidate color pixels from the target zone
        const colorPixels: [number,number,number][] = [];
        for (let y=sampleMinY; y<=sampleMaxY; y++) {
          for (let x=0; x<W; x++) {
            const idx=y*W+x;
            if (label[idx]!==largestLabel) continue;
            const pi=idx*4;
            const r=px[pi], g=px[pi+1], b=px[pi+2];
            // Skip pixels too similar to background
            const distToBg = Math.sqrt((r-bgR)**2+(g-bgG)**2+(b-bgB)**2);
            if (distToBg < 18) continue;
            colorPixels.push([r,g,b]);
          }
        }

        if (colorPixels.length > 0) {
          // ── IMPROVED COLOR EXTRACTION ────────────────────────────────────────
          // Always bias toward highest-saturation foreground pixels.
          // This mirrors what rembg+fg-sampling does server-side:
          //   residual bg pixels (e.g. brown table edge) have lower saturation
          //   than the clothing item (e.g. navy shoe), so sorting by sat DESC
          //   and keeping the top 50% naturally excludes bg contamination.
          //
          // For desaturated items (black/white/gray), saturation sorting can't help
          // — they're all low-sat — so we fall back to trimmed brightness mean.

          const withSat = colorPixels.map(([r,g,b]) => {
            const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
            const sat = mx === 0 ? 0 : (mx - mn) / mx;
            return { r, g, b, sat } as const;
          });

          // Compute median saturation of the blob
          const sortedSats = [...withSat].sort((a,b) => a.sat - b.sat);
          const medianSat = sortedSats[Math.floor(sortedSats.length / 2)].sat;

          let sampledPixels: typeof withSat;

          if (medianSat > 0.15) {
            // Colorful item (navy, red, green, blue, etc.)
            // Top 50% by saturation = garment fabric, not residual bg
            withSat.sort((a,b) => b.sat - a.sat);
            const keep = Math.max(10, Math.floor(withSat.length * 0.5));
            sampledPixels = withSat.slice(0, keep);
          } else {
            // Desaturated item (black, white, gray, beige)
            // Saturation is unhelpful here — use trimmed brightness mean instead
            withSat.sort((a,b) => (a.r+a.g+a.b) - (b.r+b.g+b.b));
            const trim = Math.floor(withSat.length * 0.2);
            sampledPixels = withSat.slice(trim, withSat.length - trim);
          }

          for (const {r,g,b} of sampledPixels) {
            colorR+=r; colorG+=g; colorB+=b; colorN++;
          }
        }

        // Filename keyword overrides category (strongest signal)
        const fileCategory = inferCategoryFromFileName(file.name);
        if (fileCategory) category = fileCategory;

        // Determine color name
        let colorName = 'gray';
        if (colorN > 10) {
          colorName = rgbToColorName(colorR/colorN, colorG/colorN, colorB/colorN);
        } else if (allN > 0) {
          colorName = rgbToColorName(allR/allN, allG/allN, allB/allN);
        }

        URL.revokeObjectURL(objectUrl);

        const avgBright = allN>0 ? (allR+allG+allB)/(allN*3) : 128;
        const tags = [category.toUpperCase(), colorName.toUpperCase()];
        if (avgBright < 70) tags.push('DARK');
        else if (avgBright > 190) tags.push('LIGHT');

        let sub_category = jewelryHint as WardrobeSubCategory | null ?? inferSubCategory(category, colorName, bbH, bbAspect, imgAspect, file.name);

        // If inferSubCategory returned an Outerwear sub (Blazer, Jacket, Coat etc.)
        // but category was set to Tops, correct the category now
        const outerSubs = ['Jacket','Coat','Blazer','Cardigan','Windbreaker','Parka','Trench Coat'];
        if (sub_category && outerSubs.includes(sub_category) && category === 'Tops') {
          category = 'Outerwear';
        }
        // Similarly correct Bottoms subs under wrong categories
        const bottomSubs = ['Jeans','Pants','Shorts','Skirt','Leggings','Joggers'];
        if (sub_category && bottomSubs.includes(sub_category) && category === 'Tops') {
          category = 'Bottoms';
        }

        // ── MULTI-GARMENT DETECTION ────────────────────────────────────────────
        // A full-body model photo where blobHeightRatio > 0.75 likely has BOTH
        // a top AND a bottom. Split the canvas into two crops.
        const isModelPhoto = blobHeightRatio > 0.75 && fillQ1 > 0.15 && fillQ4 > 0.15;
        const topColorDiffers = (() => {
          // Sample top quarter vs bottom quarter color — if very different, split
          let tr=0,tg=0,tb=0,tn=0, br2=0,bg2=0,bb2=0,bn=0;
          for (let y=minRow; y<minRow+Math.floor(bbH*0.3); y++) {
            for (let x=0;x<W;x++) {
              const idx=y*W+x;
              if (label[idx]!==largestLabel) continue;
              const pi=idx*4;
              tr+=px[pi];tg+=px[pi+1];tb+=px[pi+2];tn++;
            }
          }
          for (let y=maxRow-Math.floor(bbH*0.3); y<=maxRow; y++) {
            for (let x=0;x<W;x++) {
              const idx=y*W+x;
              if (label[idx]!==largestLabel) continue;
              const pi=idx*4;
              br2+=px[pi];bg2+=px[pi+1];bb2+=px[pi+2];bn++;
            }
          }
          if (tn===0||bn===0) return false;
          const dist = Math.sqrt(
            ((tr/tn)-(br2/bn))**2+((tg/tn)-(bg2/bn))**2+((tb/tn)-(bb2/bn))**2
          );
          return dist > 40; // colors differ enough to be different garments
        })();

        // Don't split if the top-level classification is already confident Outerwear/Dress
        // — splitting would break a blazer into two wrong items
        const shouldSplit = isModelPhoto && topColorDiffers && 
          category !== 'Outerwear' && category !== 'Dresses';

        if (shouldSplit) {
          // Split into top crop and bottom crop
          const splitY = Math.floor(H * 0.42); // approx waist line

          const topCanvas = document.createElement('canvas');
          topCanvas.width = W; topCanvas.height = splitY;
          const topCtx = topCanvas.getContext('2d');
          if (topCtx) topCtx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * (splitY/H), 0, 0, W, splitY);

          const botCanvas = document.createElement('canvas');
          botCanvas.width = W; botCanvas.height = H - splitY;
          const botCtx = botCanvas.getContext('2d');
          if (botCtx) botCtx.drawImage(img, 0, img.naturalHeight * (splitY/H), img.naturalWidth, img.naturalHeight * ((H-splitY)/H), 0, 0, W, H-splitY);

          const toFile = (c: HTMLCanvasElement, name: string): Promise<File> =>
            new Promise(res => c.toBlob(b => res(new File([b!], name, { type: 'image/jpeg' })), 'image/jpeg', 0.9));

          URL.revokeObjectURL(objectUrl);
          const [topFile, botFile] = await Promise.all([
            toFile(topCanvas, file.name.replace(/\.\w+$/, '') + '_top.jpg'),
            toFile(botCanvas, file.name.replace(/\.\w+$/, '') + '_bottom.jpg'),
          ]);
          const [topResults, botResults] = await Promise.all([
            analyzeImageLocally(topFile),
            analyzeImageLocally(botFile),
          ]);
          // Promote top crop to Outerwear if the full-image analysis suggested it,
          // or if the sub_category is a known outerwear item
          const outerSubCategories = ['Jacket','Coat','Blazer','Cardigan','Windbreaker','Parka','Trench Coat'];
          const topItem = { ...topResults[0] };
          if (topItem.sub_category && outerSubCategories.includes(topItem.sub_category)) {
            topItem.category = 'Outerwear';
            topItem.tags = ['OUTERWEAR', topItem.color.toUpperCase(), topItem.sub_category.toUpperCase().replace(' ','_')];
          }
          resolve([topItem, ...botResults]);
          return;
        }

        URL.revokeObjectURL(objectUrl);
        console.log(`[Trendly Result] "${file.name}" →`, category, '/', sub_category, '/', colorName);
        resolve([{ category, sub_category, color: colorName, tags }]);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')); };
    img.src = objectUrl;
  });
}

function rgbToColorName(r: number, g: number, b: number): string {
  const brightness = (r+g+b)/3;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const delta = max-min;
  const sat = max<1 ? 0 : delta/max;

  if (sat < 0.13) {
    if (brightness < 40)  return 'black';
    if (brightness < 85)  return 'charcoal';
    if (brightness < 145) return 'gray';
    if (brightness < 205) return 'silver';
    return 'white';
  }

  let hue = 0;
  if (max===r)      hue=((g-b)/delta)%6;
  else if (max===g) hue=(b-r)/delta+2;
  else              hue=(r-g)/delta+4;
  hue=hue*60; if (hue<0) hue+=360;

  // Beige/khaki detection — low saturation warm tone
  if (sat < 0.30 && brightness > 140 && hue > 20 && hue < 60) return 'beige';
  if (sat < 0.35 && brightness > 100 && brightness < 160 && hue > 20 && hue < 55) return 'khaki';

  if (hue<18||hue>=342) return brightness<85  ? 'maroon' : sat>0.55 ? 'red'   : 'rose';
  if (hue<38)           return brightness<110 ? 'brown'  : 'orange';
  if (hue<68)           return brightness<130 ? 'olive'  : 'yellow';
  if (hue<82)           return 'lime';
  if (hue<163)          return sat>0.4 ? 'green' : 'sage';
  if (hue<193)          return 'teal';
  if (hue<262)          return brightness<110 ? 'navy'   : 'blue';  // wider navy range for dark shoes
  if (hue<292)          return brightness<110 ? 'navy'   : 'purple';
  if (hue<320)          return brightness<100 ? 'plum'   : 'violet';
  if (hue<342)          return brightness<110 ? 'wine'   : 'pink';
  return 'red';
}

export async function extractTextFromInvitation(file: File) {
  try {
    const dataUrl = await fileToDataUrl(file);
    const result = await postJson<{ text?: string }>(`${LOCAL_AI_BASE}/extract-text`, {
      image: dataUrl,
      filename: file.name,
    });
    return (result.text || '').trim() || file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  } catch {
    return file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  }
}

export async function parseEventDetailsFromText(text: string) {
  try {
    const parsed = await postJson<{ event_type?: string; dress_code?: string; location?: string }>(
      `${LOCAL_AI_BASE}/event-parse`,
      { text }
    );
    return {
      event_type: parsed.event_type || inferEventType(text),
      dress_code: parsed.dress_code || inferDressCode(text),
      location: parsed.location || inferLocation(text),
    };
  } catch {
    return {
      event_type: inferEventType(text),
      dress_code: inferDressCode(text),
      location: inferLocation(text),
    };
  }
}

export async function generateEventOutfitIdeas(input: { eventType: string; dressCode: string; wardrobeSummary: string }) {
  try {
    const response = await postJson<{ ideas?: string[] }>(`${LOCAL_AI_BASE}/event-outfit-ideas`, input);
    if (response.ideas && response.ideas.length > 0) {
      return response.ideas;
    }
  } catch {
    // Use fallback ideas if local AI server is unavailable.
  }

  return [
    `${input.dressCode} ${input.eventType} look with clean layering`,
    `Smart ${input.eventType} outfit with balanced accessories`,
    `Comfort-first ${input.eventType} ensemble with elevated footwear`,
  ];
}

export async function analyzeFaceAndSkin(_faceImage: File) {
  return { faceShape: 'oval', skinTone: 'medium' };
}

export async function suggestHairstyles(faceShape: string, skinTone: string) {
  try {
    const response = await postJson<{ styles?: string[] }>(`${LOCAL_AI_BASE}/hairstyle-suggestions`, {
      faceShape,
      skinTone,
    });
    if (response.styles && response.styles.length > 0) {
      return response.styles;
    }
  } catch {
    // Use defaults.
  }

  return ['Textured Crop', 'Sleek Undercut', 'Modern Quiff'];
}

export async function applyHairstyleToFace(faceImage: File, stylePrompt: string) {
  const inputUrl = await fileToDataUrl(faceImage);
  const response = await generateOutfitImage(`portrait hairstyle preview, ${stylePrompt}, clean studio lighting`);
  return response || inputUrl;
}

export async function generateOutfitOverlayImage(userPhoto: File, outfitDescription: string, outfitImageUrl?: string | null) {
  const prompt = [
    'fashion virtual try-on preview',
    outfitDescription,
    outfitImageUrl ? `reference outfit ${outfitImageUrl}` : '',
    'photorealistic, full body, clean lighting',
  ].filter(Boolean).join(', ');

  try {
    return await generateOutfitImage(prompt);
  } catch {
    return fileToDataUrl(userPhoto);
  }
}

export async function generateLocalEventsFromLocation(city: string, monthLabel: string) {
  try {
    const response = await postJson<{ events?: string[] }>(`${LOCAL_AI_BASE}/local-events`, { city, monthLabel });
    if (response.events && response.events.length > 0) {
      return response.events;
    }
  } catch {
    // Use defaults.
  }

  return [`${city} Style Meetup | ${new Date().toISOString().split('T')[0]}`, `${city} Fashion Pop-Up | ${new Date().toISOString().split('T')[0]}`];
}

function inferSubCategory(
  category: WardrobeCategory,
  color: string,
  bbH: number,
  bbAspect: number,
  imgAspect: number,
  filename: string = ''
): WardrobeSubCategory | null {
  const fn = filename.toLowerCase();

  // ── TOPS ────────────────────────────────────────────────────────────────────
  if (category === 'Tops') {
    if (/hoodie|hoody/.test(fn))                          return 'Hoodie';
    if (/sweatshirt|sweater/.test(fn))                    return 'Sweatshirt';
    if (/polo/.test(fn))                                  return 'Polo Shirt';
    if (/tank|sleeveless|vest/.test(fn))                  return 'Tank Top';
    if (/crop/.test(fn))                                  return 'Crop Top';
    if (/blouse/.test(fn))                                return 'Blouse';
    if (/tshirt|t-shirt|tee|\bt\b/.test(fn))           return 'T-Shirt';
    if (/shirt/.test(fn))                                 return 'Shirt';

    // Shape signals
    if (bbAspect > 1.5)                                   return 'Tank Top';   // very wide + short
    if (bbH < 55 && imgAspect > 0.9)                      return 'Crop Top';   // cropped item
    // Color + shape for shirts vs tees
    if (color === 'white' || color === 'black' || color === 'navy' || color === 'blue') {
      if (bbH > 75)                                       return 'Shirt';      // formal collar shirt
    }
    if (bbH > 85)                                         return 'Hoodie';     // tall + bulky
    return 'T-Shirt';
  }

  // ── BOTTOMS ─────────────────────────────────────────────────────────────────
  if (category === 'Bottoms') {
    if (/jean|denim/.test(fn))                            return 'Jeans';
    if (/legging/.test(fn))                               return 'Leggings';
    if (/jogger|sweatpant/.test(fn))                      return 'Joggers';
    if (/\bshort/.test(fn))                              return 'Shorts';
    if (/skirt/.test(fn))                                 return 'Skirt';
    if (/trouser|chino|pant/.test(fn))                    return 'Pants';

    // Shape: very narrow tall → leggings; wide → shorts; mid → pants
    if (imgAspect < 0.45)                                 return 'Leggings';
    if (bbAspect > 1.1 && bbH < 70)                      return 'Shorts';
    // Color signals
    if (color === 'blue' || color === 'navy' || color === 'indigo') return 'Jeans';
    if (color === 'black' || color === 'charcoal')        return 'Pants';
    if (color === 'beige' || color === 'khaki' || color === 'olive' || color === 'gray') return 'Pants';
    if (color === 'white' || color === 'cream')           return 'Pants';
    return 'Jeans';
  }

  // ── DRESSES ─────────────────────────────────────────────────────────────────
  if (category === 'Dresses') {
    if (/maxi/.test(fn))                                  return 'Maxi Dress';
    if (/midi/.test(fn))                                  return 'Midi Dress';
    if (/mini/.test(fn))                                  return 'Mini Dress';
    if (/bodycon/.test(fn))                               return 'Bodycon Dress';
    if (/evening|gown|ball/.test(fn))                     return 'Evening Gown';
    if (/party|cocktail/.test(fn))                        return 'Party Dress';
    if (/casual/.test(fn))                                return 'Casual Dress';

    // Shape: very tall portrait = maxi; medium = midi; short = mini
    if (imgAspect < 0.5)                                  return 'Maxi Dress';
    if (imgAspect < 0.7)                                  return 'Midi Dress';
    // Dark/rich colors → party/bodycon
    if (color === 'black' || color === 'wine' || color === 'maroon' || color === 'plum') return 'Party Dress';
    // Narrow tight silhouette → bodycon
    if (bbAspect < 0.45)                                  return 'Bodycon Dress';
    return 'Casual Dress';
  }

  // ── OUTERWEAR ───────────────────────────────────────────────────────────────
  if (category === 'Outerwear') {
    if (/trench/.test(fn))                                return 'Trench Coat';
    if (/parka/.test(fn))                                 return 'Parka';
    if (/windbreaker/.test(fn))                           return 'Windbreaker';
    if (/cardigan/.test(fn))                              return 'Cardigan';
    if (/blazer/.test(fn))                                return 'Blazer';
    if (/\bcoat\b/.test(fn))                            return 'Coat';
    if (/jacket/.test(fn))                                return 'Jacket';

    // Shape: very long portrait → coat; structured dark → blazer; light = cardigan
    if (imgAspect < 0.55)                                 return 'Coat';
    if (imgAspect < 0.7 && bbH > 100)                    return 'Trench Coat';
    if (color === 'black' || color === 'charcoal' || color === 'navy') return 'Blazer';
    if (color === 'white' || color === 'beige' || color === 'cream' || color === 'gray') return 'Cardigan';
    return 'Jacket';
  }

  // ── SHOES ───────────────────────────────────────────────────────────────────
  if (category === 'Shoes') {
    if (/sneaker|trainer|nike|adidas|running/.test(fn))   return 'Sneakers';
    if (/boot/.test(fn))                                  return 'Boots';
    if (/sandal|flip/.test(fn))                           return 'Sandals';
    if (/heel|pump|stiletto/.test(fn))                    return 'Heels';
    if (/loafer|moccasin/.test(fn))                       return 'Loafers';
    if (/flat|ballet/.test(fn))                           return 'Flats';
    if (/slipper/.test(fn))                               return 'Slippers';

    // Shape: tall narrow → boots; wide flat → sandals/flats; chunky → sneakers
    if (imgAspect < 0.6)                                  return 'Boots';
    if (imgAspect > 1.8)                                  return 'Sandals';
    if (color === 'white' || color === 'black' || color === 'gray') return 'Sneakers';
    return 'Sneakers';
  }

  // ── ACCESSORIES ─────────────────────────────────────────────────────────────
  if (category === 'Accessories') {
    if (/bag|purse|tote|clutch|backpack/.test(fn))        return 'Bag';
    if (/belt/.test(fn))                                  return 'Belt';
    if (/\bhat\b|cap|beanie|beret/.test(fn))            return 'Hat';
    if (/sunglass|goggle/.test(fn))                       return 'Sunglasses';
    if (/\bwatch\b|smartwatch/.test(fn))                return 'Watch';
    if (/\bring\b|engagement|wedding band/.test(fn))    return 'Ring';
    if (/necklace|pendant|chain/.test(fn))                return 'Necklace';
    if (/bracelet|bangle|wristband/.test(fn))             return 'Bracelet';
    if (/earring|stud|hoop/.test(fn))                     return 'Earrings';
    if (/scarf|shawl/.test(fn))                           return 'Scarf';
    if (/jewel/.test(fn))                                 return 'Necklace';

    // Shape-based jewelry detection when filename gives no clue
    const isBrightItem = (color === 'silver' || color === 'white' || color === 'gold'
                       || color === 'cream' || color === 'beige');

    // Ring: roughly square blob, bright/metallic color
    // Works even if blobHeightRatio is large (dark bg = poor bg removal = bigger blob)
    if (isBrightItem && bbAspect > 0.65 && bbAspect < 1.5 && imgAspect > 0.65 && imgAspect < 1.5) {
      return 'Ring';
    }

    // Necklace: wider than tall, bright/metallic
    if (isBrightItem && bbAspect >= 1.5) return 'Necklace';

    // Shape: wide rectangle → bag; thin tall → belt
    if (imgAspect > 1.6)   return 'Bag';
    if (imgAspect < 0.25)  return 'Belt';

    // Small blob = jewelry item
    if (blobHeightRatio < 0.5) return 'Ring';

    return 'Bag';
  }

  return null;
}


function inferCategoryFromFileName(name: string): WardrobeCategory | null {
  const lower = name.toLowerCase().replace(/[_\-\s]+/g, ' ');
  // Check Shoes first (most specific)
  if (/shoe|sneaker|boot|heel|loafer|sandal|slipper|footwear/.test(lower)) return 'Shoes';
  // Outerwear before tops (blazer/jacket/coat can contain "t")
  if (/jacket|coat|blazer|cardigan|windbreaker|parka|trench/.test(lower)) return 'Outerwear';
  // Hoodies are Tops, not Outerwear
  if (/hoodie|sweatshirt/.test(lower)) return 'Tops';
  // Accessories
  if (/watch|belt|bag|cap|hat|scarf|sunglass|jewel|necklace|bracelet/.test(lower)) return 'Accessories';
  // Dresses — only if explicitly named (never infer from generic names like OIP)
  if (/\bdress\b|\bgown\b|saree|sari|\bmaxi\b|\bmidi\b|bodycon/.test(lower)) return 'Dresses';
  // Bottoms
  if (/jean|pant|trouser|\bshort\b|skirt|legging|jogger/.test(lower)) return 'Bottoms';
  // Tops — shirts, tees, blouses, etc.
  if (/shirt|\btop\b|\btee\b|tshirt|t-shirt|kurta|blouse|polo|tank|crop/.test(lower)) return 'Tops';
  // Generic product codes (like "OIP (8)") default to Tops, not Dresses
  return null;
}

function inferColorFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  const colors = ['black', 'white', 'gray', 'blue', 'red', 'green', 'yellow', 'brown', 'beige', 'pink', 'orange', 'purple', 'navy', 'cream'];
  return colors.find((color) => lower.includes(color)) || null;
}

function inferEventType(text: string) {
  if (/wedding|reception|engagement/i.test(text)) return 'Wedding Event';
  if (/party|birthday|celebration/i.test(text)) return 'Party Event';
  if (/office|meeting|corporate|conference/i.test(text)) return 'Office Event';
  return 'General Event';
}

function inferDressCode(text: string) {
  if (/formal|black tie/i.test(text)) return 'Formal';
  if (/ethnic|traditional/i.test(text)) return 'Ethnic';
  if (/casual|relaxed/i.test(text)) return 'Casual';
  return 'Smart Casual';
}

function inferLocation(text: string) {
  const match = text.match(/\b(?:at|in)\s+([A-Za-z\s]{3,40})/i);
  return match?.[1]?.trim() || '';
}
