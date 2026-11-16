import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  createSessionToken,
  getAdminCredentials,
  getSessionFromRequest,
  requireAuth,
  setSessionCookie,
} from './server/auth.ts';
import { UPLOADS_IMAGES_DIR, db, getSettings, updateSettings } from './server/db.ts';
import {
  buildArticleDocxBuffer,
  buildArticleImagesZipBuffer,
  buildFullDzenHtmlDocument,
  publishArticleViaTelegram,
} from './server/export.ts';
import { pipelineEmitter, rerunArticleStage, runArticlePipeline } from './server/pipeline.ts';
import { generateEmbedding, getProviderStatuses } from './server/providers.ts';
import { discoverAndScoreTopics } from './server/trends.ts';
import type { Article, Niche, RagSample } from './server/types.ts';
import { computeTextFingerprint, markdownToCleanHtml, runFinalValidator } from './server/validator.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function buildApiRouter(): express.Router {
  const api = express.Router();
  api.use(express.json({ limit: '5mb' }));

  api.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'dzen-ai-studio' });
  });

  // ------------------------------------------------------------------
  // Авторизация
  // ------------------------------------------------------------------
  api.get('/auth/me', (req, res) => {
    const session = getSessionFromRequest(req);
    const creds = getAdminCredentials();
    res.json({
      authenticated: session.authenticated,
      username: session.username || null,
      usingDefaultPassword: creds.usingDefaults,
    });
  });

  api.post('/auth/login', (req, res) => {
    const { username, password } = (req.body || {}) as { username?: string; password?: string };
    const creds = getAdminCredentials();
    if (username === creds.username && password === creds.password) {
      const token = createSessionToken(creds.username);
      setSessionCookie(req, res, token);
      res.json({ ok: true, username: creds.username, token });
      return;
    }
    res.status(401).json({ error: 'Неверный логин или пароль.' });
  });

  api.post('/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // Все остальные маршруты требуют сессии администратора
  api.use(requireAuth);

  // ------------------------------------------------------------------
  // Ниши
  // ------------------------------------------------------------------
  api.get('/niches', (_req, res) => {
    const rows = db.prepare('SELECT * FROM niches ORDER BY is_top10 DESC, id ASC').all() as Niche[];
    res.json(rows);
  });

  api.post('/niches', (req, res) => {
    const { name, rpm_range, growth_note, ai_fit, default_tone, cpa_notes } = (req.body || {}) as Partial<Niche>;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Укажите название ниши.' });
      return;
    }
    try {
      const info = db
        .prepare(
          `INSERT INTO niches (name, rpm_range, growth_note, ai_fit, default_tone, cpa_notes, is_top10)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
        )
        .run(
          name.trim(),
          rpm_range || 'Пользовательская ниша',
          growth_note || 'Добавлена вручную',
          ai_fit || 'Высокий',
          default_tone || 'Практический, живой голос от первого лица',
          cpa_notes || '',
        );
      const created = db.prepare('SELECT * FROM niches WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Ошибка создания ниши.' });
    }
  });

  api.delete('/niches/:id', (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM niches WHERE id = ? AND is_top10 = 0').run(id);
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // CPA-офферы
  // ------------------------------------------------------------------
  api.get('/cpa-offers', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT o.*, n.name as niche_name FROM cpa_offers o LEFT JOIN niches n ON n.id = o.niche_id ORDER BY o.id DESC`,
      )
      .all();
    res.json(rows);
  });

  api.post('/cpa-offers', (req, res) => {
    const { niche_id, title, affiliate_url, anchor_text, payout_note, pitch_hint } = (req.body || {}) as Record<
      string,
      unknown
    >;
    if (!niche_id || !title || !affiliate_url || !anchor_text) {
      res.status(400).json({ error: 'Заполните нишу, название, URL и анкор ссылки.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO cpa_offers (niche_id, title, affiliate_url, anchor_text, payout_note, pitch_hint)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(niche_id),
        String(title),
        String(affiliate_url),
        String(anchor_text),
        String(payout_note || ''),
        String(pitch_hint || ''),
      );
    const created = db
      .prepare(`SELECT o.*, n.name as niche_name FROM cpa_offers o LEFT JOIN niches n ON n.id = o.niche_id WHERE o.id = ?`)
      .get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  api.patch('/cpa-offers/:id', (req, res) => {
    const id = Number(req.params.id);
    const { is_active } = (req.body || {}) as { is_active?: number };
    db.prepare('UPDATE cpa_offers SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
    res.json({ ok: true });
  });

  api.delete('/cpa-offers/:id', (req, res) => {
    db.prepare('DELETE FROM cpa_offers WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // Модуль 1: Темы и Радар трендов
  // ------------------------------------------------------------------
  api.get('/topics', (req, res) => {
    const nicheId = req.query.nicheId ? Number(req.query.nicheId) : null;
    const rows = nicheId
      ? db
          .prepare(
            `SELECT t.*, n.name as niche_name FROM topics t JOIN niches n ON n.id = t.niche_id WHERE t.niche_id = ? ORDER BY t.id DESC`,
          )
          .all(nicheId)
      : db
          .prepare(
            `SELECT t.*, n.name as niche_name FROM topics t JOIN niches n ON n.id = t.niche_id ORDER BY t.id DESC LIMIT 100`,
          )
          .all();
    res.json(rows);
  });

  api.post('/topics/discover', async (req, res) => {
    try {
      const { niche_id, custom_focus } = (req.body || {}) as { niche_id?: number; custom_focus?: string };
      if (!niche_id) {
        res.status(400).json({ error: 'Выберите нишу для поиска трендов.' });
        return;
      }
      const created = await discoverAndScoreTopics(Number(niche_id), String(custom_focus || ''));
      res.json(created);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Ошибка радара трендов.' });
    }
  });

  api.post('/topics', (req, res) => {
    const { niche_id, title, angle } = (req.body || {}) as { niche_id?: number; title?: string; angle?: string };
    if (!niche_id || !title?.trim()) {
      res.status(400).json({ error: 'Укажите нишу и заголовок темы.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO topics (niche_id, title, angle, source, demand_score, competition_score, niche_fit_score, cpa_score, priority_score, status)
         VALUES (?, ?, ?, 'manual', 80, 50, 90, 75, 80, 'approved')`,
      )
      .run(Number(niche_id), title.trim(), String(angle || 'Ручная постановка темы'));
    const created = db
      .prepare(`SELECT t.*, n.name as niche_name FROM topics t JOIN niches n ON n.id = t.niche_id WHERE t.id = ?`)
      .get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  api.patch('/topics/:id', (req, res) => {
    const id = Number(req.params.id);
    const { status } = (req.body || {}) as { status?: string };
    if (!status) {
      res.status(400).json({ error: 'Укажите статус.' });
      return;
    }
    db.prepare('UPDATE topics SET status = ? WHERE id = ?').run(status, id);
    res.json({ ok: true });
  });

  api.delete('/topics/:id', (req, res) => {
    db.prepare('DELETE FROM topics WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // Библиотека стиля RAG
  // ------------------------------------------------------------------
  api.get('/rag-samples', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT r.*, n.name as niche_name FROM rag_samples r JOIN niches n ON n.id = r.niche_id ORDER BY r.id DESC`,
      )
      .all();
    res.json(rows);
  });

  api.post('/rag-samples', async (req, res) => {
    const { niche_id, title, content, style_summary } = (req.body || {}) as {
      niche_id?: number;
      title?: string;
      content?: string;
      style_summary?: string;
    };
    if (!niche_id || !title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Укажите нишу, заголовок и текст эталонного образца.' });
      return;
    }
    const fp = computeTextFingerprint(content);
    const emb = await generateEmbedding(content);
    const info = db
      .prepare(
        `INSERT INTO rag_samples (niche_id, title, content, style_summary, embedding_json, avg_sentence_len, avg_paragraph_sentences, subjectivity_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Number(niche_id),
        title.trim(),
        content.trim(),
        String(style_summary || `Среднее предложение: ${fp.avgSentenceLen} слов; субъективность: ${Math.round(fp.subjectivityScore * 100)}%`),
        JSON.stringify(emb || []),
        fp.avgSentenceLen,
        fp.avgParagraphSentences,
        fp.subjectivityScore,
      );
    const created = db
      .prepare(`SELECT r.*, n.name as niche_name FROM rag_samples r JOIN niches n ON n.id = r.niche_id WHERE r.id = ?`)
      .get(info.lastInsertRowid);
    res.status(201).json(created);
  });

  api.delete('/rag-samples/:id', (req, res) => {
    db.prepare('DELETE FROM rag_samples WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // Модули 2, 3, 4: Статьи, 7-этапный пайплайн, Валидатор, Экспорт
  // ------------------------------------------------------------------
  api.get('/articles', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id ORDER BY a.id DESC LIMIT 100`,
      )
      .all();
    res.json(rows);
  });

  api.get('/articles/:id', (req, res) => {
    const row = db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(Number(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Статья не найдена.' });
      return;
    }
    res.json(row);
  });

  api.post('/articles/generate', (req, res) => {
    const { niche_id, topic_id, title, cpa_offer_id } = (req.body || {}) as {
      niche_id?: number;
      topic_id?: number;
      title?: string;
      cpa_offer_id?: number | null;
    };

    let resolvedNicheId = niche_id ? Number(niche_id) : 0;
    let resolvedTitle = (title || '').trim();

    if (topic_id) {
      const topic = db.prepare('SELECT * FROM topics WHERE id = ?').get(Number(topic_id)) as
        | { id: number; niche_id: number; title: string }
        | undefined;
      if (!topic) {
        res.status(404).json({ error: 'Тема не найдена.' });
        return;
      }
      resolvedNicheId = topic.niche_id;
      if (!resolvedTitle) resolvedTitle = topic.title;
      db.prepare(`UPDATE topics SET status = 'in_progress' WHERE id = ?`).run(topic.id);
    }

    if (!resolvedNicheId || !resolvedTitle) {
      res.status(400).json({ error: 'Укажите нишу и тему для запуска генерации.' });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO articles (topic_id, niche_id, cpa_offer_id, title, status, current_stage)
         VALUES (?, ?, ?, ?, 'queued', 0)`,
      )
      .run(topic_id ? Number(topic_id) : null, resolvedNicheId, cpa_offer_id ? Number(cpa_offer_id) : null, resolvedTitle);

    const articleId = Number(info.lastInsertRowid);
    // Start async 7-stage pipeline
    void runArticlePipeline(articleId);

    const created = db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(articleId);
    res.status(202).json(created);
  });

  api.get('/articles/:id/stream', (req, res) => {
    const articleId = Number(req.params.id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const onEvent = (payload: unknown) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    pipelineEmitter.on(`article:${articleId}`, onEvent);
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      pipelineEmitter.off(`article:${articleId}`, onEvent);
    });
  });

  api.post('/articles/:id/rerun', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { action } = (req.body || {}) as { action?: 'auto_clean' | 'stylist' | 'injector' | 'visuals' };
      if (!action) {
        res.status(400).json({ error: 'Укажите действие.' });
        return;
      }
      const updated = await rerunArticleStage(id, action);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Ошибка дожима этапа.' });
    }
  });

  api.patch('/articles/:id', async (req, res) => {
    const id = Number(req.params.id);
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | undefined;
    if (!article) {
      res.status(404).json({ error: 'Статья не найдена.' });
      return;
    }

    const { title, subtitle, rubric, preview_description, final_markdown, tags } = (req.body || {}) as {
      title?: string;
      subtitle?: string;
      rubric?: string;
      preview_description?: string;
      final_markdown?: string;
      tags?: string[];
    };

    const nextMd = final_markdown !== undefined ? final_markdown : article.final_markdown;
    const nextHtml = markdownToCleanHtml(nextMd);
    const ragSamples = db.prepare('SELECT * FROM rag_samples WHERE niche_id = ?').all(article.niche_id) as RagSample[];
    const report = runFinalValidator(nextMd, nextHtml, ragSamples, null);

    db.prepare(`
      UPDATE articles
      SET title = ?, subtitle = ?, rubric = ?, preview_description = ?, tags_json = ?,
          final_markdown = ?, final_html = ?, validator_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ?? article.title,
      subtitle ?? article.subtitle,
      rubric ?? article.rubric,
      preview_description ?? article.preview_description,
      tags ? JSON.stringify(tags) : article.tags_json,
      nextMd,
      nextHtml,
      JSON.stringify(report),
      id,
    );

    const updated = db
      .prepare(`SELECT a.*, n.name as niche_name FROM articles a JOIN niches n ON n.id = a.niche_id WHERE a.id = ?`)
      .get(id);
    res.json(updated);
  });

  api.delete('/articles/:id', (req, res) => {
    db.prepare('DELETE FROM articles WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Экспорт
  api.get('/articles/:id/export/:format', async (req, res) => {
    const id = Number(req.params.id);
    const format = req.params.format;
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | undefined;
    if (!article) {
      res.status(404).json({ error: 'Статья не найдена.' });
      return;
    }

    const safeSlug = `dzen_article_${id}`;

    if (format === 'md') {
      const md = `# ${article.title}\n\n${article.subtitle ? `_${article.subtitle}_\n\n` : ''}${article.final_markdown}`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeSlug}.md"`);
      res.send(md);
      return;
    }

    if (format === 'html') {
      const html = buildFullDzenHtmlDocument(article);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeSlug}.html"`);
      res.send(html);
      return;
    }

    if (format === 'docx') {
      const buf = await buildArticleDocxBuffer(article);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${safeSlug}.docx"`);
      res.send(buf);
      return;
    }

    if (format === 'zip') {
      const zipBuf = await buildArticleImagesZipBuffer(article);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeSlug}_images.zip"`);
      res.send(zipBuf);
      return;
    }

    res.status(400).json({ error: 'Неподдерживаемый формат экспорта.' });
  });

  api.post('/articles/:id/publish-telegram', async (req, res) => {
    const id = Number(req.params.id);
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | undefined;
    if (!article) {
      res.status(404).json({ error: 'Статья не найдена.' });
      return;
    }
    const result = await publishArticleViaTelegram(article);
    res.json(result);
  });

  // ------------------------------------------------------------------
  // Настройки и диагностика провайдеров
  // ------------------------------------------------------------------
  api.get('/settings', (_req, res) => {
    res.json({
      settings: getSettings(),
      providers: getProviderStatuses(),
    });
  });

  api.put('/settings', (req, res) => {
    const next = updateSettings(req.body || {});
    res.json({
      settings: next,
      providers: getProviderStatuses(),
    });
  });

  return api;
}

async function startServer() {
  const app = express();
  app.use(cookieParser());

  // Redirect /dzen -> /dzen/ so relative assets resolve identically
  app.get('/dzen', (_req, res) => {
    res.redirect(301, '/dzen/');
  });

  // Serve generated article images under both /uploads/images and /dzen/uploads/images
  app.use('/uploads/images', express.static(UPLOADS_IMAGES_DIR));
  app.use('/dzen/uploads/images', express.static(UPLOADS_IMAGES_DIR));

  // Mount API routes on both /api and /dzen/api
  const apiRouter = buildApiRouter();
  app.use('/api', apiRouter);
  app.use('/dzen/api', apiRouter);

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Rewrite /dzen/* requests in dev so Vite serves assets and index.html cleanly
    app.use('/dzen', (req, res, next) => {
      vite.middlewares(req, res, next);
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use('/dzen', express.static(distDir));
    app.use('/', express.static(distDir));

    const sendSpa = (_req: express.Request, res: express.Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Frontend build not found.');
      }
    };

    app.get('/dzen/*', sendSpa);
    app.get('*', sendSpa);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dzen AI Studio server listening on http://0.0.0.0:${PORT} (paths: / and /dzen/)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
