import { EventEmitter } from 'node:events';
import { db, getSettings } from './db.ts';
import { generateEmbedding, generateText } from './providers.ts';
import type {
  Article,
  CpaOffer,
  FactcheckFlag,
  Niche,
  PipelineMode,
  PipelineStageState,
  RagSample,
} from './types.ts';
import type { TextGenerationResult } from './providers.ts';
import {
  BANNED_CLICHES,
  autoCleanArticleText,
  markdownToCleanHtml,
  runFinalValidator,
} from './validator.ts';
import { generateArticleVisuals } from './visuals.ts';

export const pipelineEmitter = new EventEmitter();
pipelineEmitter.setMaxListeners(100);

const INITIAL_STAGES: PipelineStageState[] = [
  { stage: 1, key: 'strategist', name: 'Стратег (бриф и крючок)', status: 'pending' },
  { stage: 2, key: 'seo', name: 'SEO-оптимизатор (ядро и метаданные)', status: 'pending' },
  { stage: 3, key: 'architect', name: 'Архитектор (план статьи)', status: 'pending' },
  { stage: 4, key: 'writer', name: 'Писатель (черновик ≥3000 зн.)', status: 'pending' },
  { stage: 5, key: 'stylist', name: 'Детектор + Стилист + Инжектор', status: 'pending' },
  { stage: 6, key: 'factchecker', name: 'Фактчекер (верификация и флаги)', status: 'pending' },
  { stage: 7, key: 'editor', name: 'Редактор + Визуал + 10-пт Валидатор', status: 'pending' },
];

function parseJsonSafe<T>(raw: string, fallback: T): T {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const startObj = cleaned.indexOf('{');
    const endObj = cleaned.lastIndexOf('}');
    if (startObj !== -1 && endObj > startObj) {
      try {
        return JSON.parse(cleaned.slice(startObj, endObj + 1)) as T;
      } catch {
        // ignore
      }
    }
    const startArr = cleaned.indexOf('[');
    const endArr = cleaned.lastIndexOf(']');
    if (startArr !== -1 && endArr > startArr) {
      try {
        return JSON.parse(cleaned.slice(startArr, endArr + 1)) as T;
      } catch {
        // ignore
      }
    }
    return fallback;
  }
}

function buildCompactRagBlock(ragSamples: RagSample[], maxSampleChars = 550): string {
  if (ragSamples.length === 0) {
    return 'Эталонных образцов для ниши пока нет — опирайся на живой авторский разговорный стиль.';
  }
  const primary = ragSamples[0];
  const parts: string[] = [
    `Эталон ритма («${primary.title}», НЕ копируй факты/фразы):\n${primary.content.slice(0, maxSampleChars)}`,
  ];
  for (const extra of ragSamples.slice(1, 3)) {
    const summary = extra.style_summary?.trim() || `ср. длина фразы ${extra.avg_sentence_len} сл.`;
    parts.push(`Доп. стиль («${extra.title}»): ${summary.slice(0, 180)}`);
  }
  return parts.join('\n');
}

function splitStylistAndFactcheck(raw: string): { articleText: string; factFlags: FactcheckFlag[] } {
  const match = raw.match(/={2,}\s*FACTCHECK_JSON\s*={2,}/i);
  if (!match || match.index === undefined) {
    return {
      articleText: raw.replace(/={2,}\s*FACTCHECK[\s\S]*$/i, '').trim(),
      factFlags: [],
    };
  }
  const before = raw.slice(0, match.index).replace(/\n---\s*$/, '').trim();
  const after = raw.slice(match.index + match[0].length).trim();
  const parsed = parseJsonSafe<FactcheckFlag[]>(after, []);
  return {
    articleText: before,
    factFlags: Array.isArray(parsed) ? parsed : [],
  };
}

function normalizeArchitectPlan(rawPlan: unknown, title: string): string {
  if (typeof rawPlan === 'string' && rawPlan.trim()) {
    return rawPlan.trim();
  }
  if (Array.isArray(rawPlan) && rawPlan.length > 0) {
    return rawPlan
      .map((item, idx) => (typeof item === 'string' ? item : `${idx + 1}. ${JSON.stringify(item)}`))
      .join('\n');
  }
  if (rawPlan && typeof rawPlan === 'object') {
    return JSON.stringify(rawPlan, null, 2);
  }
  return `1. Вводный крючок по теме «${title}»\n2. Разбор цифр и личного опыта\n3. Практические шаги и вывод`;
}

function updateStage(
  articleId: number,
  stages: PipelineStageState[],
  stageIndex: number,
  patch: Partial<PipelineStageState>,
) {
  stages[stageIndex] = { ...stages[stageIndex], ...patch };
  db.prepare(`UPDATE articles SET current_stage = ?, stages_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
    stages[stageIndex].stage,
    JSON.stringify(stages),
    articleId,
  );
  pipelineEmitter.emit(`article:${articleId}`, {
    type: 'stage',
    articleId,
    current_stage: stages[stageIndex].stage,
    stages,
  });
}

async function evaluateAndSave(articleId: number, markdown: string, nicheId: number, skipEmbedding = false) {
  const cleanedMd = autoCleanArticleText(markdown);
  const cleanHtml = markdownToCleanHtml(cleanedMd);
  const ragSamples = db
    .prepare('SELECT * FROM rag_samples WHERE niche_id = ? ORDER BY id DESC LIMIT 10')
    .all(nicheId) as RagSample[];
  const embedding = !skipEmbedding && ragSamples.length > 0 ? await generateEmbedding(cleanedMd) : null;
  const report = runFinalValidator(cleanedMd, cleanHtml, ragSamples, embedding);

  const nextStatus = report.overall_status === 'ready' ? 'ready' : 'needs_review';
  db.prepare(`
    UPDATE articles
    SET final_markdown = ?, final_html = ?, validator_json = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(cleanedMd, cleanHtml, JSON.stringify(report), nextStatus, articleId);

  return { cleanedMd, cleanHtml, report, nextStatus };
}

async function pauseIfGemini(providerUsed: string) {
  if (providerUsed.startsWith('gemini:')) {
    await new Promise((r) => setTimeout(r, 650));
  }
}

export async function runArticlePipeline(
  articleId: number,
  opts: { resume?: boolean } = {},
): Promise<void> {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article | undefined;
  if (!article) return;

  const niche = db.prepare('SELECT * FROM niches WHERE id = ?').get(article.niche_id) as Niche | undefined;
  if (!niche) return;

  const settings = getSettings();
  const mode: PipelineMode = settings.pipeline_mode || 'balanced';
  const cpaOffer = article.cpa_offer_id
    ? (db.prepare('SELECT * FROM cpa_offers WHERE id = ?').get(article.cpa_offer_id) as CpaOffer | undefined)
    : (db.prepare('SELECT * FROM cpa_offers WHERE niche_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1').get(niche.id) as CpaOffer | undefined);

  const ragSamples = db
    .prepare('SELECT * FROM rag_samples WHERE niche_id = ? ORDER BY id DESC LIMIT 5')
    .all(niche.id) as RagSample[];

  let stages: PipelineStageState[] = INITIAL_STAGES.map((s) => ({ ...s }));
  if (opts.resume && article.stages_json) {
    const prevStages = parseJsonSafe<PipelineStageState[]>(article.stages_json, []);
    if (Array.isArray(prevStages) && prevStages.length === INITIAL_STAGES.length) {
      stages = prevStages.map((s, idx) =>
        s.status === 'done'
          ? { ...INITIAL_STAGES[idx], ...s, status: 'done' }
          : { ...INITIAL_STAGES[idx], status: 'pending' },
      );
    }
  }

  const firstPendingIdx = stages.findIndex((s) => s.status !== 'done');
  const startStageNum = firstPendingIdx >= 0 ? stages[firstPendingIdx].stage : 1;
  let totalTokens = opts.resume ? Number(article.tokens_used || 0) : 0;
  let usedProviderLabel = `${settings.text_provider}:${settings.text_model}`;

  const recordGeneration = (res: TextGenerationResult) => {
    totalTokens += Number(res.tokensUsed) || 0;
    usedProviderLabel = res.fallbackFrom
      ? `${res.providerUsed} (резерв вместо ${res.fallbackFrom})`
      : res.providerUsed;
  };

  db.prepare(`
    UPDATE articles
    SET status = 'generating', current_stage = ?, stages_json = ?, error_message = '', provider_used = ?, tokens_used = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(startStageNum, JSON.stringify(stages), usedProviderLabel, totalTokens, articleId);

  const cpaContext = cpaOffer
    ? `CPA-оффер: "${cpaOffer.title}" (ссылка: ${cpaOffer.affiliate_url}, анкор: "${cpaOffer.anchor_text}", тезис: ${cpaOffer.pitch_hint})`
    : 'CPA-оффер не привязан — предусмотри место под полезный вывод без навязчивой рекламы.';
  const targetChars = settings.target_char_count || 4500;

  try {
    let strategistBrief = parseJsonSafe<Record<string, string>>(article.strategist_brief_json || '{}', {});
    let seoCore = parseJsonSafe<Record<string, unknown>>(article.seo_core_json || '{}', {});
    let finalTitle = article.title;
    let architectPlan = article.architect_plan || '';

    // ------------------------------------------------------------------
    // ЭТАПЫ 1–3: В режимах balanced/economy — 1 пакетный запрос (быстрая модель)
    // ------------------------------------------------------------------
    if (mode !== 'full') {
      const needPrepBatch =
        !opts.resume ||
        stages[0].status !== 'done' ||
        stages[1].status !== 'done' ||
        !strategistBrief.angle ||
        !seoCore.final_title;

      if (needPrepBatch) {
        const t0 = Date.now();
        updateStage(articleId, stages, 0, { status: 'running' });

        const batchRes = await generateText(settings, {
          systemInstruction:
            'Ты — Стратег, SEO-оптимизатор и Архитектор редакции Дзена. За один проход подготовь бриф, SEO-ядро (без кликбейта) и детальный план статьи по разделам H2/H3 с конкретикой. Отвечай строго JSON-объектом.',
          prompt: `Тема: "${article.title}" | Ниша: "${niche.name}" | Тон: ${niche.default_tone}
Целевой объём: ~${targetChars} знаков (коридор 3500–5500).
${cpaContext}

Верни строго JSON:
{
  "angle": "Уникальный угол подачи без пересказа очевидного",
  "target_emotion": "Целевая эмоция читателя",
  "first_3_paragraphs_hook": "Конкретная сцена, цифра или конфликт в первых 3 абзацах",
  "cpa_integration_plan": "Где и как естественно встроить рекомендацию",
  "final_title": "Сильный честный заголовок до 85 символов",
  "subtitle": "Короткий подзаголовок-уточнение",
  "rubric": "Рубрика Дзена",
  "preview_description": "Краткое описание для превью (120-160 знаков)",
  "tags": ["тег1", "тег2", "тег3", "тег4", "тег5"],
  "hf_keywords": ["ВЧ ключ 1", "ВЧ ключ 2"],
  "mf_keywords": ["СЧ ключ 1", "СЧ ключ 2"],
  "lsi_words": ["LSI 1", "LSI 2", "LSI 3", "LSI 4"],
  "architect_plan": "Пошаговый план статьи (H2/H3) с указанием цифр, примеров и кейсов в каждом блоке"
}`,
          jsonMode: true,
          useFastModel: true,
        });
        recordGeneration(batchRes);

        const parsed = parseJsonSafe<Record<string, unknown>>(batchRes.text, {});
        strategistBrief = {
          angle: String(parsed.angle || article.title),
          target_emotion: String(parsed.target_emotion || 'Узнавание и практический интерес'),
          first_3_paragraphs_hook: String(parsed.first_3_paragraphs_hook || 'Личный случай с точной цифрой'),
          cpa_integration_plan: String(parsed.cpa_integration_plan || 'Ближе к третьей четверти статьи как рабочий инструмент'),
        };

        finalTitle = String(parsed.final_title || article.title).slice(0, 120);
        const subtitle = String(parsed.subtitle || '');
        const rubric = String(parsed.rubric || niche.name);
        const previewDesc = String(parsed.preview_description || strategistBrief.angle || '');
        const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [niche.name];

        seoCore = {
          final_title: finalTitle,
          subtitle,
          rubric,
          preview_description: previewDesc,
          tags,
          hf_keywords: Array.isArray(parsed.hf_keywords) ? parsed.hf_keywords : [],
          mf_keywords: Array.isArray(parsed.mf_keywords) ? parsed.mf_keywords : [],
          lsi_words: Array.isArray(parsed.lsi_words) ? parsed.lsi_words : [],
        };

        architectPlan = normalizeArchitectPlan(parsed.architect_plan, finalTitle);

        db.prepare(`
          UPDATE articles
          SET strategist_brief_json = ?, title = ?, subtitle = ?, rubric = ?, preview_description = ?, tags_json = ?, seo_core_json = ?, architect_plan = ?, provider_used = ?, tokens_used = ?
          WHERE id = ?
        `).run(
          JSON.stringify(strategistBrief),
          finalTitle,
          subtitle,
          rubric,
          previewDesc,
          JSON.stringify(tags),
          JSON.stringify(seoCore),
          architectPlan,
          usedProviderLabel,
          totalTokens,
          articleId,
        );

        const elapsed = Date.now() - t0;
        updateStage(articleId, stages, 0, {
          status: 'done',
          duration_ms: elapsed,
          summary: `${strategistBrief.angle.slice(0, 90)} (пакетный вызов)`,
        });
        updateStage(articleId, stages, 1, {
          status: 'done',
          duration_ms: 0,
          summary: `${tags.length} тегов · рубрика «${rubric}»`,
        });
        updateStage(articleId, stages, 2, {
          status: 'done',
          duration_ms: 0,
          summary: 'План сформирован (экономия 2 запросов)',
        });
        await pauseIfGemini(usedProviderLabel);
      } else if (!opts.resume || stages[2].status !== 'done' || !architectPlan.trim()) {
        // Если на resume этапы 1 и 2 уже готовы, но этап 3 ещё не выполнен
        const t0 = Date.now();
        updateStage(articleId, stages, 2, { status: 'running' });
        const architectRes = await generateText(settings, {
          systemInstruction:
            'Ты — Архитектор лонгридов для Дзена. Составь логическую структуру статьи под целевой объём ~4500 знаков.',
          prompt: `Заголовок: "${finalTitle}" (~${targetChars} зн.). Бриф: ${JSON.stringify(strategistBrief)}. SEO: ${JSON.stringify(seoCore)}. Дай план H2/H3 с цифрами и кейсами.`,
          useFastModel: true,
        });
        recordGeneration(architectRes);
        architectPlan = architectRes.text;
        db.prepare(`UPDATE articles SET architect_plan = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
          architectPlan,
          usedProviderLabel,
          totalTokens,
          articleId,
        );
        updateStage(articleId, stages, 2, {
          status: 'done',
          duration_ms: Date.now() - t0,
          summary: 'План структуры сформирован',
        });
        await pauseIfGemini(usedProviderLabel);
      }
    } else {
      // Режим 'full': раздельные этапы 1, 2, 3
      if (!opts.resume || stages[0].status !== 'done' || !strategistBrief.angle) {
        const t0 = Date.now();
        updateStage(articleId, stages, 0, { status: 'running' });
        const strategistRes = await generateText(settings, {
          systemInstruction:
            'Ты — Стратег контент-редакции Дзена. Определи острый угол подачи, целевую эмоцию, крючок для первых 3 абзацев и точку нативного входа CPA-оффера. Отвечай строго JSON-объектом.',
          prompt: `Тема статьи: "${article.title}"
Ниша: "${niche.name}"
Тон ниши: ${niche.default_tone}
${cpaContext}

Верни JSON:
{
  "angle": "Уникальный угол подачи без пересказа очевидного",
  "target_emotion": "Целевая эмоция читателя",
  "first_3_paragraphs_hook": "С чего начать первые 3 абзаца: конкретная сцена, цифра или конфликт",
  "cpa_integration_plan": "Где и как естественно встроить рекомендацию"
}`,
          jsonMode: true,
          useFastModel: true,
        });
        recordGeneration(strategistRes);
        strategistBrief = parseJsonSafe<Record<string, string>>(strategistRes.text, {
          angle: article.title,
          target_emotion: 'Узнавание и практический интерес',
          first_3_paragraphs_hook: 'Личный случай с точной цифрой',
          cpa_integration_plan: 'Ближе к третьей четверти статьи как рабочий инструмент',
        });
        db.prepare(`UPDATE articles SET strategist_brief_json = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
          JSON.stringify(strategistBrief),
          usedProviderLabel,
          totalTokens,
          articleId,
        );
        updateStage(articleId, stages, 0, {
          status: 'done',
          duration_ms: Date.now() - t0,
          summary: strategistBrief.angle?.slice(0, 110),
        });
        await pauseIfGemini(usedProviderLabel);
      }

      if (!opts.resume || stages[1].status !== 'done' || !seoCore.final_title) {
        const t0 = Date.now();
        updateStage(articleId, stages, 1, { status: 'running' });
        const seoRes = await generateText(settings, {
          systemInstruction:
            'Ты — SEO-оптимизатор для Дзена. Собери семантическое ядро (ВЧ, СЧ, НЧ, LSI) и метаданные статьи без кликбейта. Отвечай строго JSON.',
          prompt: `Исходная тема: "${article.title}"
Ниша: "${niche.name}"
Бриф Стратега: ${JSON.stringify(strategistBrief)}

Верни JSON:
{
  "final_title": "Сильный честный заголовок до 85 символов",
  "subtitle": "Короткий подзаголовок-уточнение",
  "rubric": "Рубрика Дзена",
  "preview_description": "Краткое описание для карточки превью (120-160 знаков)",
  "tags": ["тег1", "тег2", "тег3", "тег4", "тег5"],
  "hf_keywords": ["ВЧ ключ 1", "ВЧ ключ 2"],
  "mf_keywords": ["СЧ ключ 1", "СЧ ключ 2"],
  "lsi_words": ["LSI слово 1", "LSI слово 2", "LSI слово 3", "LSI слово 4"]
}`,
          jsonMode: true,
          useFastModel: true,
        });
        recordGeneration(seoRes);
        seoCore = parseJsonSafe<Record<string, unknown>>(seoRes.text, {
          final_title: article.title,
          subtitle: '',
          rubric: niche.name,
          preview_description: strategistBrief.angle || article.title,
          tags: [niche.name],
        });

        finalTitle = String(seoCore.final_title || article.title).slice(0, 120);
        const subtitle = String(seoCore.subtitle || '');
        const rubric = String(seoCore.rubric || niche.name);
        const previewDesc = String(seoCore.preview_description || '');
        const tags = Array.isArray(seoCore.tags) ? seoCore.tags.map(String) : [niche.name];

        db.prepare(`
          UPDATE articles
          SET title = ?, subtitle = ?, rubric = ?, preview_description = ?, tags_json = ?, seo_core_json = ?, provider_used = ?, tokens_used = ?
          WHERE id = ?
        `).run(
          finalTitle,
          subtitle,
          rubric,
          previewDesc,
          JSON.stringify(tags),
          JSON.stringify(seoCore),
          usedProviderLabel,
          totalTokens,
          articleId,
        );
        updateStage(articleId, stages, 1, {
          status: 'done',
          duration_ms: Date.now() - t0,
          summary: `${tags.length} тегов · рубрика «${rubric}»`,
        });
        await pauseIfGemini(usedProviderLabel);
      }

      if (!opts.resume || stages[2].status !== 'done' || !architectPlan.trim()) {
        const t0 = Date.now();
        updateStage(articleId, stages, 2, { status: 'running' });
        const architectRes = await generateText(settings, {
          systemInstruction:
            'Ты — Архитектор лонгридов для Дзена. Составь логическую структуру статьи под целевой объём ~4500 знаков. Первые 3 абзаца должны сразу вводить в конкретную ситуацию или конфликт без вводной «воды».',
          prompt: `Заголовок: "${finalTitle}"
Целевой объём: ~${targetChars} знаков (строго в коридоре 3500–5500 знаков).
Бриф Стратега: ${JSON.stringify(strategistBrief)}
SEO-ядро: ${JSON.stringify(seoCore)}

Составь детальный план статьи по разделам (H2/H3) с указанием, какая цифра, пример или кейс будет в каждом блоке.`,
          useFastModel: true,
        });
        recordGeneration(architectRes);
        architectPlan = architectRes.text;
        db.prepare(`UPDATE articles SET architect_plan = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
          architectPlan,
          usedProviderLabel,
          totalTokens,
          articleId,
        );
        updateStage(articleId, stages, 2, {
          status: 'done',
          duration_ms: Date.now() - t0,
          summary: 'План структуры сформирован',
        });
        await pauseIfGemini(usedProviderLabel);
      }
    }

    // ------------------------------------------------------------------
    // ЭТАПЫ 4–6: Генерация текста, очеловечивание и фактчекинг
    // ------------------------------------------------------------------
    let draftText = article.draft_text || '';
    let stylistText = article.stylist_text || '';
    const cpaAnchorInstruction = cpaOffer
      ? `Встрой нативно в текст ссылку формата [${cpaOffer.anchor_text}](${cpaOffer.affiliate_url}) с контекстом: ${cpaOffer.pitch_hint}`
      : '';

    if (mode === 'economy') {
      // Режим ECONOMY: Этапы 4+5+6 за 1 вызов (итого 2 запроса к LLM на статью!)
      if (
        !opts.resume ||
        stages[3].status !== 'done' ||
        stages[4].status !== 'done' ||
        stages[5].status !== 'done' ||
        !stylistText.trim()
      ) {
        const t0 = Date.now();
        updateStage(articleId, stages, 3, { status: 'running' });

        const compactRag = buildCompactRagBlock(ragSamples, 350);
        const economyRes = await generateText(settings, {
          systemInstruction: `Ты — опытный автор и редактор Дзена. Напиши сразу чистовой, живой человеческий текст в Markdown (##, ###, абзацы, списки - ; БЕЗ H1 и HTML-тегов).
Объём: 3800–5100 знаков с пробелами.
ЗАПРЕЩЕНО (0 вхождений): ${BANNED_CLICHES.join(', ')}.
РИТМ И ГОЛОС:
- Чередуй длинные фразы (18–25 слов) и короткие рубленые (3–6 слов); абзацы разного размера.
- Живой голос («я», «мы», «на моём опыте»), конкретные цифры и сцены в каждом разделе.
- Максимум 1 длинное тире (—) на 1000 знаков.
После текста статьи добавь строку:
===FACTCHECK_JSON===
и JSON-массив спорных утверждений (или [] если всё достоверно): [{"claim":"","severity":"medium","reason":"","suggestion":""}].`,
          prompt: `Заголовок: "${finalTitle}"
Ниша: "${niche.name}" (${niche.default_tone})
План:
${architectPlan}

Стилевой ориентир (не копировать):
${compactRag}

${cpaAnchorInstruction}

Напиши готовую статью (~${targetChars} знаков) начиная сразу с первых 3 цепляющих абзацев, а в самом конце выведи ===FACTCHECK_JSON=== и массив флагов.`,
        });
        recordGeneration(economyRes);

        const parsedOut = splitStylistAndFactcheck(economyRes.text);
        stylistText = parsedOut.articleText;
        draftText = stylistText;

        db.prepare(`
          UPDATE articles
          SET draft_text = ?, stylist_text = ?, factcheck_flags_json = ?, provider_used = ?, tokens_used = ?
          WHERE id = ?
        `).run(
          draftText,
          stylistText,
          JSON.stringify(parsedOut.factFlags),
          usedProviderLabel,
          totalTokens,
          articleId,
        );

        const elapsed = Date.now() - t0;
        updateStage(articleId, stages, 3, {
          status: 'done',
          duration_ms: elapsed,
          summary: `${stylistText.length} знаков (эконом-проход)`,
        });
        updateStage(articleId, stages, 4, {
          status: 'done',
          duration_ms: 0,
          summary: 'Ритм и очистка штампов (объединено)',
        });
        updateStage(articleId, stages, 5, {
          status: 'done',
          duration_ms: 0,
          summary: `Флагов: ${parsedOut.factFlags.length} (экономия 2 запросов)`,
        });
        await pauseIfGemini(usedProviderLabel);
      }
    } else {
      // Режимы BALANCED и FULL: Этап 4 (Писатель)
      if (!opts.resume || stages[3].status !== 'done' || !draftText.trim()) {
        const t0 = Date.now();
        updateStage(articleId, stages, 3, { status: 'running' });
        const writerRes = await generateText(settings, {
          systemInstruction: `Ты — автор-практик в Дзене. Пиши живым русским языком в Markdown (только ## и ### заголовки, абзацы, списки - ).
ЗАПРЕЩЕНО использовать HTML-теги вроде <div>, <span>.
Объём статьи должен быть от 3800 до 5000 знаков с пробелами.
Обязательно: конкретные цифры, имена, жизненные примеры, личные местоимения (я/мы/на моём опыте).`,
          prompt: `Заголовок: "${finalTitle}"
Ниша: "${niche.name}" (${niche.default_tone})
План Архитектора:
${architectPlan}

${cpaAnchorInstruction}

Напиши полный черновик статьи (целевой объём ~${targetChars} знаков, не менее 3600 знаков). Не пиши заголовок H1 в начале текста — начинай сразу с первых 3 цепляющих абзацев.`,
        });
        recordGeneration(writerRes);
        draftText = writerRes.text;
        db.prepare(`UPDATE articles SET draft_text = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
          draftText,
          usedProviderLabel,
          totalTokens,
          articleId,
        );
        updateStage(articleId, stages, 3, {
          status: 'done',
          duration_ms: Date.now() - t0,
          summary: `Черновик: ${draftText.length} знаков`,
        });
        await pauseIfGemini(usedProviderLabel);
      }

      if (mode === 'balanced') {
        // Режим BALANCED: Этапы 5+6 объединены (Стилист + Фактчекер за 1 вызов)
        const needStylistAndFactcheck =
          !opts.resume || stages[4].status !== 'done' || !stylistText.trim();

        if (needStylistAndFactcheck) {
          const t0 = Date.now();
          updateStage(articleId, stages, 4, { status: 'running' });
          const compactRag = buildCompactRagBlock(ragSamples, 550);
          const detectedInDraft = BANNED_CLICHES.filter((c) => draftText.toLowerCase().includes(c));

          const combinedRes = await generateText(settings, {
            systemInstruction: `Ты — опытный редактор-стилист, «инжектор человечности» и фактчекер для Дзена.
1. Перепиши черновик так, чтобы он звучал как искренний, живой текст человека, сохранив факты и ссылки.
ЗАПРЕТ (0 вхождений): ${BANNED_CLICHES.join(', ')}.
РИТМ: чередуй длинные фразы (18–25 сл.) с короткими (3–6 сл.); абзацы разного размера; активный залог и живой голос («я/мы/на моём опыте»); ≤1 длинного тире (—) на 1000 знаков; объём 3700–5200 знаков.
2. После готового Markdown статьи добавь разделитель:
===FACTCHECK_JSON===
и JSON-массив спорных цифр/утверждений для проверки редактором (или [] если чисто): [{"claim":"","severity":"medium","reason":"","suggestion":""}].`,
            prompt: `Штампы для удаления: ${detectedInDraft.length ? detectedInDraft.join(', ') : 'нет'}

Стилевой референс (только ритм, без копирования):
${compactRag}

Черновик:
${draftText}`,
          });
          recordGeneration(combinedRes);

          const parsedOut = splitStylistAndFactcheck(combinedRes.text);
          stylistText = parsedOut.articleText;

          db.prepare(`
            UPDATE articles
            SET stylist_text = ?, factcheck_flags_json = ?, provider_used = ?, tokens_used = ?
            WHERE id = ?
          `).run(
            stylistText,
            JSON.stringify(parsedOut.factFlags),
            usedProviderLabel,
            totalTokens,
            articleId,
          );

          const elapsed = Date.now() - t0;
          updateStage(articleId, stages, 4, {
            status: 'done',
            duration_ms: elapsed,
            summary: `Очеловечено: ${stylistText.length} знаков`,
          });
          updateStage(articleId, stages, 5, {
            status: 'done',
            duration_ms: 0,
            summary: `Флагов проверки: ${parsedOut.factFlags.length} (совмещено с 05)`,
          });
          await pauseIfGemini(usedProviderLabel);
        } else if (!opts.resume || stages[5].status !== 'done') {
          // Если на resume этап 5 уже был готов, запускаем отдельно этап 6
          const t0 = Date.now();
          updateStage(articleId, stages, 5, { status: 'running' });
          const factRes = await generateText(settings, {
            systemInstruction:
              'Ты — строгий фактчекер редакции. Проверь текст на сомнительные цифры и риски. Верни JSON-массив флагов (или []).',
            prompt: `Ниша: "${niche.name}". Проверь текст:\n${stylistText}\nФормат: [{"claim":"","severity":"high|medium|low","reason":"","suggestion":""}]`,
            jsonMode: true,
            useFastModel: true,
          });
          recordGeneration(factRes);
          const factFlags = parseJsonSafe<FactcheckFlag[]>(factRes.text, []);
          db.prepare(`UPDATE articles SET factcheck_flags_json = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
            JSON.stringify(Array.isArray(factFlags) ? factFlags : []),
            usedProviderLabel,
            totalTokens,
            articleId,
          );
          updateStage(articleId, stages, 5, {
            status: 'done',
            duration_ms: Date.now() - t0,
            summary: `Флагов проверки: ${Array.isArray(factFlags) ? factFlags.length : 0}`,
          });
          await pauseIfGemini(usedProviderLabel);
        }
      } else {
        // Режим FULL: раздельные этапы 5 и 6
        if (!opts.resume || stages[4].status !== 'done' || !stylistText.trim()) {
          const t0 = Date.now();
          updateStage(articleId, stages, 4, { status: 'running' });
          const ragExamplesBlock =
            ragSamples.length > 0
              ? ragSamples
                  .slice(0, 3)
                  .map(
                    (s, idx) =>
                      `Образец ${idx + 1} («${s.title}» — только для анализа ритма, НЕ копируй факты):\n${s.content.slice(0, 750)}`,
                  )
                  .join('\n\n---\n\n')
              : 'Эталонных образцов для ниши пока нет — опирайся на живой авторский разговорный стиль.';

          const detectedInDraft = BANNED_CLICHES.filter((c) => draftText.toLowerCase().includes(c));

          const stylistRes = await generateText(settings, {
            systemInstruction: `Ты — опытный редактор-стилист и «инжектор человечности» для Дзена.
Перепиши черновик так, чтобы он звучал как искренний, живой текст человека, сохранив все факты и ссылки.

СТРОГИЙ ЗАПРЕТ (НИ ОДНОГО ВХОЖДЕНИЯ):
${BANNED_CLICHES.join(', ')}.

ТРЕБОВАНИЯ К РИТМУ И ТЕКСТУ:
1. Рваный ритм (burstiness): чередуй длинные фразы (18–25 слов) с короткими рублеными предложениями (3–6 слов). Никаких двух подряд предложений одинаковой длины!
2. Абзацы разного размера: 1 предложение, затем 4 предложения, затем 2.
3. Активный залог и живой голос («я», «мы», «на моём опыте», «честно говоря»).
4. В каждом разделе должна быть конкретика: цифра, имя, бытовая сцена или пример.
5. Максимум 1 длинное тире (—) на 1000 знаков — используй запятые, двоеточия и точки.
6. Итоговый объём строго в коридоре 3700–5200 знаков. Сохрани Markdown-разметку и партнёрскую ссылку если она есть.`,
            prompt: `Найденные в черновике штампы (удалить полностью): ${detectedInDraft.length ? detectedInDraft.join(', ') : 'нет'}

Стилевые референсы (RAG — воспроизведи только ритм и интонацию, ноль копирования текста):
${ragExamplesBlock}

Черновик для переработки:
${draftText}`,
          });
          recordGeneration(stylistRes);
          stylistText = stylistRes.text;
          db.prepare(`UPDATE articles SET stylist_text = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
            stylistText,
            usedProviderLabel,
            totalTokens,
            articleId,
          );
          updateStage(articleId, stages, 4, {
            status: 'done',
            duration_ms: Date.now() - t0,
            summary: `Очеловечено: ${stylistText.length} знаков`,
          });
          await pauseIfGemini(usedProviderLabel);
        }

        if (!opts.resume || stages[5].status !== 'done') {
          const t0 = Date.now();
          updateStage(articleId, stages, 5, { status: 'running' });
          const factRes = await generateText(settings, {
            systemInstruction:
              'Ты — строгий фактчекер редакции. Проверь текст на сомнительные цифры, неподтверждённые законы/ставки, медицинские/финансовые риски и возможные галлюцинации. Отвечай JSON-массивом объектов-флагов для ручной проверки редактором (если всё чисто — верни пустой массив []).',
            prompt: `Ниша: "${niche.name}"
Проверь утверждения в тексте статьи:
${stylistText}

Верни JSON-массив:
[
  {
    "claim": "Точная цитата утверждения",
    "severity": "high | medium | low",
    "reason": "Почему требует проверки",
    "suggestion": "Как уточнить или переформулировать"
  }
]`,
            jsonMode: true,
            useFastModel: true,
          });
          recordGeneration(factRes);
          const factFlags = parseJsonSafe<FactcheckFlag[]>(factRes.text, []);
          db.prepare(`UPDATE articles SET factcheck_flags_json = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
            JSON.stringify(Array.isArray(factFlags) ? factFlags : []),
            usedProviderLabel,
            totalTokens,
            articleId,
          );
          updateStage(articleId, stages, 5, {
            status: 'done',
            duration_ms: Date.now() - t0,
            summary: `Флагов проверки: ${Array.isArray(factFlags) ? factFlags.length : 0}`,
          });
          await pauseIfGemini(usedProviderLabel);
        }
      }
    }

    // ------------------------------------------------------------------
    // ЭТАП 7: Умный Редактор + Модуль 3 (Визуал) + 10-пт Валидатор
    // ------------------------------------------------------------------
    const t0 = Date.now();
    updateStage(articleId, stages, 6, { status: 'running' });

    const preCleaned = autoCleanArticleText(stylistText);
    const preHtml = markdownToCleanHtml(preCleaned);
    const preReport = runFinalValidator(preCleaned, preHtml, ragSamples, null);

    let finalCandidateText = preCleaned;
    let editorSkipped = false;

    if (mode === 'economy') {
      editorSkipped = true;
    } else if (mode === 'balanced' && preReport.cliche_matches.length === 0 && preReport.passed_count >= 8) {
      editorSkipped = true;
    } else {
      const editorRes = await generateText(settings, {
        systemInstruction: `Ты — выпускающий редактор Дзена. Сделай финальную вычитку текста: проверь первые 3 абзаца на силу вовлечения, убедись в отсутствии штампов (${BANNED_CLICHES.slice(0, 15).join(', ')}), сохрани партнёрскую ссылку, держи объём 3800–5200 знаков и верни чистый Markdown статьи без комментариев от себя.`,
        prompt: `Отредактируй финальный текст статьи "${finalTitle}":\n\n${preCleaned}`,
      });
      recordGeneration(editorRes);
      finalCandidateText = editorRes.text;
    }

    const [visualsRes, evalResult] = await Promise.all([
      generateArticleVisuals(articleId, finalTitle, niche.name, finalCandidateText, {
        skipLlmPrompting: mode !== 'full',
      }),
      evaluateAndSave(articleId, finalCandidateText, niche.id, mode === 'economy'),
    ]);
    totalTokens += visualsRes.tokensUsed || 0;
    const { images, warnings } = visualsRes;

    db.prepare(`UPDATE articles SET images_json = ?, provider_used = ?, tokens_used = ? WHERE id = ?`).run(
      JSON.stringify(images),
      usedProviderLabel,
      totalTokens,
      articleId,
    );

    if (article.topic_id) {
      db.prepare(`UPDATE topics SET status = 'completed' WHERE id = ?`).run(article.topic_id);
    }

    const editorNote = editorSkipped ? ' · редактор пропущен (экономия)' : '';
    updateStage(articleId, stages, 6, {
      status: 'done',
      duration_ms: Date.now() - t0,
      summary: `Валидатор: ${evalResult.report.passed_count}/10${editorNote} · Картинок: ${images.length}${warnings.length ? ` (${warnings[0]})` : ''}`,
    });

    const updatedArticle = db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(articleId) as Article;
    pipelineEmitter.emit(`article:${articleId}`, {
      type: 'complete',
      article: updatedArticle,
      warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const activeIdx = stages.findIndex((s) => s.status === 'running');
    if (activeIdx >= 0) {
      stages[activeIdx] = { ...stages[activeIdx], status: 'error', error: message };
    }
    db.prepare(`
      UPDATE articles
      SET status = 'failed', stages_json = ?, error_message = ?, provider_used = ?, tokens_used = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(stages), message, usedProviderLabel, totalTokens, articleId);

    const failedArticle = db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(articleId) as Article | undefined;

    pipelineEmitter.emit(`article:${articleId}`, {
      type: 'error',
      articleId,
      error: message,
      stages,
      article: failedArticle,
    });
  }
}

export async function rerunArticleStage(
  articleId: number,
  action: 'auto_clean' | 'stylist' | 'injector' | 'visuals',
): Promise<Article> {
  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article | undefined;
  if (!article) {
    throw new Error('Статья не найдена.');
  }
  const niche = db.prepare('SELECT * FROM niches WHERE id = ?').get(article.niche_id) as Niche;
  const settings = getSettings();

  if (action === 'auto_clean') {
    await evaluateAndSave(articleId, article.final_markdown || article.stylist_text || article.draft_text, niche.id);
    return db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(articleId) as Article;
  }

  if (action === 'visuals') {
    const { images, tokensUsed } = await generateArticleVisuals(
      articleId,
      article.title,
      niche.name,
      article.final_markdown || article.draft_text,
      { skipLlmPrompting: settings.pipeline_mode === 'economy' },
    );
    db.prepare(`UPDATE articles SET images_json = ?, tokens_used = tokens_used + ?, updated_at = datetime('now') WHERE id = ?`).run(
      JSON.stringify(images),
      tokensUsed,
      articleId,
    );
    return db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(articleId) as Article;
  }

  const baseText = article.final_markdown || article.stylist_text || article.draft_text;
  if (action === 'stylist') {
    const detected = BANNED_CLICHES.filter((c) => baseText.toLowerCase().includes(c));
    const res = await generateText(settings, {
      systemInstruction: `Ты — Стилист/Humanizer. Полностью удали штампы (${BANNED_CLICHES.join(', ')}), перестрой ритм предложений (чередование длинных и коротких 3–6 слов), разнообразь размер абзацев и сократи длинные тире до ≤1 на 1000 знаков. Верни только готовый Markdown.`,
      prompt: `Найденные штампы: ${detected.join(', ') || 'однообразие ритма'}.\n\nТекст:\n${baseText}`,
    });
    db.prepare(`UPDATE articles SET tokens_used = tokens_used + ? WHERE id = ?`).run(res.tokensUsed, articleId);
    await evaluateAndSave(articleId, res.text, niche.id);
  } else if (action === 'injector') {
    const res = await generateText(settings, {
      systemInstruction:
        'Ты — Инжектор человечности. Не меняя структуру статьи, найди 3–5 общих утверждений и добавь туда конкретику (цифру, имя, живую сцену или пример из жизни) и авторское «я/мы/на моём опыте». Запрещено выдумывать несуществующие исследования. Верни только обновлённый Markdown.',
      prompt: baseText,
    });
    db.prepare(`UPDATE articles SET tokens_used = tokens_used + ? WHERE id = ?`).run(res.tokensUsed, articleId);
    await evaluateAndSave(articleId, res.text, niche.id);
  }

  return db
    .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
    .get(articleId) as Article;
}
