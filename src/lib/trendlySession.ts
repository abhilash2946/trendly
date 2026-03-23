import type { ARMirrorSelection, AssistantRecommendation } from '../types';

const ASSISTANT_KEY = 'trendly:assistant-recommendation';
const AR_MIRROR_KEY = 'trendly:ar-selection';

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAssistantRecommendation() {
  return readJson<AssistantRecommendation>(ASSISTANT_KEY);
}

export function setAssistantRecommendation(recommendation: AssistantRecommendation) {
  writeJson(ASSISTANT_KEY, recommendation);
}

export function getARMirrorSelection() {
  return readJson<ARMirrorSelection>(AR_MIRROR_KEY);
}

export function setARMirrorSelection(selection: ARMirrorSelection) {
  writeJson(AR_MIRROR_KEY, selection);
}