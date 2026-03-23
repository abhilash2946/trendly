export interface ChatGatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ImageGenerationOptions {
  prompt: string;
  imageDataUrl?: string;
  mimeType?: string;
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_CHAT_MODEL as string | undefined;
const IMAGE_API_URL = import.meta.env.VITE_IMAGE_API_URL as string | undefined;
const IMAGE_API_KEY = import.meta.env.VITE_IMAGE_API_KEY as string | undefined;

export const hasOpenAIChat = () => Boolean(OPENAI_API_KEY);
export const hasImageApi = () => Boolean(IMAGE_API_URL);

export async function requestChatCompletion(
  messages: ChatGatewayMessage[],
  options: ChatCompletionOptions = {}
) {
  if (!OPENAI_API_KEY) {
    throw new Error('Missing VITE_OPENAI_API_KEY');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 300,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI chat failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  return String(payload.choices?.[0]?.message?.content || '').trim();
}

export async function requestGeneratedImage(options: ImageGenerationOptions) {
  if (!IMAGE_API_URL) {
    throw new Error('Missing VITE_IMAGE_API_URL');
  }

  const response = await fetch(IMAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(IMAGE_API_KEY ? { Authorization: `Bearer ${IMAGE_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      prompt: options.prompt,
      image: options.imageDataUrl,
      mimeType: options.mimeType,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image API failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const image = payload.imageUrl || payload.image_url || payload.dataUrl || payload.b64_json;

  if (!image) {
    throw new Error('Image API did not return an image');
  }

  if (String(image).startsWith('data:')) {
    return String(image);
  }

  if (/^https?:\/\//.test(String(image))) {
    return String(image);
  }

  return `data:image/png;base64,${String(image)}`;
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBlob(dataUrl: string) {
  const [header, body] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/png';
  const bytes = atob(body || '');
  const buffer = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }

  return new Blob([buffer], { type: mime });
}