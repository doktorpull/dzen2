import { XMLParser } from 'fast-xml-parser';
import { db, getSettings } from './db.ts';
import { generateText } from './providers.ts';
import type { Niche, Topic } from './types.ts';

interface RssTrendItem {
  title: string;
  link: string;
  pubDate: string;
}

async function fetchRssFeed(url: string): Promise<RssTrendItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DzenStudioBot/1.0)',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml) as {
      rss?: { channel?: { item?: unknown } };
    };
    const rawItems = parsed?.rss?.channel?.item;
    const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    return list.slice(0, 15).map((item: Record<string, unknown>) => ({
      title: String(item.title || '').trim(),
      link: String(item.link || '').trim(),
      pubDate: String(item.pubDate || '').trim(),
    })).filter((x) => x.title.length > 0);
  } catch {
    return [];
  }
}

function extractJsonArray(raw: string): Array<Record<string, unknown>> {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  try {
    const obj = JSON.parse(cleaned) as { topics?: Array<Record<string, unknown>> };
    if (Array.isArray(obj?.topics)) return obj.topics;
  } catch {
    // ignore
  }
  return [];
}

export async function discoverAndScoreTopics(nicheId: number, customFocus = ''): Promise<Topic[]> {
  const niche = db.prepare('SELECT * FROM niches WHERE id = ?').get(nicheId) as Niche | undefined;
  if (!niche) {
    throw new Error('Ниша не найдена.');
  }

  const settings = getSettings();

  // 1. Live RSS streams: Google Trends RU + Google News RU по теме ниши
  const query = encodeURIComponent(`${niche.name} ${customFocus}`.trim());
  const [googleTrends, newsFeed] = await Promise.all([
    fetchRssFeed('https://trends.google.com/trending/rss?geo=RU'),
    fetchRssFeed(`https://news.google.com/rss/search?q=${query}&hl=ru&gl=RU&ceid=RU:ru`),
  ]);

  const rawSignals = [
    ...newsFeed.slice(0, 8).map((i) => `[Новости] ${i.title} (${i.link})`),
    ...googleTrends.slice(0, 8).map((i) => `[Google Trends RU] ${i.title}`),
  ];

  const useGoogleSearch = settings.text_provider === 'gemini';

  const systemInstruction = `Ты — аналитик трендов Дзена (Модуль 1). Твоя задача: отобрать и сформулировать 6 сильных, не кликбейтных тем с высоким потенциалом дочитывания и нативного встраивания CPA-оффера.
Отвечай строго JSON-массивом объектов без пояснений вокруг.`;

  const prompt = `Ниша: "${niche.name}"
Контекст монетизации и CPA: ${niche.cpa_notes || 'партнёрские рекомендации'}
Тон ниши: ${niche.default_tone}
${customFocus ? `Дополнительный фокус от редактора: ${customFocus}` : ''}

Свежие сигналы из открытых лент за последние часы:
${rawSignals.length > 0 ? rawSignals.join('\n') : 'Ленты недоступны — используй актуальный поиск инфоповодов.'}

Сформируй ровно 6 тем для статей в Дзен. Каждая тема должна цеплять в первых 3 абзацах и позволять показать конкретику/цифры/кейс.
Верни JSON-массив объектов со следующими полями:
[
  {
    "title": "Заголовок статьи (без кликбейта, до 90 символов)",
    "angle": "Угол подачи и чем зацепить в первых 3 абзацах",
    "source_url": "Ссылка на инфоповод если есть, иначе пустая строка",
    "demand_score": 82,
    "competition_score": 45,
    "niche_fit_score": 90,
    "cpa_score": 78
  }
]
Где competition_score — уровень конкуренции (чем ниже, тем лучше, но приоритет рассчитывается с учётом свободы ниши).`;

  const result = await generateText(settings, {
    systemInstruction,
    prompt,
    jsonMode: !useGoogleSearch,
    useSearchGrounding: useGoogleSearch,
  });

  const parsed = extractJsonArray(result.text);
  if (parsed.length === 0) {
    throw new Error('ИИ не вернул корректный список тем. Проверьте настройки провайдера и повторите.');
  }

  const threshold = settings.topic_auto_approve_threshold || 78;
  const insertStmt = db.prepare(`
    INSERT INTO topics (niche_id, title, angle, source, source_url, demand_score, competition_score, niche_fit_score, cpa_score, priority_score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertedIds: number[] = [];
  const tx = db.transaction(() => {
    for (const item of parsed.slice(0, 6)) {
      const demand = Math.max(10, Math.min(100, Number(item.demand_score) || 75));
      const competition = Math.max(10, Math.min(100, Number(item.competition_score) || 50));
      const nicheFit = Math.max(10, Math.min(100, Number(item.niche_fit_score) || 85));
      const cpa = Math.max(10, Math.min(100, Number(item.cpa_score) || 70));
      const priority = Math.round(demand * 0.35 + (100 - competition) * 0.2 + nicheFit * 0.25 + cpa * 0.2);
      const status = priority >= threshold ? 'approved' : 'new';
      const source = useGoogleSearch ? 'ai_search' : 'trend_rss';
      const sourceUrl = String(item.source_url || result.groundingUrls[0]?.uri || '');

      const info = insertStmt.run(
        nicheId,
        String(item.title || 'Без названия').slice(0, 140),
        String(item.angle || ''),
        source,
        sourceUrl,
        demand,
        competition,
        nicheFit,
        cpa,
        priority,
        status,
      );
      insertedIds.push(Number(info.lastInsertRowid));
    }
  });
  tx();

  const placeholders = insertedIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT t.*, n.name as niche_name FROM topics t JOIN niches n ON n.id = t.niche_id WHERE t.id IN (${placeholders}) ORDER BY t.priority_score DESC`,
    )
    .all(...insertedIds) as Topic[];
}
