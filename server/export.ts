import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_IMAGES_DIR, db, getSettings } from './db.ts';
import type { Article, ArticleImage } from './types.ts';

export async function buildArticleDocxBuffer(article: Article): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: article.title,
      heading: HeadingLevel.HEADING_1,
    }),
  ];

  if (article.subtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: article.subtitle, italics: true })],
      }),
    );
  }

  const lines = article.final_markdown.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } }));
    } else {
      const cleanText = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      children.push(new Paragraph({ text: cleanText }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

export async function buildArticleImagesZipBuffer(article: Article): Promise<Buffer> {
  const zip = new JSZip();
  let images: ArticleImage[] = [];
  try {
    images = JSON.parse(article.images_json || '[]') as ArticleImage[];
  } catch {
    images = [];
  }

  for (const img of images) {
    const fullPath = path.join(UPLOADS_IMAGES_DIR, img.filename);
    if (fs.existsSync(fullPath)) {
      zip.file(img.filename, fs.readFileSync(fullPath));
    }
  }

  const metadataText = [
    `Заголовок: ${article.title}`,
    `Подзаголовок: ${article.subtitle}`,
    `Рубрика: ${article.rubric}`,
    `Описание превью: ${article.preview_description}`,
    '',
    'Подписи к изображениям:',
    ...images.map((i) => `- ${i.filename} (${i.role}): ${i.caption}`),
  ].join('\n');
  zip.file('metadata_and_captions.txt', metadataText);

  return zip.generateAsync({ type: 'nodebuffer' });
}

export function buildFullDzenHtmlDocument(article: Article): string {
  let tags: string[] = [];
  let images: ArticleImage[] = [];
  try {
    tags = JSON.parse(article.tags_json || '[]') as string[];
  } catch {
    tags = [];
  }
  try {
    images = JSON.parse(article.images_json || '[]') as ArticleImage[];
  } catch {
    images = [];
  }

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${article.title}</title>
  <meta name="description" content="${article.preview_description}" />
  <meta name="keywords" content="${tags.join(', ')}" />
</head>
<body>
  <article>
    <h1>${article.title}</h1>
    ${article.subtitle ? `<p><em>${article.subtitle}</em></p>` : ''}
    ${article.final_html}
    ${images.length > 0 ? `<hr /><h3>Иллюстрации</h3><ul>${images.map((i) => `<li><strong>${i.role}:</strong> ${i.caption} (${i.filename})</li>`).join('')}</ul>` : ''}
  </article>
</body>
</html>`;
}

export async function publishArticleViaTelegram(article: Article): Promise<{
  ok: boolean;
  fallbackUsed: boolean;
  message: string;
  messageId?: string;
}> {
  const settings = getSettings();
  if (!settings.telegram_enabled) {
    return {
      ok: false,
      fallbackUsed: true,
      message: 'Тумблер публикации через Telegram-бота выключен в настройках. Используйте режим 4.1 «Копирование с вёрсткой».',
    };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = settings.telegram_channel_id || process.env.TELEGRAM_CHANNEL_ID;
  if (!botToken || !channelId) {
    return {
      ok: false,
      fallbackUsed: true,
      message: 'Не задан TELEGRAM_BOT_TOKEN или ID Telegram-канала. Сработал безопасный откат к режиму 4.1.',
    };
  }

  // Telegram limits: plain/HTML simplified formatting (max 4096 chars per text message)
  const plainBody = article.final_markdown
    .replace(/^##\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^###\s+(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

  const fullMessage = `<b>${article.title}</b>\n\n${plainBody}`.slice(0, 4050);

  try {
    let images: ArticleImage[] = [];
    try {
      images = JSON.parse(article.images_json || '[]') as ArticleImage[];
    } catch {
      images = [];
    }

    const cover = images.find((i) => i.role === 'cover');
    if (cover) {
      const coverPath = path.join(UPLOADS_IMAGES_DIR, cover.filename);
      if (fs.existsSync(coverPath)) {
        const form = new FormData();
        form.append('chat_id', channelId);
        form.append('caption', `${article.title}\n\n${article.preview_description}`.slice(0, 1000));
        form.append('photo', new Blob([fs.readFileSync(coverPath)]), cover.filename);
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: form,
        });
      }
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: fullMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        fallbackUsed: true,
        message: `Telegram API отклонил отправку (${data.description || res.status}). Сработал откат к ручному копированию.`,
      };
    }

    const msgId = String(data.result?.message_id || '');
    db.prepare(`
      UPDATE articles
      SET status = 'published_tg', telegram_status = 'sent', telegram_message_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(msgId, article.id);

    return {
      ok: true,
      fallbackUsed: false,
      messageId: msgId,
      message: 'Пост отправлен в Telegram-канал. @zen_sync_bot продублирует его в Дзен в течение 5–10 минут.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      fallbackUsed: true,
      message: `Сбой соединения с Telegram (${msg}). Выполнен откат к режиму 4.1 «Копирование с вёрсткой».`,
    };
  }
}
