import { EventEmitter } from 'node:events';
import { db, getSettings } from './db.ts';
import { generateEmbedding, generateText } from './providers.ts';
import type {
  Article,
  CpaOffer,
  FactcheckFlag,
  Niche,
  PipelineStageState,
  RagSample,
} from './types.ts';
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

async function evaluateAndSave(articleId: number, markdown: string, nicheId: number) {
  const cleanedMd = autoCleanArticleText(markdown);
  const cleanHtml = markdownToCleanHtml(cleanedMd);
  const ragSamples = db
    .prepare('SELECT * FROM rag_samples WHERE niche_id = ? ORDER BY id DESC LIMIT 10')
    .all(nicheId) as RagSample[];
  const embedding = await generateEmbedding(cleanedMd);
  const report = runFinalValidator(cleanedMd, cleanHtml, ragSamples, embedding);

  const nextStatus = report.overall_status === 'ready' ? 'ready' : 'needs_review';
  db.prepare(`
    UPDATE articles
    SET final_markdown = ?, final_html = ?, validator_json = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(cleanedMd, cleanHtml, JSON.stringify(report), nextStatus, articleId);

  return { cleanedMd, cleanHtml, report, nextStatus };
}

async function pauseIfGemini(provider: string) {
  if (provider === 'gemini') {
    await new Promise((r) => setTimeout(r, 900));
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

  db.prepare(`
    UPDATE articles
    SET status = 'generating', current_stage = ?, stages_json = ?, error_message = '', provider_used = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(startStageNum, JSON.stringify(stages), `${settings.text_provider}:${settings.text_model}`, articleId);

  let usedProviderLabel = `${settings.text_provider}:${settings.text_model}`;

  try {
    // ------------------------------------------------------------------
    // ЭТАП 1: Стратег
    // ------------------------------------------------------------------
    let strategistBrief = parseJsonSafe<Record<string, string>>(article.strategist_brief_json || '{}', {});
    if (!opts.resume || stages[0].status !== 'done' || !strategistBrief.angle) {
      const t0 = Date.now();
      updateStage(articleId, stages, 0, { status: 'running' });

      const cpaContext = cpaOffer
        ? `CPA-оффер для нативной интеграции: "${cpaOffer.title}" (ссылка: ${cpaOffer.affiliate_url}, анкор: "${cpaOffer.anchor_text}", тезис: ${cpaOffer.pitch_hint})`
        : 'CPA-оффер не привязан — предусмотри место под полезный вывод или чек-лист без навязчивой рекламы.';

      const strategistRes = await generateText(settings, {
        systemInstruction:
          'Ты — Стратег контент-редакции Дзена. Определи острый угол подачи, целевую эмоцию, крючок для первых 3 абзацев (критическая зона алгоритма Дзен) и точку нативного входа CPA-оффера. Отвечай строго JSON-объектом.',
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
      });
      usedProviderLabel = strategistRes.providerUsed;
      strategistBrief = parseJsonSafe<Record<string, string>>(strategistRes.text, {
        angle: article.title,
        target_emotion: 'Узнавание и практический интерес',
        first_3_paragraphs_hook: 'Личный случай с точной цифрой',
        cpa_integration_plan: 'Ближе к третьей четверти статьи как рабочий инструмент',
      });
      db.prepare(`UPDATE articles SET strategist_brief_json = ?, provider_used = ? WHERE id = ?`).run(
        JSON.stringify(strategistBrief),
        usedProviderLabel,
        articleId,
      );
      updateStage(articleId, stages, 0, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: strategistBrief.angle?.slice(0, 110),
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 2: SEO-оптимизатор
    // ------------------------------------------------------------------
    let seoCore = parseJsonSafe<Record<string, unknown>>(article.seo_core_json || '{}', {});
    let finalTitle = article.title;
    if (!opts.resume || stages[1].status !== 'done' || !seoCore.final_title) {
      const t0 = Date.now();
      updateStage(articleId, stages, 1, { status: 'running' });
      const seoRes = await generateText(settings, {
        systemInstruction:
          'Ты — SEO-оптимизатор для Дзена. Собери семантическое ядро (ВЧ, СЧ, НЧ, LSI) и метаданные статьи. Заголовок должен быть сильным и честным — БЕЗ кликбейта и обмана ожиданий. Отвечай строго JSON.',
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
      });
      usedProviderLabel = seoRes.providerUsed;
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
        SET title = ?, subtitle = ?, rubric = ?, preview_description = ?, tags_json = ?, seo_core_json = ?, provider_used = ?
        WHERE id = ?
      `).run(finalTitle, subtitle, rubric, previewDesc, JSON.stringify(tags), JSON.stringify(seoCore), usedProviderLabel, articleId);
      updateStage(articleId, stages, 1, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: `${tags.length} тегов · рубрика «${rubric}»`,
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 3: Архитектор
    // ------------------------------------------------------------------
    let architectPlan = article.architect_plan || '';
    const targetChars = settings.target_char_count || 4500;
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
      });
      usedProviderLabel = architectRes.providerUsed;
      architectPlan = architectRes.text;
      db.prepare(`UPDATE articles SET architect_plan = ?, provider_used = ? WHERE id = ?`).run(
        architectPlan,
        usedProviderLabel,
        articleId,
      );
      updateStage(articleId, stages, 2, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: 'План структуры сформирован',
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 4: Писатель
    // ------------------------------------------------------------------
    let draftText = article.draft_text || '';
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

${cpaOffer ? `Встрой нативно в текст ссылку формата [${cpaOffer.anchor_text}](${cpaOffer.affiliate_url}) с контекстом: ${cpaOffer.pitch_hint}` : ''}

Напиши полный черновик статьи (целевой объём ~${targetChars} знаков, не менее 3600 знаков). Не пиши заголовок H1 в начале текста — начинай сразу с первых 3 цепляющих абзацев.`,
      });
      usedProviderLabel = writerRes.providerUsed;
      draftText = writerRes.text;
      db.prepare(`UPDATE articles SET draft_text = ?, provider_used = ? WHERE id = ?`).run(
        draftText,
        usedProviderLabel,
        articleId,
      );
      updateStage(articleId, stages, 3, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: `Черновик: ${draftText.length} знаков`,
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 5: Детектор маркеров + Стилист/Humanizer + Инжектор человечности
    // ------------------------------------------------------------------
    let stylistText = article.stylist_text || '';
    if (!opts.resume || stages[4].status !== 'done' || !stylistText.trim()) {
      const t0 = Date.now();
      updateStage(articleId, stages, 4, { status: 'running' });
      const ragExamplesBlock =
        ragSamples.length > 0
          ? ragSamples
              .map(
                (s, idx) =>
                  `Образец ${idx + 1} («${s.title}» — только для анализа ритма и подачи, НЕ копируй факты и фразы):\n${s.content.slice(0, 900)}`,
              )
              .join('\n\n---\n\n')
          : 'Эталонных образцов для ниши пока нет — опирайся на живой авторский разговорный стиль.';

      const detectedInDraft = BANNED_CLICHES.filter((c) => draftText.toLowerCase().includes(c));

      const stylistRes = await generateText(settings, {
        systemInstruction: `Ты — опытный редактор-стилист и «инжектор человечности» для Дзена.
Твоя задача: переписать черновик так, чтобы он звучал как искренний, живой текст человека, сохранив все факты и ссылки.

СТРОГИЙ ЗАПРЕТ (НИ ОДНОГО ВХОЖДЕНИЯ):
${BANNED_CLICHES.join(', ')}.

ТРЕБОВАНИЯ К РИТМУ И ТЕКСТУ:
1. Рваный ритм (burstiness): чередуй длинные фразы (18–25 слов) с короткими рублеными предложениями (3–6 слов). Никаких двух подряд предложений одинаковой длины!
2. Абзацы разного размера: 1 предложение, затем 4 предложения, затем 2. Не делай все абзацы по 3–4 фразы.
3. Активный залог и живой голос («я», «мы», «на моём опыте», «честно говоря», точечно частицы «же», «ведь», «-то»). Допустимы 1–2 лёгкие разговорные «шероховатости».
4. В каждом разделе должна быть конкретика: цифра, имя, бытовая сцена или пример. НЕ выдумывай несуществующие исследования.
5. Максимум 1 длинное тире (—) на 1000 знаков — используй запятые, двоеточия и точки.
6. Итоговый объём строго в коридоре 3700–5200 знаков. Сохрани Markdown-разметку и партнёрскую ссылку если она есть.`,
        prompt: `Найденные в черновике штампы (удалить полностью): ${detectedInDraft.length ? detectedInDraft.join(', ') : 'нет'}

Стилевые референсы (RAG — воспроизведи только ритм и интонацию, ноль копирования текста):
${ragExamplesBlock}

Черновик для переработки:
${draftText}`,
      });
      usedProviderLabel = stylistRes.providerUsed;
      stylistText = stylistRes.text;
      db.prepare(`UPDATE articles SET stylist_text = ?, provider_used = ? WHERE id = ?`).run(
        stylistText,
        usedProviderLabel,
        articleId,
      );
      updateStage(articleId, stages, 4, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: `Очеловечено: ${stylistText.length} знаков`,
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 6: Фактчекер
    // ------------------------------------------------------------------
    if (!opts.resume || stages[5].status !== 'done') {
      const t0 = Date.now();
      updateStage(articleId, stages, 5, { status: 'running' });
      const useSearchForFactcheck = settings.text_provider === 'gemini';
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
        jsonMode: !useSearchForFactcheck,
        useSearchGrounding: useSearchForFactcheck,
      });
      usedProviderLabel = factRes.providerUsed;
      const factFlags = parseJsonSafe<FactcheckFlag[]>(factRes.text, []);
      db.prepare(`UPDATE articles SET factcheck_flags_json = ?, provider_used = ? WHERE id = ?`).run(
        JSON.stringify(Array.isArray(factFlags) ? factFlags : []),
        usedProviderLabel,
        articleId,
      );
      updateStage(articleId, stages, 5, {
        status: 'done',
        duration_ms: Date.now() - t0,
        summary: `Флагов проверки: ${Array.isArray(factFlags) ? factFlags.length : 0}`,
      });
      await pauseIfGemini(settings.text_provider);
    }

    // ------------------------------------------------------------------
    // ЭТАП 7: Редактор + Модуль 3 (Визуал) + 10-пт Валидатор
    // ------------------------------------------------------------------
    const t0 = Date.now();
    updateStage(articleId, stages, 6, { status: 'running' });

    const editorRes = await generateText(settings, {
      systemInstruction: `Ты — выпускающий редактор Дзена. Сделай финальную вычитку текста: проверь первые 3 абзаца на силу вовлечения, убедись в отсутствии штампов (${BANNED_CLICHES.slice(0, 15).join(', ')}), сохрани партнёрскую ссылку, держи объём 3800–5200 знаков и верни чистый Markdown статьи без комментариев от себя.`,
      prompt: `Отредактируй финальный текст статьи "${finalTitle}":\n\n${stylistText}`,
    });
    usedProviderLabel = editorRes.providerUsed;

    const [{ images, warnings }, evalResult] = await Promise.all([
      generateArticleVisuals(articleId, finalTitle, niche.name, editorRes.text),
      evaluateAndSave(articleId, editorRes.text, niche.id),
    ]);

    db.prepare(`UPDATE articles SET images_json = ?, provider_used = ? WHERE id = ?`).run(
      JSON.stringify(images),
      usedProviderLabel,
      articleId,
    );

    if (article.topic_id) {
      db.prepare(`UPDATE topics SET status = 'completed' WHERE id = ?`).run(article.topic_id);
    }

    updateStage(articleId, stages, 6, {
      status: 'done',
      duration_ms: Date.now() - t0,
      summary: `Валидатор: ${evalResult.report.passed_count}/10 · Картинок: ${images.length}${warnings.length ? ` (${warnings[0]})` : ''}`,
    });

    const updatedArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article;
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
      SET status = 'failed', stages_json = ?, error_message = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(stages), message, articleId);

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
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article;
  }

  if (action === 'visuals') {
    const { images } = await generateArticleVisuals(
      articleId,
      article.title,
      niche.name,
      article.final_markdown || article.draft_text,
    );
    db.prepare(`UPDATE articles SET images_json = ?, updated_at = datetime('now') WHERE id = ?`).run(
      JSON.stringify(images),
      articleId,
    );
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article;
  }

  const baseText = article.final_markdown || article.stylist_text || article.draft_text;
  if (action === 'stylist') {
    const detected = BANNED_CLICHES.filter((c) => baseText.toLowerCase().includes(c));
    const res = await generateText(settings, {
      systemInstruction: `Ты — Стилист/Humanizer. Полностью удали штампы (${BANNED_CLICHES.join(', ')}), перестрой ритм предложений (чередование длинных и коротких 3–6 слов), разнообразь размер абзацев и сократи длинные тире до ≤1 на 1000 знаков. Верни только готовый Markdown.`,
      prompt: `Найденные штампы: ${detected.join(', ') || 'однообразие ритма'}.\n\nТекст:\n${baseText}`,
    });
    await evaluateAndSave(articleId, res.text, niche.id);
  } else if (action === 'injector') {
    const res = await generateText(settings, {
      systemInstruction:
        'Ты — Инжектор человечности. Не меняя структуру статьи, найди 3–5 общих утверждений и добавь туда конкретику (цифру, имя, живую сцену или пример из жизни) и авторское «я/мы/на моём опыте». Запрещено выдумывать несуществующие исследования. Верни только обновлённый Markdown.',
      prompt: baseText,
    });
    await evaluateAndSave(articleId, res.text, niche.id);
  }

  return db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as Article;
}
