import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, Niche } from './types.ts';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'dzen.db');
export const UPLOADS_IMAGES_DIR = IMAGES_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS niches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rpm_range TEXT NOT NULL DEFAULT '',
    growth_note TEXT NOT NULL DEFAULT '',
    ai_fit TEXT NOT NULL DEFAULT 'Высокий',
    default_tone TEXT NOT NULL DEFAULT '',
    cpa_notes TEXT NOT NULL DEFAULT '',
    is_top10 INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cpa_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    anchor_text TEXT NOT NULL,
    payout_note TEXT NOT NULL DEFAULT '',
    pitch_hint TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    angle TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    source_url TEXT NOT NULL DEFAULT '',
    demand_score INTEGER NOT NULL DEFAULT 70,
    competition_score INTEGER NOT NULL DEFAULT 50,
    niche_fit_score INTEGER NOT NULL DEFAULT 80,
    cpa_score INTEGER NOT NULL DEFAULT 65,
    priority_score INTEGER NOT NULL DEFAULT 70,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rag_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    niche_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    style_summary TEXT NOT NULL DEFAULT '',
    embedding_json TEXT NOT NULL DEFAULT '[]',
    avg_sentence_len REAL NOT NULL DEFAULT 0,
    avg_paragraph_sentences REAL NOT NULL DEFAULT 0,
    subjectivity_score REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    niche_id INTEGER NOT NULL,
    cpa_offer_id INTEGER,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    rubric TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    preview_description TEXT NOT NULL DEFAULT '',
    provider_used TEXT NOT NULL DEFAULT 'gemini',
    status TEXT NOT NULL DEFAULT 'queued',
    current_stage INTEGER NOT NULL DEFAULT 0,
    stages_json TEXT NOT NULL DEFAULT '[]',
    strategist_brief_json TEXT NOT NULL DEFAULT '{}',
    seo_core_json TEXT NOT NULL DEFAULT '{}',
    architect_plan TEXT NOT NULL DEFAULT '',
    draft_text TEXT NOT NULL DEFAULT '',
    stylist_text TEXT NOT NULL DEFAULT '',
    final_markdown TEXT NOT NULL DEFAULT '',
    final_html TEXT NOT NULL DEFAULT '',
    validator_json TEXT NOT NULL DEFAULT '{}',
    factcheck_flags_json TEXT NOT NULL DEFAULT '[]',
    images_json TEXT NOT NULL DEFAULT '[]',
    telegram_status TEXT NOT NULL DEFAULT 'not_sent',
    telegram_message_id TEXT NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL,
    FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE,
    FOREIGN KEY (cpa_offer_id) REFERENCES cpa_offers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const TOP10_NICHES: Array<Omit<Niche, 'id' | 'created_at'>> = [
  {
    name: 'Психология и саморазвитие',
    rpm_range: '₽120–260',
    growth_note: '+38% рост просмотров; быстрый набор охватов',
    ai_fit: 'Высокий',
    default_tone: 'Доверительный, наблюдательный, от первого лица с жизненными сценами',
    cpa_notes: 'Онлайн-курсы, консультации психологов, книги и трекеры привычек',
    is_top10: 1,
  },
  {
    name: 'Личные финансы и инвестиции',
    rpm_range: '₽180–420',
    growth_note: '+27% просмотров; +55% к финансам в целом',
    ai_fit: 'Средний (нужен строгий фактчекинг)',
    default_tone: 'Прагматичный, с расчётами в рублях и личными кейсами экономии',
    cpa_notes: 'Дебетовые карты, вклады, брокерские счета (CPA до 3000 ₽ за заявку)',
    is_top10: 1,
  },
  {
    name: 'Истории, рассказы, влоги',
    rpm_range: 'Зависит от вовлечённости',
    growth_note: 'Лидер по времени чтения: 5,5 мин (прогрев алгоритма)',
    ai_fit: 'Высокий',
    default_tone: 'Живое повествование, диалоги, бытовые детали и интрига в первых 3 абзацах',
    cpa_notes: 'Нативные рекомендации сервисов и подписок в развязке',
    is_top10: 1,
  },
  {
    name: 'Технологии и обзоры ИИ',
    rpm_range: '₽150–340',
    growth_note: 'Тема на пике интереса, высокая глубина дочитывания',
    ai_fit: 'Средний (обязательны тесты и цифры)',
    default_tone: 'Практический разбор «проверил руками», без рекламных штампов',
    cpa_notes: 'SaaS-сервисы, образовательные курсы, гаджеты и маркетплейсы',
    is_top10: 1,
  },
  {
    name: 'Бизнес и предпринимательство',
    rpm_range: '₽180–380',
    growth_note: 'Высокая стоимость аудитории и платежеспособные читатели',
    ai_fit: 'Средний',
    default_tone: 'Деловой разбор цифр, ошибок, маржи и реальных кейсов',
    cpa_notes: 'РКО для ИП, бухгалтерские сервисы, CRM и бизнес-обучение',
    is_top10: 1,
  },
  {
    name: 'МФО и займы',
    rpm_range: 'CPA ₽500–1200 за лид',
    growth_note: 'Стабильный спрос (повышенный риск модерации правил)',
    ai_fit: 'Высокий (требуется аккуратная подача без давления)',
    default_tone: 'Осторожный финансовый ликбез, сравнение переплат и подводных камней',
    cpa_notes: 'Офферы подбора займов и проверки кредитной истории',
    is_top10: 1,
  },
  {
    name: 'Кино-разборы и сериалы',
    rpm_range: '₽60–130',
    growth_note: '45–60 дней до первых денег; стабильный поисковый хвост',
    ai_fit: 'Средний',
    default_tone: 'Внимательный зритель, разбор деталей сцен и мотивации героев',
    cpa_notes: 'Онлайн-кинотеатры и подписки на стриминги',
    is_top10: 1,
  },
  {
    name: 'Городские легенды / spooky',
    rpm_range: '₽70–150',
    growth_note: 'Созревание 40–55 дней; «тёмная лошадка» с высоким дочитыванием',
    ai_fit: 'Высокий',
    default_tone: 'Атмосферный документальный очерк с конкретными локациями и датами',
    cpa_notes: 'Аудиокниги, квесты, тематические подборки',
    is_top10: 1,
  },
  {
    name: 'Саммари книг и идей',
    rpm_range: '₽90–180',
    growth_note: '50–70 дней до старта; высокий процент сохранений',
    ai_fit: 'Высокий',
    default_tone: 'Выжимка идей с авторской проверкой «что сработало на мне»',
    cpa_notes: 'Книжные подписки, электронные библиотеки, маркетплейсы',
    is_top10: 1,
  },
  {
    name: 'Альтернативная история «что если»',
    rpm_range: '₽80–160',
    growth_note: '50–65 дней до старта; активные дискуссии в комментариях',
    ai_fit: 'Высокий',
    default_tone: 'Увлекательная историческая гипотеза с опорой на реальные факты',
    cpa_notes: 'Исторические лектории, книги, документальные подписки',
    is_top10: 1,
  },
];

function seedDatabase() {
  const existingNiches = db.prepare('SELECT COUNT(*) as count FROM niches').get() as { count: number };
  if (existingNiches.count === 0) {
    const insertNiche = db.prepare(`
      INSERT INTO niches (name, rpm_range, growth_note, ai_fit, default_tone, cpa_notes, is_top10)
      VALUES (@name, @rpm_range, @growth_note, @ai_fit, @default_tone, @cpa_notes, @is_top10)
    `);
    const tx = db.transaction(() => {
      for (const n of TOP10_NICHES) {
        insertNiche.run(n);
      }
    });
    tx();
  }

  const existingSamples = db.prepare('SELECT COUNT(*) as count FROM rag_samples').get() as { count: number };
  if (existingSamples.count === 0) {
    const psych = db.prepare('SELECT id FROM niches WHERE name = ?').get('Психология и саморазвитие') as { id: number } | undefined;
    const fin = db.prepare('SELECT id FROM niches WHERE name = ?').get('Личные финансы и инвестиции') as { id: number } | undefined;
    const story = db.prepare('SELECT id FROM niches WHERE name = ?').get('Истории, рассказы, влоги') as { id: number } | undefined;

    const insertSample = db.prepare(`
      INSERT INTO rag_samples (niche_id, title, content, style_summary, avg_sentence_len, avg_paragraph_sentences, subjectivity_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (psych) {
      insertSample.run(
        psych.id,
        'Почему мы выгораем именно в те недели, когда вроде бы ничего сложного не делали',
        'В прошлый четверг я закрыл ноутбук в три часа дня и поймал странное чувство. Вроде бы за неделю не было ни одного аврала, ни одного ночного созвона, даже кофе пил спокойно. А голова гудит так, будто разгружал вагон.\n\nЗнакомая история? Мы привыкли мерить усталость крупными задачами. Мол, если сдал квартальный отчёт — имеешь право лежать пластом. А если просто отвечал на сорок мелких сообщений в чатах и трижды переносил встречу с Игорем из соседнего отдела, то и уставать вроде не от чего.\n\nНа деле мозг тратит больше всего энергии не на глубокую работу, а на переключения. Психолог Глория Марк ещё в 2023 году замерила: после каждого короткого отвлечения человеку нужно в среднем 23 минуты, чтобы вернуться в прежний ритм. Вот и считайте. Пять невинных вопросов в мессенджере съедают почти два часа рабочего ресурса.',
        'Короткие заходы с личной сценой, рваный ритм (чередование 4–7 слов и 18–22 слов), конкретные имена и цифры.',
        12.4,
        2.6,
        0.85,
      );
    }

    if (fin) {
      insertSample.run(
        fin.id,
        'Я пересчитал свои мелкие траты за октябрь и нашёл 14 200 рублей, которые утекли незаметно',
        'Каждый раз, когда кто-то советует отказаться от утреннего кофе ради миллиона к пенсии, хочется закрыть вкладку. Ну честно. Не кофе виноват в том, что к 25-му числу на карте остаётся меньше десяти тысяч.\n\nЯ решил не гадать и выгрузил выписку из банка за октябрь в обычную таблицу. Без красивых приложений, просто столбец дат и сумм. Первая цифра меня слегка отрезвила: 14 200 рублей ушли не на крупные покупки, а на то, что я даже не запомнил.\n\nВот куда делись деньги. Четыре подписки, которыми я не пользовался с лета, списали 2 490 рублей. Ещё 4 800 улетели на спонтанные доставки еды после восьми вечера, когда лень было дойти до магазина в соседнем доме. Остальное добрали комиссии за переводы и платные уведомления, которые я забыл отключить на старой зарплатной карте.',
        'Прямой отказ от банальных советов в первом абзаце, точные суммы в рублях, короткие разговорные реплики.',
        13.1,
        2.8,
        0.9,
      );
    }

    if (story) {
      insertSample.run(
        story.id,
        'Сосед три месяца оставлял у моей двери пустую коробку из-под обуви — развязка удивила весь подъезд',
        'Первую коробку я увидел в конце сентября, когда выходил выносить мусор в семь утра. Обычная серая картонная коробка, размер сорок второй, без надписей. Стоит ровно у коврика квартиры напротив.\n\nСначала подумал: человек заказал ботинки, вынес картон и забыл прихватить к лифту. Ну бывает. На следующий день коробка исчезла. А через неделю появилась снова — уже другая, от зимних кроссовок.\n\nВ нашем подъезде на пятом этаже живут всего четыре квартиры. Дядя Витя из восемнадцатой почти не выходит, в двадцатой снимает жильё тихая студентка Алина, а в девятнадцатой полгода назад поселился Андрей. С ним мы только кивали друг другу у почтовых ящиков. Спрашивать в лоб про коробки как-то неловко, пока однажды в субботу я не столкнулся с ним прямо на лестнице.',
        'Сюжетный крючок с первых строк, точное время и детали быта, имена соседей, плавный накал интриги.',
        11.8,
        2.7,
        0.88,
      );
    }
  }

  const defaultSettings: AppSettings = {
    text_provider: 'gemini',
    text_model: 'gemini-4-hydrogen',
    image_provider: 'gemini',
    image_model: 'gemini-3.1-flash-lite-image',
    custom_openai_base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    custom_openai_model: 'gpt-4o-mini',
    topic_auto_approve_threshold: 78,
    target_char_count: 4500,
    telegram_enabled: false,
    telegram_channel_id: process.env.TELEGRAM_CHANNEL_ID || '',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, JSON.stringify(v));
  }
}

seedDatabase();

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = row.value;
    }
  }
  return {
    text_provider: (map.text_provider as AppSettings['text_provider']) || 'gemini',
    text_model: (map.text_model as string) || 'gemini-4-hydrogen',
    image_provider: (map.image_provider as AppSettings['image_provider']) || 'gemini',
    image_model: (map.image_model as string) || 'gemini-3.1-flash-lite-image',
    custom_openai_base_url: (map.custom_openai_base_url as string) || 'https://api.openai.com/v1',
    custom_openai_model: (map.custom_openai_model as string) || 'gpt-4o-mini',
    topic_auto_approve_threshold: Number(map.topic_auto_approve_threshold ?? 78),
    target_char_count: Number(map.target_char_count ?? 4500),
    telegram_enabled: Boolean(map.telegram_enabled ?? false),
    telegram_channel_id: (map.telegram_channel_id as string) || process.env.TELEGRAM_CHANNEL_ID || '',
  };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const tx = db.transaction(() => {
    for (const [key, val] of Object.entries(partial)) {
      if (val !== undefined) {
        upsert.run(key, JSON.stringify(val));
      }
    }
  });
  tx();
  return getSettings();
}
