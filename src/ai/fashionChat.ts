import { supabase } from '../lib/supabaseClient';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  metadata?: any;
}

export interface OutfitPieces {
  top: string;
  bottom: string;
  shoes: string;
  accessories: string;
  outerwear?: string;
}

export interface AIStylistStructuredResponse {
  message: string;
  summary: string;
  suggestion: string;
  items: string[];
  outfit?: OutfitPieces;
  why?: string;
  tip?: string;
  weather?: string;
}

export type QAStep = 'occasion' | 'when' | 'style' | 'color' | 'done';

export interface QAState {
  step: QAStep;
  occasion: string | null;
  when: string | null;
  style: string | null;
  color: string | null;
}

export function createQAState(): QAState {
  return { step: 'occasion', occasion: null, when: null, style: null, color: null };
}

async function callClaude(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  system: string,
  maxTokens = 900
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json();
  return (data.content as Array<{ type: string; text: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

async function generateOutfitFromClaude(
  qa: QAState,
  gender: string,
  modifier = ''
): Promise<AIStylistStructuredResponse> {
  const system = `You are Trendly, a fun Gen-Z AI fashion stylist. Respond ONLY with a valid JSON object, no markdown, no backticks, no extra text.`;

  const prompt = `Generate a complete outfit recommendation.
Occasion: ${qa.occasion}
When: ${qa.when}
Style vibe: ${qa.style}
Color preference: ${qa.color}
Gender: ${gender || 'unspecified'}
${modifier ? `Special instruction: ${modifier}` : ''}

Return ONLY this JSON (no extra keys, no markdown):
{
  "intro": "1-2 sentence hype intro, casual Gen-Z tone with emojis",
  "weather": "estimated weather for when they are wearing this",
  "outfit": {
    "top": "specific clothing item with color and style",
    "bottom": "specific clothing item with color and style",
    "shoes": "specific footwear with color and style",
    "accessories": "2-3 specific accessories",
    "outerwear": "specific outerwear or leave empty string if not needed"
  },
  "why": "1-2 sentences explaining why this outfit works",
  "tip": "1 specific fun styling tip"
}`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], system);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const outfit: OutfitPieces = {
      top: String(parsed.outfit?.top || ''),
      bottom: String(parsed.outfit?.bottom || ''),
      shoes: String(parsed.outfit?.shoes || ''),
      accessories: String(parsed.outfit?.accessories || ''),
      outerwear: parsed.outfit?.outerwear || undefined,
    };

    const items = [outfit.top, outfit.bottom, outfit.shoes, outfit.accessories, outfit.outerwear]
      .filter(Boolean) as string[];

    return {
      message: String(parsed.intro || `Here's your ${qa.occasion} outfit 🔥`),
      summary: `${qa.style} outfit for ${qa.occasion}`,
      suggestion: `${qa.style} look for ${qa.occasion}`,
      items,
      outfit,
      why: String(parsed.why || ''),
      tip: String(parsed.tip || ''),
      weather: String(parsed.weather || ''),
    };
  } catch {
    return fallbackOutfitReply(qa, gender);
  }
}

export async function getAIStylistResponse(
  userInput: string,
  conversationHistory: ConversationMessage[],
  qa: QAState,
  gender = ''
): Promise<{ response: AIStylistStructuredResponse; nextQA: QAState }> {
  const nextQA = { ...qa };

  if (qa.step === 'occasion') {
    nextQA.occasion = userInput;
    nextQA.step = 'when';
    return {
      response: { message: `Nice choice 🔥\n\nWhen are you planning to wear this outfit?`, summary: 'Asking when', suggestion: '', items: [] },
      nextQA,
    };
  }

  if (qa.step === 'when') {
    nextQA.when = userInput;
    nextQA.step = 'style';
    return {
      response: { message: `Got it 😎\n\nWhat vibe are you going for?`, summary: 'Asking style', suggestion: '', items: [] },
      nextQA,
    };
  }

  if (qa.step === 'style') {
    nextQA.style = userInput;
    nextQA.step = 'color';
    return {
      response: { message: `Okay bestie 👀\n\nAny color preference?`, summary: 'Asking color', suggestion: '', items: [] },
      nextQA,
    };
  }

  if (qa.step === 'color') {
    nextQA.color = userInput;
    nextQA.step = 'done';
    const outfitResp = await generateOutfitFromClaude(nextQA, gender);
    return { response: outfitResp, nextQA };
  }

  if (qa.step === 'done') {
    if (/classy|elegant|elevated/i.test(userInput)) {
      const resp = await generateOutfitFromClaude(qa, gender, 'Make this MORE CLASSY and elevated with refined, polished pieces.');
      return { response: resp, nextQA };
    }
    if (/budget|cheap|affordable/i.test(userInput)) {
      const resp = await generateOutfitFromClaude(qa, gender, 'Create an AFFORDABLE budget version, total outfit under ₹1500.');
      return { response: resp, nextQA };
    }
    if (/another|different|new outfit/i.test(userInput)) {
      const resp = await generateOutfitFromClaude(qa, gender, 'Create a COMPLETELY DIFFERENT outfit for the same occasion and style.');
      return { response: resp, nextQA };
    }
    if (/premium|luxury|high.?end/i.test(userInput)) {
      const resp = await generateOutfitFromClaude(qa, gender, 'Create a PREMIUM luxury version with high-end designer-style pieces.');
      return { response: resp, nextQA };
    }

    try {
      const system = `You are Trendly, a fun Gen-Z AI fashion stylist. Short, helpful, casual replies with emojis. Give specific clothing suggestions when asked. Context: occasion=${qa.occasion}, style=${qa.style}.`;
      const msgs = [
        ...conversationHistory.slice(-6).map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
        { role: 'user' as const, content: userInput },
      ];
      const reply = await callClaude(msgs, system, 400);
      return { response: { message: reply, summary: reply, suggestion: '', items: [] }, nextQA };
    } catch {
      return {
        response: { message: "Try asking me to show a classy version, budget version, or another outfit! 👀", summary: '', suggestion: '', items: [] },
        nextQA,
      };
    }
  }

  return {
    response: { message: "Hey bestie! 👋✨ Tell me what event you're dressing for and I'll put together a fire outfit!", summary: '', suggestion: '', items: [] },
    nextQA,
  };
}

function fallbackOutfitReply(qa: QAState, _gender: string): AIStylistStructuredResponse {
  const style = (qa.style || 'Casual').replace(' ✨', '').trim();

  const outfits: Record<string, OutfitPieces & { why: string; tip: string }> = {
    Streetwear: { top: 'Oversized black graphic tee', bottom: 'Beige cargo pants', shoes: 'White chunky sneakers', accessories: 'Silver chain + mini crossbody bag', outerwear: 'Zip-up bomber jacket', why: 'The oversized silhouette keeps it laid-back while cargos add that streetwear edge.', tip: 'Tuck the front of the tee slightly for instant cool energy 😎' },
    Classy: { top: 'Fitted white button-down', bottom: 'Straight-leg charcoal trousers', shoes: 'Clean white loafers', accessories: 'Gold hoops + structured mini bag', outerwear: 'Tailored camel blazer', why: 'Tailored pieces create a polished silhouette that reads effortlessly classy.', tip: 'Roll the blazer sleeves to the elbow — relaxed-luxe energy 💫' },
    Casual: { top: 'Fitted crewneck sweatshirt', bottom: 'Straight-cut mid-wash jeans', shoes: 'Clean canvas sneakers', accessories: 'Simple watch + tote bag', outerwear: 'Denim jacket', why: 'Classic casual combo — comfort meets effortless style.', tip: 'Add a baseball cap to elevate the casual look instantly 🧢' },
    Minimal: { top: 'Clean white fitted tee', bottom: 'Slim black trousers', shoes: 'Minimalist white leather sneakers', accessories: 'Thin gold chain + leather watch', outerwear: 'Light camel trench coat', why: 'Less is more — a neutral palette creates a sleek editorial look.', tip: 'Max 3 colors in the whole outfit for true minimal energy 🖤' },
    Sporty: { top: 'Athletic hoodie', bottom: 'Jogger pants', shoes: 'Retro trainers', accessories: 'Sports watch + gym bag', outerwear: 'Track jacket', why: 'Athletic silhouette keeps you sharp without trying too hard.', tip: 'Match one sneaker color to your top for a cohesive look 👟' },
    Trendy: { top: 'Oversized printed polo', bottom: 'Low-rise wide-leg jeans', shoes: 'Platform sneakers', accessories: 'Layered necklaces + chunky rings', outerwear: 'Cropped faux-leather jacket', why: 'Hits every current trend note — proportions to accessories.', tip: 'Over-accessorize intentionally — stacking jewelry is peak trendy ✨' },
  };

  const base = outfits[style] || outfits['Casual'];
  const items = [base.top, base.bottom, base.shoes, base.accessories, base.outerwear].filter(Boolean) as string[];

  return {
    message: `Okay bestie 👀 here's a fire ${qa.occasion} outfit for you 🔥`,
    summary: `${style} outfit for ${qa.occasion}`,
    suggestion: `${style} look for ${qa.occasion}`,
    items,
    outfit: { top: base.top, bottom: base.bottom, shoes: base.shoes, accessories: base.accessories, outerwear: base.outerwear },
    why: base.why,
    tip: base.tip,
    weather: 'Check the forecast closer to your event',
  };
}

export async function saveConversationMessage(userId: string, message: string, role: 'user' | 'assistant', metadata?: any) {
  // session_id must be passed in metadata
  const sessionId = metadata?.session_id || 'default';
  const { error } = await supabase.from('ai_conversations').insert([{ user_id: userId, session_id: sessionId, message, role, metadata }]);
  if (error) throw error;
}

export async function loadConversationHistory(userId: string): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[loadConversationHistory] Supabase error:', error);
    throw error;
  }
  if (!data) return {};
  // Group by session_id
  const grouped: { [sessionId: string]: ConversationMessage[] } = {};
  for (const row of data) {
    const sessionId = row.session_id || 'default';
    if (!grouped[sessionId]) grouped[sessionId] = [];
    grouped[sessionId].push({
      role: row.role as 'user' | 'assistant',
      content: row.message as string,
      metadata: row.metadata,
    });
  }
  return grouped;
}
