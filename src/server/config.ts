export interface ModelCapability {
  id: string;
  name: string;
  description: string;
  supportsDuration: boolean;
  minDuration: number;
  maxDuration: number;
  supportsVocalGender: boolean;
  supportsNegativeTags: boolean;
  maxPromptLength: number;
  maxStyleLength: number;
  defaultCreditCost: number;
  enabled: boolean;
}

export const MODEL_REGISTRY: Record<string, ModelCapability> = {
  V6: {
    id: 'V6',
    name: 'Suno V6 (Latest Flagship)',
    description: 'Ultra-high-fidelity generation with nuanced vocals, multi-instrumental depth, and full dynamics.',
    supportsDuration: true,
    minDuration: 10,
    maxDuration: 360,
    supportsVocalGender: true,
    supportsNegativeTags: true,
    maxPromptLength: 4000,
    maxStyleLength: 500,
    defaultCreditCost: 10,
    enabled: true
  },
  V6_MINI: {
    id: 'V6_MINI',
    name: 'Suno V6 Mini',
    description: 'Fast, lower-latency generation with tight song structure.',
    supportsDuration: true,
    minDuration: 10,
    maxDuration: 240,
    supportsVocalGender: true,
    supportsNegativeTags: true,
    maxPromptLength: 3000,
    maxStyleLength: 400,
    defaultCreditCost: 8,
    enabled: true
  },
  V6_WILD: {
    id: 'V6_WILD',
    name: 'Suno V6 Wild',
    description: 'Experimental sonic textures, dynamic transitions, and expressive harmonies.',
    supportsDuration: true,
    minDuration: 10,
    maxDuration: 360,
    supportsVocalGender: true,
    supportsNegativeTags: true,
    maxPromptLength: 4000,
    maxStyleLength: 500,
    defaultCreditCost: 10,
    enabled: true
  },
  V5_5: {
    id: 'V5_5',
    name: 'Suno V5.5',
    description: 'Polished audio clarity, strong verse-chorus adherence, and clean mixdown.',
    supportsDuration: false,
    minDuration: 0,
    maxDuration: 0,
    supportsVocalGender: true,
    supportsNegativeTags: true,
    maxPromptLength: 3000,
    maxStyleLength: 300,
    defaultCreditCost: 8,
    enabled: true
  },
  V5: {
    id: 'V5',
    name: 'Suno V5',
    description: 'Balanced audio generation with rich harmonies and reliable genre styling.',
    supportsDuration: false,
    minDuration: 0,
    maxDuration: 0,
    supportsVocalGender: true,
    supportsNegativeTags: false,
    maxPromptLength: 2500,
    maxStyleLength: 250,
    defaultCreditCost: 8,
    enabled: true
  },
  V4_5: {
    id: 'V4_5',
    name: 'Suno V4.5',
    description: 'Vintage Suno warm vocal mix and acoustic fidelity.',
    supportsDuration: false,
    minDuration: 0,
    maxDuration: 0,
    supportsVocalGender: false,
    supportsNegativeTags: false,
    maxPromptLength: 2000,
    maxStyleLength: 200,
    defaultCreditCost: 6,
    enabled: true
  },
  V4: {
    id: 'V4',
    name: 'Suno V4 (Legacy)',
    description: 'Classic Suno architecture for legacy compatibility.',
    supportsDuration: false,
    minDuration: 0,
    maxDuration: 0,
    supportsVocalGender: false,
    supportsNegativeTags: false,
    maxPromptLength: 1500,
    maxStyleLength: 150,
    defaultCreditCost: 5,
    enabled: false
  }
};

export function getPublicAppUrl(): string {
  // Automatic detection of Vercel production URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const url = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    return url.replace(/\/+$/, '');
  }
  // Default development fallback
  return 'http://localhost:3000';
}
