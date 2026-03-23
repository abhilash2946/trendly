import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'trendly-local-ai-server', model: OLLAMA_MODEL });
});

app.post('/ai-stylist', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    if (isGreetingPrompt(prompt) && history.length === 0) {
      return res.json({
        suggestion: '',
        items: [],
        summary: "Hello! I'm your Trendly AI Stylist. What event are you dressing for today?",
      });
    }

    if (needsEventBeforeSuggestion(prompt, history)) {
      return res.json({
        suggestion: '',
        items: [],
        summary: 'Tell me the occasion first and I will build a better outfit recommendation for you.',
      });
    }

    const system = [
      'You are Trendly AI Stylist.',
      'Return ONLY strict JSON with keys: suggestion, items, summary.',
      'For follow-up questions or greetings, you may return empty suggestion and empty items while keeping summary conversational.',
      'items must be an array of 3 to 6 fashion item strings when you are recommending an outfit.',
      'Keep summary concise, natural, stylish, and include tasteful fashion emojis when appropriate.'
    ].join(' ');

    const serializedHistory = history
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const fullPrompt = [system, serializedHistory ? `History:\n${serializedHistory}` : '', `User: ${prompt}`]
      .filter(Boolean)
      .join('\n\n');

    const aiText = await askOllama(fullPrompt);
    const parsed = tryParseStructured(aiText) || fallbackOutfitResponse(prompt);
    return res.json(parsed);
  } catch (error) {
    return res.json(fallbackOutfitResponse(req.body?.prompt || '', error));
  }
});

// CLIP Python service URL
const CLIP_SERVICE = process.env.CLIP_SERVICE_URL || 'http://127.0.0.1:5001';

// Single-item endpoint (backwards compat)
app.post('/classify-wardrobe', async (req, res) => {
  const filename = String(req.body?.filename || 'item').toLowerCase();
  const imageData = String(req.body?.image || '');

  if (imageData) {
    try {
      // Use /detect for multi-item detection
      const detectRes = await fetch(`${CLIP_SERVICE}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
        signal: AbortSignal.timeout(20000),
      });
      if (detectRes.ok) {
        const data = await detectRes.json();
        if (data.items && data.items.length > 0) {
          console.log(`[YOLO] ${filename}: ${data.count} item(s) detected`);
          // Return first item for single-item compatibility
          return res.json(data.items[0]);
        }
      }
    } catch (e) {
      console.log(`[YOLO] Service unavailable: ${e.message}`);
    }
  }

  const category = inferCategory(filename);
  const color = inferColor(filename) || 'gray';
  res.json({ category, color, sub_category: null,
    tags: [String(category).toUpperCase(), color.toUpperCase()] });
});

// Multi-item detection endpoint — called by frontend for new uploads
app.post('/detect-wardrobe', async (req, res) => {
  const filename = String(req.body?.filename || 'item').toLowerCase();
  const imageData = String(req.body?.image || '');

  if (imageData) {
    try {
      const detectRes = await fetch(`${CLIP_SERVICE}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData }),
        signal: AbortSignal.timeout(20000),
      });
      if (detectRes.ok) {
        const data = await detectRes.json();
        if (data.items && data.items.length > 0) {
          console.log(`[YOLO] ${filename}: detected ${data.count} items:`,
            data.items.map(i => `${i.category}/${i.sub_category}`).join(', '));
          return res.json(data);
        }
      }
    } catch (e) {
      console.log(`[YOLO] Service unavailable: ${e.message}`);
    }
  }

  // Fallback: single item from filename
  const category = inferCategory(filename);
  const color = inferColor(filename) || 'gray';
  res.json({ items: [{ category, color, sub_category: null,
    tags: [String(category).toUpperCase(), color.toUpperCase()] }], count: 1 });
});

app.post('/extract-text', (req, res) => {
  const filename = String(req.body?.filename || 'invitation').replace(/\.[^.]+$/, '');
  const text = filename.replace(/[_-]+/g, ' ').trim();
  res.json({ text: text || 'Invitation details' });
});

app.post('/event-parse', (req, res) => {
  const text = String(req.body?.text || '');
  res.json({
    event_type: inferEventType(text),
    dress_code: inferDressCode(text),
    location: inferLocation(text),
  });
});

app.post('/event-outfit-ideas', async (req, res) => {
  const eventType = String(req.body?.eventType || 'Event');
  const dressCode = String(req.body?.dressCode || 'Smart Casual');

  try {
    const prompt = [
      'Return ONLY JSON: {"ideas": ["...", "...", "..."]}',
      `Event type: ${eventType}`,
      `Dress code: ${dressCode}`,
      `Wardrobe summary: ${String(req.body?.wardrobeSummary || '')}`,
      'Provide 3 concise outfit ideas.'
    ].join('\n');

    const aiText = await askOllama(prompt);
    const parsed = parseIdeas(aiText);
    if (parsed.length > 0) {
      return res.json({ ideas: parsed.slice(0, 6) });
    }
  } catch {
    // fall through to heuristic output
  }

  return res.json({
    ideas: [
      `${dressCode} ${eventType} look with clean layering`,
      `Smart ${eventType} outfit with balanced accessories`,
      `Comfort-first ${eventType} ensemble with elevated footwear`,
    ],
  });
});

// ── Outfit stylist explanation — replaces paid Anthropic API call ────────────
app.post('/outfit-explanation', async (req, res) => {
  const comboName    = String(req.body?.comboName    || '');
  const comboType    = String(req.body?.comboType    || '');
  const itemsList    = String(req.body?.itemsList    || '');
  const event        = String(req.body?.event        || 'Casual');
  const weather      = String(req.body?.weather      || 'Warm');

  try {
    const prompt = [
      'You are a concise fashion stylist. Reply ONLY with a JSON object: {"explanation": "..."}',
      'Write exactly 2 sentences explaining why this outfit works.',
      'Be specific about color harmony and occasion fit. Keep it under 60 words.',
      `Outfit: "${comboName}" | Type: ${comboType} | Event: ${event} | Weather: ${weather}`,
      `Items: ${itemsList}`,
    ].join('\n');

    const aiText = await askOllama(prompt);
    const data = tryParseJson(aiText);
    const explanation = String(data?.explanation || '').trim();

    if (explanation.length > 10) {
      return res.json({ explanation });
    }
  } catch {
    // fall through to heuristic fallback
  }

  // Heuristic fallback — no Ollama needed
  const fallback = buildFallbackExplanation(comboName, comboType, event, weather);
  return res.json({ explanation: fallback });
});

// ── Outfit ranking — re-score combos using Ollama for smarter sorting ────────
app.post('/outfit-rank', async (req, res) => {
  const combos   = Array.isArray(req.body?.combos)   ? req.body.combos   : [];
  const event    = String(req.body?.event    || 'Casual');
  const weather  = String(req.body?.weather  || 'Warm');
  const time     = String(req.body?.time     || 'Afternoon');

  if (combos.length === 0) return res.json({ ranked: [] });

  try {
    const comboList = combos.slice(0, 12).map((c, i) =>
      `${i}: "${c.name}" [${c.comboType}] score=${c.score} items=${(c.items||[]).map(it=>`${it.color} ${it.sub_category||it.category}`).join(', ')}`
    ).join('\n');

    const prompt = [
      'You are a fashion AI. Reply ONLY with JSON: {"order": [0,1,2,...], "names": ["name0","name1",...]}',
      `Re-rank these outfit combos best-first for: Event=${event}, Weather=${weather}, Time=${time}.`,
      'Also suggest a better creative name for each (max 4 words, fashion-forward, specific to colors/occasion).',
      'Output must have same count as input.',
      comboList,
    ].join('\n');

    const aiText = await askOllama(prompt);
    const data = tryParseJson(aiText);

    if (
      data &&
      Array.isArray(data.order) &&
      data.order.length === combos.length &&
      Array.isArray(data.names) &&
      data.names.length === combos.length
    ) {
      const ranked = data.order.map((origIdx, newPos) => ({
        ...combos[origIdx],
        name: String(data.names[origIdx] || combos[origIdx].name),
        aiRank: newPos,
      }));
      return res.json({ ranked });
    }
  } catch {
    // fall through
  }

  return res.json({ ranked: combos });
});

// ── Heuristic explanation builder (zero AI, instant fallback) ────────────────
function buildFallbackExplanation(name, comboType, event, weather) {
  const eventPhrases = {
    Office:    'polished and work-appropriate',
    Party:     'eye-catching and festive',
    Gym:       'functional and performance-ready',
    Date:      'charming and effortlessly stylish',
    Wedding:   'elegant and occasion-appropriate',
    College:   'relaxed yet put-together',
    Interview: 'sharp, confident, and professional',
    Festival:  'bold and expressive',
    Travel:    'comfortable and versatile',
    Casual:    'relaxed and easy to wear',
  };
  const weatherPhrases = {
    Hot:   'lightweight pieces keep you cool',
    Warm:  'the breathable layers suit the warm day',
    Cool:  'the layering adds warmth without bulk',
    Cold:  'the insulated combination keeps you cosy',
    Rainy: 'the weather-smart choices handle the rain',
  };
  const typeNote = comboType.includes('Accessory')
    ? 'The accessory ties the whole look together.'
    : comboType.includes('Outerwear')
    ? 'The outerwear layer elevates the outfit.'
    : '';

  return `This ${name} is ${eventPhrases[event] || 'stylish and well-balanced'} — ${weatherPhrases[weather] || 'perfectly suited to the conditions'}. ${typeNote}`.trim();
}

app.post('/hairstyle-suggestions', (req, res) => {
  const faceShape = String(req.body?.faceShape || 'oval').toLowerCase();
  const skinTone = String(req.body?.skinTone || 'medium');

  const base = faceShape.includes('round')
    ? ['Textured Pompadour', 'High Fade Quiff', 'Long Layered Fringe']
    : faceShape.includes('square')
      ? ['Modern Side Part', 'Soft Crop', 'Tapered Waves']
      : ['Textured Crop', 'Sleek Undercut', 'Modern Quiff'];

  res.json({ styles: [...base, `${skinTone} tone friendly natural volume cut`] });
});

app.post('/local-events', (req, res) => {
  const city = String(req.body?.city || 'Your City');
  const date = new Date().toISOString().split('T')[0];
  res.json({
    events: [
      `${city} Street Style Meetup | ${date}`,
      `${city} Fashion Pop-Up | ${date}`,
      `${city} Weekend Culture Fest | ${date}`,
    ],
  });
});

app.listen(port, () => {
  console.log(`Trendly local AI server running at http://localhost:${port}`);
  console.log(`Using Ollama model: ${OLLAMA_MODEL}`);
});

async function askOllama(prompt) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.5,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama failed: ${response.status}`);
  }

  const payload = await response.json();
  return String(payload.response || '').trim();
}

function tryParseStructured(text) {
  const data = tryParseJson(text);
  if (!data) return null;

  const suggestion = String(data.suggestion || '').trim();
  const summary = String(data.summary || '').trim();
  const items = Array.isArray(data.items)
    ? data.items.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (!suggestion || !summary || items.length === 0) {
    return null;
  }

  return { suggestion, summary, items: items.slice(0, 6) };
}

function parseIdeas(text) {
  const data = tryParseJson(text);
  if (!data || !Array.isArray(data.ideas)) return [];
  return data.ideas.map((idea) => String(idea).trim()).filter(Boolean);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function fallbackOutfitResponse(prompt, error) {
  const p = String(prompt || '').toLowerCase();
  const eventType = detectEventType(p);
  const stylePreference = detectStylePreference(p);

  if (isGreetingPrompt(p)) {
    return {
      suggestion: '',
      items: [],
      summary: 'Tell me the occasion or vibe first ✨ wedding, office, party, date night, festive, casual and I will style you properly.',
    };
  }

  if (eventType === 'wedding') {
    return {
      suggestion: stylePreference === 'western' ? 'Regal wedding guest look with a structured bandhgala twist' : 'Elegant festive wedding look',
      items: stylePreference === 'western'
        ? ['black bandhgala jacket', 'tailored tapered trousers', 'polished loafers', 'statement watch']
        : ['deep maroon kurta', 'tailored churidar trousers', 'embroidered juttis', 'cream stole'],
      summary: 'Perfect for a marriage function ✨ polished, festive, and camera-ready without feeling overdone.',
    };
  }

  if (eventType === 'office') {
    return {
      suggestion: 'Clean smart-formal office look',
      items: ['light blue shirt', 'charcoal trousers', 'black derby shoes', 'classic watch'],
      summary: 'Sharp and professional 💼 this keeps you polished, confident, and easy to wear all day.',
    };
  }

  if (eventType === 'party' || eventType === 'date') {
    return {
      suggestion: 'Vibrant festive ethnic look',
      items: ['mustard kurta', 'straight white trousers', 'tan sandals', 'textured stole'],
      summary: 'Festive and elegant ✨ enough color to stand out, but still refined and wearable.',
    };
  }

  return {
    suggestion: 'Minimalist smart-casual look',
    items: ['structured overshirt', 'slim trousers', 'clean sneakers'],
    summary: error
      ? 'Here is a quick stylish fallback look ✨ clean, modern, and easy to build right now.'
      : 'Here is a stylish everyday look ✨ clean lines, balanced layers, and easy confidence.',
  };
}

function isGreetingPrompt(prompt) {
  return /^(hi|hello|hey|heyy|yo|namaste)\b/i.test(String(prompt).trim());
}

function needsEventOnly(prompt) {
  return detectEventType(String(prompt)) === null;
}

function needsEventBeforeSuggestion(prompt, history) {
  const text = `${history.map((entry) => entry.content).join(' ')} ${String(prompt)}`.toLowerCase();
  return isGreetingPrompt(prompt) || detectEventType(text) === null;
}

function detectEventType(text) {
  const value = String(text).toLowerCase();
  if (/(wedding|wedding|weddng|marriage|marrage|mariage|reception|engagement|shaadi)/i.test(value)) return 'wedding';
  if (/(office|work|meeting|corporate|conference|interview|formal)/i.test(value)) return 'office';
  if (/(party|birthday|club|celebration)/i.test(value)) return 'party';
  if (/(date|dinner|night out|nightout)/i.test(value)) return 'date';
  if (/(festival|festive|ethnic|traditional|pooja|puja|diwali|eid|holi)/i.test(value)) return 'festival';
  if (/(college|outing|casual|weekend|friends)/i.test(value)) return 'casual';
  return null;
}

function detectStylePreference(text) {
  const value = String(text).toLowerCase();
  if (/(western|streetwear|modern)/i.test(value)) return 'western';
  if (/(ethnic|traditional|kurta)/i.test(value)) return 'ethnic';
  if (/(formal|tailored|smart)/i.test(value)) return 'formal';
  return 'balanced';
}

function inferCategory(name) {
  if (/shoe|sneaker|boot|heel|loafer/.test(name)) return 'Shoes';
  if (/dress|gown|saree/.test(name)) return 'Dresses';
  if (/jean|pant|trouser|short|skirt/.test(name)) return 'Bottoms';
  if (/jacket|coat|blazer|hoodie/.test(name)) return 'Outerwear';
  if (/watch|belt|bag|cap|hat|scarf/.test(name)) return 'Accessories';
  return 'Tops';
}

function inferColor(name) {
  const colors = ['black', 'white', 'gray', 'blue', 'red', 'green', 'yellow', 'brown', 'beige', 'pink', 'orange', 'purple', 'navy', 'cream'];
  return colors.find((c) => name.includes(c)) || null;
}

function inferEventType(text) {
  const event = detectEventType(text);
  if (event === 'wedding') return 'Wedding Event';
  if (event === 'party' || event === 'date') return 'Party Event';
  if (event === 'office') return 'Office Event';
  if (event === 'festival') return 'Festival Event';
  return 'General Event';
}

function inferDressCode(text) {
  if (/formal|black tie/i.test(text)) return 'Formal';
  if (/ethnic|traditional/i.test(text)) return 'Ethnic';
  if (/casual|relaxed/i.test(text)) return 'Casual';
  return 'Smart Casual';
}

function inferLocation(text) {
  const match = String(text).match(/\b(?:at|in)\s+([A-Za-z\s]{3,40})/i);
  return match?.[1]?.trim() || '';
}

function toMessage(error) {
  if (error instanceof Error) return error.message;
  return 'Unknown local AI server error';
}
