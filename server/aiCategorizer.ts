import { GoogleGenAI, Type } from '@google/genai';
import { cleanBrandPrefix, extractModelCode } from './matcher.ts';

// Server-side Gemini client with aistudio-build telemetry header
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface AICategorizationResult {
  normalizedTitle: string;
  category: string;
  description: string;
  features: string[];
  tags: string[];
  isAiGenerated: boolean;
}

// Deterministic fallback rule-based normalizer in case API key is not configured or network error occurs
export function fallbackNormalizeAndCategorize(rawTitle: string): AICategorizationResult {
  // 1. Remove brand names and model numbers
  let cleaned = cleanBrandPrefix(rawTitle);
  cleaned = cleaned.replace(/\b(JKB|JK)[-\s]?\d+\b/gi, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[-–—:|,\s]+|[-–—:|,\s]+$/g, '');

  // Capitalize properly
  const words = cleaned.split(' ').map(w => {
    if (w.length <= 2 && !['DIY', '3D', 'XL'].includes(w.toUpperCase())) return w.toLowerCase();
    if (['DIY', '3D', 'XL', 'LED'].includes(w.toUpperCase())) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
  const normalizedTitle = words.join(' ') || 'Silicone Craft Mold';

  // Determine category by keywords
  const lower = rawTitle.toLowerCase();
  let category = 'Silicone & Baking Molds';
  if (lower.includes('resin') || lower.includes('concrete') || lower.includes('cement') || lower.includes('coaster')) {
    category = 'Resin & Concrete Craft';
  } else if (lower.includes('christmas') || lower.includes('santa') || lower.includes('elk') || lower.includes('tree') || lower.includes('halloween')) {
    category = 'Festive & Holiday Molds';
  } else if (lower.includes('candle') || lower.includes('wax') || lower.includes('aroma') || lower.includes('soap')) {
    category = 'Candle & Soap Making';
  } else if (lower.includes('fondant') || lower.includes('cake') || lower.includes('chocolate') || lower.includes('cupcake')) {
    category = 'Cake & Chocolate Decorating';
  } else if (lower.includes('tray') || lower.includes('plate') || lower.includes('dish') || lower.includes('box')) {
    category = 'Storage & Trays';
  }

  return {
    normalizedTitle,
    category,
    description: `Premium food-grade silicone mold designed for baking, DIY crafting, resin art, and creative confectionery projects. Easy release and heat-resistant.`,
    features: [
      'High-grade flexible silicone material',
      'Heat resistant from -40°C to 230°C',
      'Non-stick and effortless release',
    ],
    tags: ['silicone mold', 'diy craft', 'baking tool', 'reusable', 'food grade'],
    isAiGenerated: false,
  };
}

export async function aiNormalizeAndCategorize(
  rawTitle: string,
  rawPrice: number
): Promise<AICategorizationResult> {
  if (!aiClient) {
    return fallbackNormalizeAndCategorize(rawTitle);
  }

  const extractedModel = extractModelCode(rawTitle);

  try {
    const prompt = `You are an expert e-commerce catalog optimizer.
A product was scraped from a supplier website with the following details:
- Raw Supplier Title: "${rawTitle}"
- Supplier Price: ₹${rawPrice}
- Extracted Model Code: ${extractedModel || 'None'}

Your instructions:
1. Normalize the product title by STRICTLY removing brand names (such as "Vedini", "Jindeal", "By Vedini", "By Jindeal") and model codes (such as "JKB-3669", "JK-12", etc.).
2. Make the title clean, professional, concise, and customer-ready for an upscale e-commerce storefront (e.g. "Christmas Stocking & Bow Chocolate Silicone Mold").
3. Assign a specific, accurate store category (choose from: "Silicone & Baking Molds", "Resin & Concrete Craft", "Festive & Holiday Molds", "Candle & Soap Making", "Cake & Chocolate Decorating", "Storage & Trays", "Kitchen & Dining Tools").
4. Provide a 2-sentence enticing product description.
5. Provide 3 high-value product features.
6. Provide 4 relevant search tags.`;

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );

    const generatePromise = aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            normalizedTitle: {
              type: Type.STRING,
              description: 'Customer-ready title with brands and model codes removed',
            },
            category: {
              type: Type.STRING,
              description: 'Primary e-commerce category',
            },
            description: {
              type: Type.STRING,
              description: 'Engaging 2-sentence product description',
            },
            features: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 product features',
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '4 search tags',
            },
          },
          required: ['normalizedTitle', 'category', 'description', 'features', 'tags'],
        },
      },
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);

    if (response && 'text' in response && response.text) {
      const parsed = JSON.parse(response.text);
      return {
        normalizedTitle: parsed.normalizedTitle || fallbackNormalizeAndCategorize(rawTitle).normalizedTitle,
        category: parsed.category || 'Silicone & Baking Molds',
        description: parsed.description || 'Premium craft silicone mold.',
        features: Array.isArray(parsed.features) ? parsed.features : ['Durable silicone', 'Easy release'],
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['silicone mold', 'craft'],
        isAiGenerated: true,
      };
    }
  } catch (err) {
    console.warn('[Gemini AI] Categorization fallback triggered:', err);
  }

  return fallbackNormalizeAndCategorize(rawTitle);
}
