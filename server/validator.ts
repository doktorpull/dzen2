import type { RagSample, ValidatorCheckItem, ValidatorReport } from './types.ts';

export const BANNED_CLICHES: string[] = [
  // Вводные конструкции (раздел 4.3.1)
  'в современном мире',
  'в современном цифровом ландшафте',
  'стоит отметить',
  'важно понимать',
  'важно подчеркнуть',
  'следует учитывать',
  'одним из ключевых аспектов является',
  'в данной статье рассматривается',
  'с учетом',
  'с учётом',
  'в рамках',
  'в условиях',
  'исходя из',
  'в контексте',
  'при рассмотрении',
  'в соответствии с',
  // Связки при злоупотреблении
  'таким образом',
  'тем не менее',
  'следовательно',
  // Вода
  'существует множество способов',
  'каждый случай требует индивидуального подхода',
  'однозначного ответа не существует',
  'важно учитывать ряд факторов',
  'это особенно актуально в условиях',
  // Рекламные прилагательные
  'уникальный',
  'уникальная',
  'уникальное',
  'инновационный',
  'инновационная',
  'беспрецедентный',
  'бесшовный',
  'ключ к успеху',
  'раскрыть потенциал',
  // Слова-маркеры
  'на сегодняшний день',
  'осуществляется',
  'безусловно',
  'несомненно',
];

const SUBJECTIVITY_MARKERS = [
  /\bя\b/i,
  /\bменя\b/i,
  /\bмне\b/i,
  /\bмой\b/i,
  /\bмоя\b/i,
  /\bмоё\b/i,
  /\bмои\b/i,
  /\bмоем\b/i,
  /\bмоём\b/i,
  /\bмы\b/i,
  /\bнаш\b/i,
  /\bнаша\b/i,
  /\bнаши\b/i,
  /на моём опыте/i,
  /на моем опыте/i,
  /я заметил/i,
  /я проверил/i,
  /честно говоря/i,
  /по моим наблюдениям/i,
];

export function stripHtmlArtifacts(text: string): string {
  return text
    .replace(/<\/?(div|span|section|article)[^>]*>/gi, '')
    .replace(/\s*class=["'][^"']*(markdown-body|katex-html)[^"']*["']/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeEmDashes(text: string): string {
  const maxAllowed = Math.max(1, Math.floor(text.length / 1000));
  let count = 0;
  return text.replace(/ — /g, () => {
    count += 1;
    if (count <= maxAllowed) {
      return ' — ';
    }
    return count % 2 === 0 ? ', ' : ': ';
  });
}

export function autoCleanArticleText(text: string): string {
  let cleaned = stripHtmlArtifacts(text);
  cleaned = normalizeEmDashes(cleaned);
  return cleaned;
}

export function splitParagraphs(markdownOrText: string): string[] {
  return markdownOrText
    .replace(/^#{1,6}\s+/gm, '')
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('!['));
}

export function splitSentences(text: string): string[] {
  const plain = text
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, ' ');
  return plain
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2);
}

export function computeTextFingerprint(text: string): {
  avgSentenceLen: number;
  avgParagraphSentences: number;
  subjectivityScore: number;
} {
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const avgSentenceLen =
    sentences.length > 0
      ? sentences.reduce((acc, s) => acc + s.split(/\s+/).filter(Boolean).length, 0) / sentences.length
      : 0;
  const avgParagraphSentences =
    paragraphs.length > 0
      ? paragraphs.reduce((acc, p) => acc + Math.max(1, splitSentences(p).length), 0) / paragraphs.length
      : 0;
  const subHits = SUBJECTIVITY_MARKERS.reduce((acc, rx) => acc + (rx.test(text) ? 1 : 0), 0);
  const subjectivityScore = Math.min(1, Number((subHits / 4).toFixed(2)));
  return {
    avgSentenceLen: Number(avgSentenceLen.toFixed(1)),
    avgParagraphSentences: Number(avgParagraphSentences.toFixed(1)),
    subjectivityScore,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getWordNgrams(text: string, n = 7): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(' '));
  }
  return set;
}

export function markdownToCleanHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  const formatInline = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    if (line.startsWith('### ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else if (line.startsWith('> ')) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
    } else {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<p>${formatInline(line)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push('</ul>');
  }
  return htmlParts.join('\n');
}

export function runFinalValidator(
  markdown: string,
  rawHtml: string,
  ragSamples: RagSample[],
  articleEmbedding: number[] | null,
): ValidatorReport {
  const lower = markdown.toLowerCase();
  const charCount = markdown.replace(/\s+/g, ' ').trim().length;

  // 1. Лексические штампы (0 вхождений)
  const clicheMatches = BANNED_CLICHES.filter((c) => lower.includes(c));

  // 2. Длина предложений (нет двух подряд одинаковых ±2 слова)
  const sentences = splitSentences(markdown);
  const sentenceWordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  let similarPairs = 0;
  for (let i = 1; i < sentenceWordCounts.length; i++) {
    if (Math.abs(sentenceWordCounts[i] - sentenceWordCounts[i - 1]) <= 2) {
      similarPairs += 1;
    }
  }
  const sentenceDeltaOk = sentences.length >= 6 && similarPairs <= Math.max(2, Math.floor(sentences.length * 0.18));

  // 3. Абзацы (нет 3 подряд одинаковой структуры по числу предложений)
  const paragraphs = splitParagraphs(markdown);
  const paraLengths = paragraphs.map((p) => Math.max(1, splitSentences(p).length));
  let uniformParaStreaks = 0;
  for (let i = 2; i < paraLengths.length; i++) {
    if (paraLengths[i] === paraLengths[i - 1] && paraLengths[i - 1] === paraLengths[i - 2]) {
      uniformParaStreaks += 1;
    }
  }

  // 4. Конкретика (цифры, имена, кейсы в блоках)
  const blocks = markdown.split(/\n##\s+/).filter((b) => b.trim().length > 40);
  const checkBlocks = blocks.length > 0 ? blocks : paragraphs;
  const blocksWithoutConcrete = checkBlocks.filter(
    (b) => !/\d+/.test(b) && !/[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}/.test(b) && !/например|случай|история|проверил|руб|%|минут|лет|года/i.test(b),
  ).length;

  // 5. Субъективность
  const subMatches = SUBJECTIVITY_MARKERS.filter((rx) => rx.test(markdown)).length;

  // 6. Em-dash <= 1 на 1000 знаков
  const emDashCount = (markdown.match(/—/g) || []).length;
  const maxEmDash = Math.max(1, Math.floor(charCount / 1000));

  // 7. HTML-артефакты = 0
  const htmlArtifacts = (rawHtml + '\n' + markdown).match(/<(div|span)[^>]*>|markdown-body|katex-html/gi) || [];

  // 8. Стилевая близость к RAG
  let maxSimilarity = 0;
  let ragMode = 'fingerprint';
  if (articleEmbedding && articleEmbedding.length > 0) {
    for (const sample of ragSamples) {
      try {
        const emb = JSON.parse(sample.embedding_json || '[]') as number[];
        if (emb.length === articleEmbedding.length) {
          ragMode = 'embedding';
          const sim = cosineSimilarity(articleEmbedding, emb);
          if (sim > maxSimilarity) maxSimilarity = sim;
        }
      } catch {
        // ignore
      }
    }
  }
  if (ragMode === 'fingerprint' && ragSamples.length > 0) {
    const fp = computeTextFingerprint(markdown);
    const sample = ragSamples[0];
    const diff = Math.abs(fp.avgSentenceLen - (sample.avg_sentence_len || 12));
    maxSimilarity = Math.max(0.55, Number((0.92 - diff * 0.025).toFixed(2)));
  }

  // 9. Объём 3500–5500 знаков
  const lengthOk = charCount >= 3500 && charCount <= 5500;

  // 10. Смысловая оригинальность (нет длинных совпадений 7-gram с RAG)
  const articleNgrams = getWordNgrams(markdown, 7);
  let overlapCount = 0;
  for (const sample of ragSamples) {
    const sampleNgrams = getWordNgrams(sample.content, 7);
    for (const ng of sampleNgrams) {
      if (articleNgrams.has(ng)) {
        overlapCount += 1;
      }
    }
  }

  // Проверка первых 3 абзацев (нет воды, есть крючок/цифра/вопрос)
  const firstThree = paragraphs.slice(0, 3).join(' ');
  const firstThreeHasHook =
    firstThree.length >= 180 &&
    (/\d+/.test(firstThree) || /\?/.test(firstThree) || SUBJECTIVITY_MARKERS.some((rx) => rx.test(firstThree)));

  const checks: ValidatorCheckItem[] = [
    {
      id: 1,
      code: 'cliches',
      label: 'Лексические штампы',
      criterion: '0 вхождений запрещённых вводных и воды',
      status: clicheMatches.length === 0 ? 'pass' : 'fail',
      actual: `${clicheMatches.length} шт.`,
      action: 'Блок → Стилист',
      details: clicheMatches.length > 0 ? `Найдено: ${clicheMatches.slice(0, 5).join(', ')}` : 'Штампы не обнаружены',
    },
    {
      id: 2,
      code: 'burstiness',
      label: 'Длина предложений (ритм)',
      criterion: 'Чередование длин, минимум повторов ±2 слова',
      status: sentenceDeltaOk ? 'pass' : 'fail',
      actual: `${similarPairs} близких пар из ${sentences.length}`,
      action: 'Блок → Стилист',
      details: sentenceDeltaOk ? 'Живой рваный ритм выдержан' : 'Слишком много однородных по длине фраз подряд',
    },
    {
      id: 3,
      code: 'paragraphs',
      label: 'Разнообразие абзацев',
      criterion: 'Нет 3 подряд абзацев одинаковой структуры',
      status: uniformParaStreaks === 0 ? 'pass' : 'fail',
      actual: `${uniformParaStreaks} серий`,
      action: 'Блок → Стилист',
      details: uniformParaStreaks === 0 ? 'Абзацы меняют объём естественно' : 'Обнаружены монотонные серии абзацев',
    },
    {
      id: 4,
      code: 'concreteness',
      label: 'Конкретика и факты',
      criterion: 'В каждом разделе ≥1 цифра, имя или кейс',
      status: blocksWithoutConcrete === 0 ? 'pass' : 'warn',
      actual: `${checkBlocks.length - blocksWithoutConcrete}/${checkBlocks.length} блоков`,
      action: 'Блок → Инжектор',
      details: blocksWithoutConcrete === 0 ? 'Каждый блок подкреплён примерами' : 'Есть разделы с общими формулировками',
    },
    {
      id: 5,
      code: 'subjectivity',
      label: 'Субъективность автора',
      criterion: 'Присутствие живого голоса («я / мы / мой опыт»)',
      status: subMatches >= 2 ? 'pass' : 'warn',
      actual: `${subMatches} маркеров`,
      action: 'Блок → Инжектор',
      details: subMatches >= 2 ? 'Позиция автора выражена чётко' : 'Текст звучит слишком отстранённо',
    },
    {
      id: 6,
      code: 'em_dash',
      label: 'Плотность длинного тире (—)',
      criterion: `≤ 1 на 1000 знаков (лимит ${maxEmDash})`,
      status: emDashCount <= maxEmDash ? 'pass' : 'fail',
      actual: `${emDashCount} шт.`,
      action: 'Автозамена',
      details: emDashCount <= maxEmDash ? 'В пределах нормы' : 'Превышение порога AI-пунктуации',
    },
    {
      id: 7,
      code: 'html_artifacts',
      label: 'Чистота от HTML-артефактов',
      criterion: '0 вхождений div/span/markdown-body/katex',
      status: htmlArtifacts.length === 0 ? 'pass' : 'fail',
      actual: `${htmlArtifacts.length} шт.`,
      action: 'Автоочистка',
      details: htmlArtifacts.length === 0 ? 'Разметка чиста для Дзен-Студии' : 'Обнаружен мусорный HTML',
    },
    {
      id: 8,
      code: 'rag_similarity',
      label: 'Стилевая близость к RAG',
      criterion: 'Соответствие ритму образцов ниши (0.60–0.92)',
      status: ragSamples.length === 0 ? 'warn' : maxSimilarity >= 0.58 && maxSimilarity <= 0.94 ? 'pass' : 'warn',
      actual: ragSamples.length === 0 ? 'Нет образцов' : `${maxSimilarity.toFixed(2)}`,
      action: 'Флаг → Ручная',
      details: ragSamples.length === 0 ? 'Добавьте образцы в Библиотеку RAG для точной сверки' : `Режим сверки: ${ragMode}`,
    },
    {
      id: 9,
      code: 'length',
      label: 'Объём статьи',
      criterion: '3500–5500 знаков (оптимум ~4500)',
      status: lengthOk ? 'pass' : charCount >= 3000 && charCount <= 6200 ? 'warn' : 'fail',
      actual: `${charCount} зн.`,
      action: 'Блок → Писатель',
      details: lengthOk ? 'Оптимально под время дочитывания' : 'Отклонение от целевого коридора знаков',
    },
    {
      id: 10,
      code: 'originality',
      label: 'Смысловая оригинальность',
      criterion: '0 длинных совпадений с образцами RAG',
      status: overlapCount === 0 ? 'pass' : 'fail',
      actual: `${overlapCount} совпадений`,
      action: 'Блок → Писатель',
      details: overlapCount === 0 ? 'Заимствований формулировок нет' : 'Найдено копирование фраз из эталона',
    },
  ];

  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const hasFail = checks.some((c) => c.status === 'fail');

  let overallStatus: ValidatorReport['overall_status'] = 'ready';
  if (clicheMatches.length > 0 || !sentenceDeltaOk || uniformParaStreaks > 0) {
    overallStatus = 'needs_humanizer';
  } else if (blocksWithoutConcrete > 0 || subMatches < 2) {
    overallStatus = 'needs_injector';
  } else if (hasFail) {
    overallStatus = 'needs_rewrite';
  } else if (checks.some((c) => c.status === 'warn')) {
    overallStatus = 'manual_check';
  }

  return {
    passed_count: passedCount,
    total_count: 10,
    overall_status: overallStatus,
    char_count: charCount,
    em_dash_count: emDashCount,
    cliche_matches: clicheMatches,
    checks,
    first_three_paragraphs_ok: firstThreeHasHook,
  };
}
