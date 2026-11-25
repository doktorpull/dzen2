import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_IMAGES_DIR, getSettings } from './db.ts';
import { generateImageBytes, generateText } from './providers.ts';
import type { ArticleImage } from './types.ts';

interface PlannedVisual {
  role: 'cover' | 'inline_1' | 'inline_2';
  aspectRatio: '16:9' | '4:3';
  prompt: string;
  caption: string;
  authenticity_note: string;
}

export async function generateArticleVisuals(
  articleId: number,
  title: string,
  nicheName: string,
  articleMarkdown: string,
  opts: { skipLlmPrompting?: boolean } = {},
): Promise<{ images: ArticleImage[]; warnings: string[]; tokensUsed: number }> {
  const settings = getSettings();
  const warnings: string[] = [];
  let tokensUsed = 0;

  if (settings.image_provider === 'disabled') {
    return {
      images: [],
      warnings: ['Генерация изображений отключена в настройках.'],
      tokensUsed: 0,
    };
  }

  const openingLine = articleMarkdown
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);

  let planned: PlannedVisual[] = [
    {
      role: 'cover',
      aspectRatio: '16:9',
      prompt: `Documentary editorial photograph representing "${title}" in niche "${nicheName}"${openingLine ? `, context: "${openingLine}"` : ''}, natural window lighting, candid real-life atmosphere, 35mm lens film grain, unposed authentic composition, no text, no watermarks`,
      caption: `Иллюстрация к теме: ${title}`,
      authenticity_note: 'Документальная съёмка 35mm, без студийного глянца и стоковых поз',
    },
    {
      role: 'inline_1',
      aspectRatio: '4:3',
      prompt: `Everyday real-life detail photograph supporting an article about "${title}" (${nicheName}), lived-in environment, natural daylight, shallow depth of field, authentic documentary style, no text`,
      caption: 'Детали из повседневной практики',
      authenticity_note: 'Реалистичная живая сцена без 3D-пластика',
    },
  ];

  if (!opts.skipLlmPrompting) {
    try {
      const promptRes = await generateText(settings, {
        systemInstruction:
          'Ты — арт-директор редакции Дзена. Создай промпты для генерации обложки (16:9) и 1–2 внутренних фото (4:3) в стиле документальной редакционной фотографии ("не сток"). Запрещены пластиковые 3D-лица, неон, стоковые улыбки в костюмах и текст на картинке. Верни строго JSON-массив из 2–3 объектов.',
        prompt: `Заголовок статьи: "${title}"
Ниша: "${nicheName}"
Фрагмент текста:
${articleMarkdown.slice(0, 1200)}

Верни JSON массив:
[
  {
    "role": "cover",
    "aspectRatio": "16:9",
    "prompt": "Detailed English prompt for realistic documentary photo, Leica 35mm, natural light, no text",
    "caption": "Короткая подпись к фото на русском для статьи в Дзене",
    "authenticity_note": "Почему фото выглядит не как сток (на русском)"
  },
  {
    "role": "inline_1",
    "aspectRatio": "4:3",
    "prompt": "...",
    "caption": "...",
    "authenticity_note": "..."
  }
]`,
        jsonMode: true,
        useFastModel: true,
      });
      tokensUsed += promptRes.tokensUsed || 0;

      const cleaned = promptRes.text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start !== -1 && end > start) {
        const arr = JSON.parse(cleaned.slice(start, end + 1)) as Array<Record<string, unknown>>;
        if (Array.isArray(arr) && arr.length >= 2) {
          planned = arr.slice(0, 3).map((item, idx) => ({
            role: idx === 0 ? 'cover' : idx === 1 ? 'inline_1' : 'inline_2',
            aspectRatio: idx === 0 ? '16:9' : '4:3',
            prompt: String(item.prompt || planned[0].prompt),
            caption: String(item.caption || 'Иллюстрация к материалу'),
            authenticity_note: String(item.authenticity_note || 'Естественный свет, без стоковых клише'),
          }));
        }
      }
    } catch {
      // Fallback to default documentary prompts above
    }
  }

  const results: ArticleImage[] = [];
  for (const item of planned) {
    try {
      const { buffer, mimeType } = await generateImageBytes(settings, item.prompt, item.aspectRatio);
      const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
      const filename = `article_${articleId}_${item.role}_${Date.now()}.${ext}`;
      const fullPath = path.join(UPLOADS_IMAGES_DIR, filename);
      fs.writeFileSync(fullPath, buffer);
      results.push({
        role: item.role,
        url: `./uploads/images/${filename}`,
        filename,
        prompt: item.prompt,
        caption: item.caption,
        authenticity_note: item.authenticity_note,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Изображение (${item.role}): ${message}`);
      const lower = message.toLowerCase();
      if (lower.includes('429') || lower.includes('квота') || lower.includes('лимит') || lower.includes('401') || lower.includes('403')) {
        break;
      }
    }
  }

  return { images: results, warnings, tokensUsed };
}
