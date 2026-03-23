import { askTrendlyAI } from '../lib/localAI';

export const analyzeStyle = async (preferences: string[]) => {
  const fallback = {
    primaryStyle: preferences[0] || 'Minimal',
    confidence: 0.8,
    colorPalette: ['#111827', '#334155', '#e2e8f0'],
    recommendations: [
      'Use one statement layer and keep the base neutral.',
      'Match footwear tone with your outerwear for a cohesive look.',
      'Balance fitted and relaxed silhouettes in the same outfit.',
    ],
  };

  try {
    const prompt = [
      'Analyze fashion style preferences and return concise advice.',
      `Preferences: ${preferences.join(', ')}`,
      'Respond with 3 recommendations.',
    ].join('\n');

    const response = await askTrendlyAI(prompt);
    const recommendations = response.items?.length
      ? response.items
      : response.summary
          .split(/[.;\n]/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 3);

    return {
      ...fallback,
      recommendations: recommendations.length > 0 ? recommendations : fallback.recommendations,
    };
  } catch {
    return fallback;
  }
};
