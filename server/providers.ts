import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { AppSettings, ImageProviderId, ProviderStatus, TextProviderId } from './types.ts';

let geminiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export function getProviderStatuses(): ProviderStatus[] {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const hasZai = Boolean(process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasQwen = Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY);
  const hasMistral = Boolean(process.env.MISTRAL_API_KEY);
  const hasXai = Boolean(process.env.XAI_API_KEY);
  const hasTogether = Boolean(process.env.TOGETHER_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasYandex = Boolean(process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID);
  const hasKandinsky = Boolean(process.env.KANDINSKY_API_KEY && process.env.KANDINSKY_SECRET_KEY);
  const hasTelegram = Boolean(process.env.TELEGRAM_BOT_TOKEN);

  return [
    {
      id: 'gemini',
      name: 'Google Gemini (встроенный)',
      kind: 'text',
      configured: hasGemini,
      note: hasGemini ? 'GEMINI_API_KEY активен на сервере' : 'Задайте GEMINI_API_KEY в окружении',
      defaultModel: 'gemini-4-hydrogen',
    },
    {
      id: 'zai',
      name: 'Z.ai (Zhipu GLM)',
      kind: 'text',
      configured: hasZai,
      note: hasZai ? 'ZAI_API_KEY активен' : 'Задайте ZAI_API_KEY (или ZHIPU_API_KEY) в .env',
      defaultModel: 'glm-4.5',
    },
    {
      id: 'ollama',
      name: 'Ollama (локально / self-hosted)',
      kind: 'text',
      configured: true,
      note: process.env.OLLAMA_BASE_URL
        ? `OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL}`
        : 'Работает локально без ключа (URL задаётся в Настройках)',
      defaultModel: 'qwen2.5:14b',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      kind: 'text',
      configured: hasOpenRouter,
      note: hasOpenRouter ? 'OPENROUTER_API_KEY задан' : 'Задайте OPENROUTER_API_KEY в .env',
      defaultModel: 'openai/gpt-4o-mini',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      kind: 'text',
      configured: hasDeepSeek,
      note: hasDeepSeek ? 'DEEPSEEK_API_KEY задан' : 'Задайте DEEPSEEK_API_KEY в .env',
      defaultModel: 'deepseek-chat',
    },
    {
      id: 'openai',
      name: 'OpenAI / GPT',
      kind: 'text',
      configured: hasOpenAI,
      note: hasOpenAI ? 'OPENAI_API_KEY задан' : 'Задайте OPENAI_API_KEY в .env',
      defaultModel: 'gpt-4o',
    },
    {
      id: 'groq',
      name: 'Groq (LPU)',
      kind: 'text',
      configured: hasGroq,
      note: hasGroq ? 'GROQ_API_KEY задан' : 'Задайте GROQ_API_KEY в .env',
      defaultModel: 'llama-3.3-70b-versatile',
    },
    {
      id: 'qwen',
      name: 'Qwen (Alibaba DashScope)',
      kind: 'text',
      configured: hasQwen,
      note: hasQwen ? 'QWEN_API_KEY задан' : 'Задайте QWEN_API_KEY (или DASHSCOPE_API_KEY) в .env',
      defaultModel: 'qwen-plus',
    },
    {
      id: 'mistral',
      name: 'Mistral AI',
      kind: 'text',
      configured: hasMistral,
      note: hasMistral ? 'MISTRAL_API_KEY задан' : 'Задайте MISTRAL_API_KEY в .env',
      defaultModel: 'mistral-large-latest',
    },
    {
      id: 'xai',
      name: 'xAI (Grok)',
      kind: 'text',
      configured: hasXai,
      note: hasXai ? 'XAI_API_KEY задан' : 'Задайте XAI_API_KEY в .env',
      defaultModel: 'grok-3-mini',
    },
    {
      id: 'together',
      name: 'Together AI',
      kind: 'text',
      configured: hasTogether,
      note: hasTogether ? 'TOGETHER_API_KEY задан' : 'Задайте TOGETHER_API_KEY в .env',
      defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      kind: 'text',
      configured: hasAnthropic,
      note: hasAnthropic ? 'ANTHROPIC_API_KEY задан' : 'Задайте ANTHROPIC_API_KEY в .env',
      defaultModel: 'claude-3-5-sonnet-latest',
    },
    {
      id: 'yandex',
      name: 'YandexGPT',
      kind: 'text',
      configured: hasYandex,
      note: hasYandex ? 'YANDEX_API_KEY и YANDEX_FOLDER_ID заданы' : 'Задайте YANDEX_API_KEY и YANDEX_FOLDER_ID в .env',
      defaultModel: 'yandexgpt/latest',
    },
    {
      id: 'custom_openai',
      name: 'Кастомный OpenAI-совместимый API',
      kind: 'text',
      configured: Boolean(process.env.CUSTOM_OPENAI_API_KEY || hasOpenAI || hasDeepSeek || hasZai || hasOpenRouter),
      note: 'Использует выбранный Base URL и ключ CUSTOM_OPENAI_API_KEY / OPENAI_API_KEY',
      defaultModel: 'gpt-4o-mini',
    },
    {
      id: 'gemini_image',
      name: 'Gemini Image (Nano Banana)',
      kind: 'image',
      configured: hasGemini,
      note: hasGemini ? 'gemini-3.1-flash-lite-image / gemini-nano-banana-2.1' : 'Требуется GEMINI_API_KEY',
      defaultModel: 'gemini-3.1-flash-lite-image',
    },
    {
      id: 'zai_image',
      name: 'Z.ai CogView (Zhipu Images)',
      kind: 'image',
      configured: hasZai,
      note: hasZai ? 'ZAI_API_KEY активен (cogview-4-250304)' : 'Требуется ZAI_API_KEY',
      defaultModel: 'cogview-4-250304',
    },
    {
      id: 'kandinsky',
      name: 'Kandinsky (FusionBrain)',
      kind: 'image',
      configured: hasKandinsky,
      note: hasKandinsky ? 'KANDINSKY_API_KEY активен' : 'Задайте KANDINSKY_API_KEY и KANDINSKY_SECRET_KEY в .env',
      defaultModel: 'kandinsky-3.1',
    },
    {
      id: 'openai_image',
      name: 'OpenAI Images (DALL-E / gpt-image-1)',
      kind: 'image',
      configured: hasOpenAI,
      note: hasOpenAI ? 'OPENAI_API_KEY активен' : 'Задайте OPENAI_API_KEY в .env',
      defaultModel: 'gpt-image-1',
    },
    {
      id: 'telegram',
      name: 'Telegram Bot (@zen_sync_bot мост)',
      kind: 'telegram',
      configured: hasTelegram,
      note: hasTelegram ? 'TELEGRAM_BOT_TOKEN задан' : 'Задайте TELEGRAM_BOT_TOKEN в .env для опциональной публикации',
      defaultModel: 'Bot API',
    },
  ];
}

export interface TextGenerationOptions {
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
  useSearchGrounding?: boolean;
  useFastModel?: boolean;
  providerOverride?: TextProviderId;
  modelOverride?: string;
}

export interface TextGenerationResult {
  text: string;
  groundingUrls: Array<{ title: string; uri: string }>;
  providerUsed: string;
  tokensUsed: number;
  fallbackFrom?: string;
}

export function isTextProviderConfigured(provider: TextProviderId): boolean {
  switch (provider) {
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    case 'zai':
      return Boolean(process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY);
    case 'ollama':
      return true;
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    case 'deepseek':
      return Boolean(process.env.DEEPSEEK_API_KEY);
    case 'openrouter':
      return Boolean(process.env.OPENROUTER_API_KEY);
    case 'groq':
      return Boolean(process.env.GROQ_API_KEY);
    case 'qwen':
      return Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY);
    case 'mistral':
      return Boolean(process.env.MISTRAL_API_KEY);
    case 'xai':
      return Boolean(process.env.XAI_API_KEY);
    case 'together':
      return Boolean(process.env.TOGETHER_API_KEY);
    case 'anthropic':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case 'yandex':
      return Boolean(process.env.YANDEX_API_KEY && process.env.YANDEX_FOLDER_ID);
    case 'custom_openai':
      return Boolean(
        process.env.CUSTOM_OPENAI_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.DEEPSEEK_API_KEY ||
          process.env.ZAI_API_KEY ||
          process.env.OPENROUTER_API_KEY,
      );
    default:
      return false;
  }
}

function estimateTokens(systemInstruction: string, prompt: string, output: string): number {
  return Math.max(1, Math.ceil((systemInstruction.length + prompt.length + output.length) / 3.5));
}

interface ParsedProviderError {
  status: number | null;
  isQuotaOrRateLimit: boolean;
  isTransient: boolean;
  retryDelayMs: number | null;
  rawMessage: string;
}

function parseProviderError(err: unknown): ParsedProviderError {
  const raw = err instanceof Error ? err.message : String(err);
  let status: number | null = null;
  let message = raw;
  let retryDelayMs: number | null = null;

  const statusObj = (err as { status?: number })?.status;
  if (typeof statusObj === 'number') {
    status = statusObj;
  }

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        error?: {
          code?: number;
          message?: string;
          status?: string;
          details?: Array<{ retryDelay?: string }>;
        };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') status = parsed.error.code;
        if (parsed.error.message) message = parsed.error.message;
        const delayDetail = parsed.error.details?.find((d) => typeof d.retryDelay === 'string');
        if (delayDetail?.retryDelay) {
          const sec = parseFloat(delayDetail.retryDelay.replace(/s$/i, ''));
          if (Number.isFinite(sec) && sec > 0) {
            retryDelayMs = Math.round(sec * 1000);
          }
        }
      }
    }
  } catch {
    // keep raw message
  }

  if (status === null) {
    const m = raw.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
    if (m) status = Number(m[1]);
  }

  const lower = `${raw} ${message}`.toLowerCase();
  const isQuotaOrRateLimit =
    status === 429 || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate limit');
  const isTransient =
    isQuotaOrRateLimit ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    lower.includes('unavailable') ||
    lower.includes('timeout') ||
    lower.includes('econnreset');

  return {
    status,
    isQuotaOrRateLimit,
    isTransient,
    retryDelayMs,
    rawMessage: message.trim(),
  };
}

export function formatProviderError(provider: string, model: string, err: unknown): Error {
  const parsed = parseProviderError(err);
  if (parsed.isQuotaOrRateLimit) {
    const isDailyOrBilling = parsed.rawMessage.toLowerCase().includes('exceeded your current quota');
    const hint =
      provider === 'gemini'
        ? 'Проверьте лимиты/биллинг Gemini API, выберите лёгкую модель gemini-3.1-flash-lite или переключите провайдер текста в «Настройках» (OpenAI / DeepSeek / Кастомный OpenAI).'
        : 'Подождите 30–60 секунд и повторите этап, либо проверьте баланс/лимиты выбранного провайдера в «Настройках».';
    return new Error(
      isDailyOrBilling
        ? `Превышена квота API провайдера ${provider} (${model}, код 429 RESOURCE_EXHAUSTED). ${hint}`
        : `Достигнут лимит запросов в минуту у провайдера ${provider} (${model}, код 429). ${hint}`,
    );
  }
  if (parsed.status === 401 || parsed.status === 403 || parsed.rawMessage.toLowerCase().includes('api_key_invalid')) {
    return new Error(
      `Ошибка доступа к провайдеру ${provider} (${parsed.status || 403}): проверьте корректность API-ключа на сервере.`,
    );
  }
  if (parsed.status === 404) {
    return new Error(
      `Модель или эндпоинт "${model}" не найден у провайдера ${provider} (404). Проверьте имя модели и Base URL в «Настройках».`,
    );
  }
  return new Error(`Ошибка ${provider} (${model}): ${parsed.rawMessage.slice(0, 320)}`);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const parsed = parseProviderError(err);
      if (!parsed.isTransient || i >= retries) {
        break;
      }
      const waitMs =
        parsed.retryDelayMs && parsed.retryDelayMs <= 12000
          ? parsed.retryDelayMs + 400
          : parsed.isQuotaOrRateLimit
            ? 2500 * (i + 1)
            : 1000 * (i + 1);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function callGeminiModel(
  ai: GoogleGenAI,
  targetModel: string,
  opts: TextGenerationOptions,
): Promise<TextGenerationResult> {
  const config: Record<string, unknown> = {
    systemInstruction: opts.systemInstruction,
  };

  if (targetModel === 'gemini-4-hydrogen') {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
  }
  if (opts.jsonMode && !opts.useSearchGrounding) {
    config.responseMimeType = 'application/json';
  }
  if (opts.useSearchGrounding) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: targetModel,
      contents: opts.prompt,
      config,
    }),
  );

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundingUrls = chunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
    .map((w) => ({ uri: w.uri, title: w.title || w.uri }));

  const text = (response.text ?? '').trim();
  const usageTotal =
    response.usageMetadata?.totalTokenCount ||
    estimateTokens(opts.systemInstruction, opts.prompt, text);

  return {
    text,
    groundingUrls,
    providerUsed: `gemini:${targetModel}`,
    tokensUsed: Number(usageTotal) || 0,
  };
}

const SAME_PROVIDER_LIGHT_MODEL: Partial<Record<TextProviderId, { fromNotEqual: string; to: string }>> = {
  gemini: { fromNotEqual: 'gemini-3.1-flash-lite', to: 'gemini-3.1-flash-lite' },
  openai: { fromNotEqual: 'gpt-4o-mini', to: 'gpt-4o-mini' },
  zai: { fromNotEqual: 'glm-4.5-flash', to: 'glm-4.5-flash' },
  qwen: { fromNotEqual: 'qwen-turbo', to: 'qwen-turbo' },
  mistral: { fromNotEqual: 'mistral-small-latest', to: 'mistral-small-latest' },
  xai: { fromNotEqual: 'grok-3-mini', to: 'grok-3-mini' },
  anthropic: { fromNotEqual: 'claude-3-5-haiku-latest', to: 'claude-3-5-haiku-latest' },
};

async function generateTextSingle(
  settings: AppSettings,
  provider: TextProviderId,
  model: string,
  opts: TextGenerationOptions,
): Promise<TextGenerationResult> {
  if (provider === 'gemini') {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY не настроен на сервере. Добавьте ключ в окружение или выберите другой провайдер в «Настройках».');
    }
    const validGeminiModels = ['gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon', 'gemini-3.1-flash-lite'];
    const targetModel = validGeminiModels.includes(model) ? model : 'gemini-4-hydrogen';

    try {
      return await callGeminiModel(ai, targetModel, opts);
    } catch (err) {
      const parsed = parseProviderError(err);
      if (parsed.isQuotaOrRateLimit && targetModel !== 'gemini-3.1-flash-lite') {
        try {
          return await callGeminiModel(ai, 'gemini-3.1-flash-lite', opts);
        } catch (fallbackErr) {
          throw formatProviderError('gemini', `${targetModel} / gemini-3.1-flash-lite`, fallbackErr);
        }
      }
      throw formatProviderError('gemini', targetModel, err);
    }
  }

  const openAiCompatibleSet = new Set<TextProviderId>([
    'zai',
    'ollama',
    'openai',
    'deepseek',
    'openrouter',
    'groq',
    'qwen',
    'mistral',
    'xai',
    'together',
    'custom_openai',
  ]);

  if (openAiCompatibleSet.has(provider)) {
    const resolveConfig = (): {
      apiKey: string | undefined;
      requireKey: boolean;
      baseUrl: string;
      defaultModel: string;
      supportsJsonObject: boolean;
      extraHeaders?: Record<string, string>;
      envHint: string;
    } => {
      switch (provider) {
        case 'zai':
          return {
            apiKey: process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY,
            requireKey: true,
            baseUrl: process.env.ZAI_BASE_URL || process.env.ZHIPU_BASE_URL || 'https://api.z.ai/api/paas/v4',
            defaultModel: 'glm-4.5',
            supportsJsonObject: false,
            envHint: 'ZAI_API_KEY',
          };
        case 'ollama':
          return {
            apiKey: process.env.OLLAMA_API_KEY,
            requireKey: false,
            baseUrl: settings.ollama_base_url || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
            defaultModel: 'qwen2.5:14b',
            supportsJsonObject: false,
            envHint: 'OLLAMA_BASE_URL',
          };
        case 'deepseek':
          return {
            apiKey: process.env.DEEPSEEK_API_KEY,
            requireKey: true,
            baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
            defaultModel: 'deepseek-chat',
            supportsJsonObject: true,
            envHint: 'DEEPSEEK_API_KEY',
          };
        case 'openrouter':
          return {
            apiKey: process.env.OPENROUTER_API_KEY,
            requireKey: true,
            baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
            defaultModel: 'openai/gpt-4o-mini',
            supportsJsonObject: false,
            extraHeaders: {
              'HTTP-Referer': process.env.APP_URL || 'http://igrovoikompas.ru/dzen/',
              'X-Title': 'Dzen AI Studio',
            },
            envHint: 'OPENROUTER_API_KEY',
          };
        case 'groq':
          return {
            apiKey: process.env.GROQ_API_KEY,
            requireKey: true,
            baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
            defaultModel: 'llama-3.3-70b-versatile',
            supportsJsonObject: true,
            envHint: 'GROQ_API_KEY',
          };
        case 'qwen':
          return {
            apiKey: process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY,
            requireKey: true,
            baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
            defaultModel: 'qwen-plus',
            supportsJsonObject: true,
            envHint: 'QWEN_API_KEY',
          };
        case 'mistral':
          return {
            apiKey: process.env.MISTRAL_API_KEY,
            requireKey: true,
            baseUrl: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
            defaultModel: 'mistral-large-latest',
            supportsJsonObject: true,
            envHint: 'MISTRAL_API_KEY',
          };
        case 'xai':
          return {
            apiKey: process.env.XAI_API_KEY,
            requireKey: true,
            baseUrl: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
            defaultModel: 'grok-3-mini',
            supportsJsonObject: true,
            envHint: 'XAI_API_KEY',
          };
        case 'together':
          return {
            apiKey: process.env.TOGETHER_API_KEY,
            requireKey: true,
            baseUrl: process.env.TOGETHER_BASE_URL || 'https://api.together.xyz/v1',
            defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
            supportsJsonObject: false,
            envHint: 'TOGETHER_API_KEY',
          };
        case 'custom_openai':
          return {
            apiKey:
              process.env.CUSTOM_OPENAI_API_KEY ||
              process.env.OPENAI_API_KEY ||
              process.env.DEEPSEEK_API_KEY ||
              process.env.ZAI_API_KEY ||
              process.env.OPENROUTER_API_KEY,
            requireKey: true,
            baseUrl: settings.custom_openai_base_url || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultModel: settings.custom_openai_model || 'gpt-4o-mini',
            supportsJsonObject: false,
            envHint: 'CUSTOM_OPENAI_API_KEY или OPENAI_API_KEY',
          };
        case 'openai':
        default:
          return {
            apiKey: process.env.OPENAI_API_KEY,
            requireKey: true,
            baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultModel: 'gpt-4o',
            supportsJsonObject: true,
            envHint: 'OPENAI_API_KEY',
          };
      }
    };

    const cfg = resolveConfig();
    if (cfg.requireKey && !cfg.apiKey) {
      throw new Error(`API-ключ для провайдера "${provider}" (${cfg.envHint}) не задан в .env сервера.`);
    }

    const baseUrl = cfg.baseUrl.trim().replace(/\/+$/, '');
    const targetModel = provider === 'custom_openai' ? settings.custom_openai_model || cfg.defaultModel : model || cfg.defaultModel;

    const isResponsesApi = baseUrl.endsWith('/responses');
    const endpoint =
      isResponsesApi || baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

    const body: Record<string, unknown> = isResponsesApi
      ? {
          model: targetModel,
          instructions: opts.systemInstruction,
          input: opts.prompt,
        }
      : {
          model: targetModel,
          messages: [
            { role: 'system', content: opts.systemInstruction },
            { role: 'user', content: opts.prompt },
          ],
        };

    if (opts.jsonMode && !isResponsesApi && cfg.supportsJsonObject) {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(cfg.extraHeaders || {}),
    };
    if (cfg.apiKey) {
      headers.Authorization = `Bearer ${cfg.apiKey}`;
    }

    let res;
    try {
      res = await withRetry(async () => {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const errText = await r.text();
          throw new Error(`Ошибка ${provider} (${r.status}): ${errText.slice(0, 300)}`);
        }
        return r.json() as Promise<{
          output_text?: string;
          output?: Array<{ content?: Array<{ text?: string }> }>;
          choices?: Array<{ message?: { content?: string } }>;
          text?: string;
          response?: string;
          usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
        }>;
      });
    } catch (err) {
      if (provider === 'ollama') {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('fetch failed') || msg.toLowerCase().includes('econnrefused')) {
          throw new Error(
            `Не удалось подключиться к Ollama по адресу ${baseUrl}. Убедитесь, что Ollama запущен (для Docker на VPS используйте http://host.docker.internal:11434/v1 и OLLAMA_HOST=0.0.0.0).`,
          );
        }
      }
      throw formatProviderError(provider, targetModel, err);
    }

    const outputFromBlocks = Array.isArray(res.output)
      ? res.output
          .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
          .map((part) => part.text || '')
          .join('')
      : '';

    const extractedText = (
      res.choices?.[0]?.message?.content ||
      res.output_text ||
      outputFromBlocks ||
      res.response ||
      res.text ||
      ''
    ).trim();

    const tokensUsed =
      res.usage?.total_tokens ||
      ((res.usage?.prompt_tokens || 0) + (res.usage?.completion_tokens || 0)) ||
      estimateTokens(opts.systemInstruction, opts.prompt, extractedText);

    return {
      text: extractedText,
      groundingUrls: [],
      providerUsed: `${provider}:${targetModel}`,
      tokensUsed: Number(tokensUsed) || 0,
    };
  }

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY не задан в переменных окружения сервера.');
    }
    const targetModel = model.startsWith('claude') ? model : 'claude-3-5-sonnet-latest';
    const res = await withRetry(async () => {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: 4096,
          system: opts.systemInstruction,
          messages: [{ role: 'user', content: opts.prompt }],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Ошибка Anthropic (${r.status}): ${errText.slice(0, 300)}`);
      }
      return r.json() as Promise<{
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      }>;
    });

    const text = (res.content?.[0]?.text || '').trim();
    const tokensUsed =
      ((res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0)) ||
      estimateTokens(opts.systemInstruction, opts.prompt, text);

    return {
      text,
      groundingUrls: [],
      providerUsed: `anthropic:${targetModel}`,
      tokensUsed,
    };
  }

  if (provider === 'yandex') {
    const apiKey = process.env.YANDEX_API_KEY;
    const folderId = process.env.YANDEX_FOLDER_ID;
    if (!apiKey || !folderId) {
      throw new Error('YANDEX_API_KEY или YANDEX_FOLDER_ID не заданы в переменных окружения сервера.');
    }
    const modelUri = `gpt://${folderId}/${model.includes('yandex') ? model : 'yandexgpt/latest'}`;
    const res = await withRetry(async () => {
      const r = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${apiKey}`,
          'x-folder-id': folderId,
        },
        body: JSON.stringify({
          modelUri,
          completionOptions: { stream: false, temperature: 0.6, maxTokens: '3500' },
          messages: [
            { role: 'system', text: opts.systemInstruction },
            { role: 'user', text: opts.prompt },
          ],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Ошибка YandexGPT (${r.status}): ${errText.slice(0, 300)}`);
      }
      return r.json() as Promise<{
        result?: {
          alternatives?: Array<{ message?: { text?: string } }>;
          usage?: { totalTokens?: string | number };
        };
      }>;
    });

    const text = (res.result?.alternatives?.[0]?.message?.text || '').trim();
    const tokensUsed = Number(res.result?.usage?.totalTokens) || estimateTokens(opts.systemInstruction, opts.prompt, text);

    return {
      text,
      groundingUrls: [],
      providerUsed: `yandex:${modelUri}`,
      tokensUsed,
    };
  }

  throw new Error(`Неизвестный провайдер текста: ${provider}`);
}

export async function generateText(
  settings: AppSettings,
  opts: TextGenerationOptions,
): Promise<TextGenerationResult> {
  const primaryProvider = opts.providerOverride || settings.text_provider;
  const primaryModel =
    opts.modelOverride ||
    (opts.useFastModel && settings.fast_model?.trim() && !opts.providerOverride
      ? settings.fast_model.trim()
      : settings.text_model);

  let primaryError: unknown;
  try {
    return await generateTextSingle(settings, primaryProvider, primaryModel, opts);
  } catch (err) {
    primaryError = err;

    // 1. Попробовать облегчённую модель того же провайдера при 429/квоте
    if (settings.auto_fallback_enabled) {
      const lightRule = SAME_PROVIDER_LIGHT_MODEL[primaryProvider];
      if (lightRule && primaryModel !== lightRule.fromNotEqual && primaryProvider !== 'gemini') {
        const parsed = parseProviderError(err);
        if (parsed.isQuotaOrRateLimit) {
          try {
            const lightRes = await generateTextSingle(settings, primaryProvider, lightRule.to, opts);
            return { ...lightRes, fallbackFrom: `${primaryProvider}:${primaryModel}` };
          } catch {
            // move to cross-provider chain
          }
        }
      }
    }
  }

  // 2. Цепочка автопереключения на резервных поставщиков/модели
  if (
    settings.auto_fallback_enabled &&
    !opts.providerOverride &&
    Array.isArray(settings.fallback_providers) &&
    settings.fallback_providers.length > 0
  ) {
    const errors: string[] = [
      `${primaryProvider}:${primaryModel} → ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`,
    ];

    for (const target of settings.fallback_providers) {
      if (!target?.provider || !isTextProviderConfigured(target.provider)) {
        continue;
      }
      if (target.provider === primaryProvider && target.model === primaryModel) {
        continue;
      }
      try {
        const fallbackOpts: TextGenerationOptions = {
          ...opts,
          useSearchGrounding: target.provider === 'gemini' ? opts.useSearchGrounding : false,
        };
        const res = await generateTextSingle(settings, target.provider, target.model, fallbackOpts);
        return {
          ...res,
          fallbackFrom: `${primaryProvider}:${primaryModel}`,
        };
      } catch (fbErr) {
        errors.push(`${target.provider}:${target.model} → ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`);
      }
    }

    throw new Error(`Основной и резервные провайдеры недоступны. ${errors[0]}`);
  }

  throw primaryError instanceof Error ? primaryError : new Error(String(primaryError));
}

export async function testTextProvider(settings: AppSettings): Promise<{ ok: boolean; providerUsed?: string; sample?: string; error?: string }> {
  try {
    const res = await generateText(settings, {
      systemInstruction: 'Ответь кратко одним-двумя словами на русском: Связь ОК.',
      prompt: 'Проверка подключения к модели генерации.',
      providerOverride: settings.text_provider,
      modelOverride: settings.text_model,
    });
    return {
      ok: true,
      providerUsed: res.providerUsed,
      sample: res.text.slice(0, 120),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchOllamaModels(baseUrl: string): Promise<{ models: string[]; error?: string }> {
  const clean = (baseUrl || 'http://127.0.0.1:11434/v1').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const headers: Record<string, string> = {};
    if (process.env.OLLAMA_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OLLAMA_API_KEY}`;
    }
    const r = await fetch(`${clean}/api/tags`, { signal: controller.signal, headers });
    clearTimeout(timer);
    if (!r.ok) {
      return { models: [], error: `Ollama вернула статус ${r.status}` };
    }
    const data = (await r.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = (data.models || []).map((m) => m.name || m.model || '').filter(Boolean);
    return { models };
  } catch {
    clearTimeout(timer);
    return {
      models: [],
      error: `Нет ответа от Ollama (${clean}). Проверьте, что сервер запущен и доступен.`,
    };
  }
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const ai = getGeminiClient();
  if (!ai) return null;
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: text.slice(0, 6000),
    });
    const values = result.embeddings?.[0]?.values;
    return Array.isArray(values) ? values : null;
  } catch {
    return null;
  }
}

export async function generateImageBytes(
  settings: AppSettings,
  prompt: string,
  aspectRatio: '16:9' | '4:3' | '1:1',
): Promise<{ buffer: Buffer; mimeType: string; providerUsed: string }> {
  const provider: ImageProviderId = settings.image_provider;
  if (provider === 'disabled') {
    throw new Error('Генерация изображений отключена в настройках.');
  }

  if (provider === 'gemini') {
    const ai = getGeminiClient();
    if (!ai) {
      throw new Error('GEMINI_API_KEY не задан для генерации изображений.');
    }
    const targetModel =
      settings.image_model === 'gemini-nano-banana-2.1' || settings.image_model === 'gemini-3-pro-image'
        ? settings.image_model
        : 'gemini-3.1-flash-lite-image';

    let response;
    try {
      response = await withRetry(
        () =>
          ai.models.generateContent({
            model: targetModel,
            contents: { parts: [{ text: prompt }] },
            config: {
              imageConfig: {
                aspectRatio,
              },
            },
          }),
        1,
      );
    } catch (err) {
      throw formatProviderError('gemini_image', targetModel, err);
    }

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        return { buffer, mimeType, providerUsed: `gemini:${targetModel}` };
      }
    }
    throw new Error('Модель Gemini не вернула изображение.');
  }

  if (provider === 'zai') {
    const apiKey = process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY не задан для генерации изображений Z.ai CogView.');
    }
    const baseUrl = (process.env.ZAI_BASE_URL || process.env.ZHIPU_BASE_URL || 'https://api.z.ai/api/paas/v4')
      .trim()
      .replace(/\/+$/, '');
    const targetModel = settings.image_model || 'cogview-4-250304';
    const size = aspectRatio === '16:9' ? '1344x768' : aspectRatio === '4:3' ? '1152x864' : '1024x1024';
    const r = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: targetModel,
        prompt,
        size,
      }),
    });
    if (!r.ok) {
      throw new Error(`Ошибка Z.ai CogView (${r.status}): ${(await r.text()).slice(0, 200)}`);
    }
    const data = (await r.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png', providerUsed: `zai:${targetModel}` };
    }
    if (data.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url);
      const ab = await imgRes.arrayBuffer();
      return { buffer: Buffer.from(ab), mimeType: 'image/png', providerUsed: `zai:${targetModel}` };
    }
    throw new Error('Z.ai CogView не вернул изображение.');
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY не задан для генерации изображений.');
    }
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const size = aspectRatio === '16:9' ? '1536x1024' : '1024x1024';
    const r = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.image_model || 'gpt-image-1',
        prompt,
        size,
        response_format: 'b64_json',
      }),
    });
    if (!r.ok) {
      throw new Error(`Ошибка OpenAI Images (${r.status}): ${(await r.text()).slice(0, 200)}`);
    }
    const data = (await r.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      return { buffer: Buffer.from(b64, 'base64'), mimeType: 'image/png', providerUsed: 'openai:images' };
    }
    if (data.data?.[0]?.url) {
      const imgRes = await fetch(data.data[0].url);
      const ab = await imgRes.arrayBuffer();
      return { buffer: Buffer.from(ab), mimeType: 'image/png', providerUsed: 'openai:images' };
    }
    throw new Error('OpenAI не вернул изображение.');
  }

  if (provider === 'kandinsky') {
    const key = process.env.KANDINSKY_API_KEY;
    const secret = process.env.KANDINSKY_SECRET_KEY;
    if (!key || !secret) {
      throw new Error('KANDINSKY_API_KEY или KANDINSKY_SECRET_KEY не заданы на сервере.');
    }
    const headers = {
      'X-Key': `Key ${key}`,
      'X-Secret': `Secret ${secret}`,
    };
    const modelsRes = await fetch('https://api-key.fusionbrain.ai/key/api/v1/pipelines', { headers });
    if (!modelsRes.ok) {
      throw new Error(`Ошибка Kandinsky pipelines: ${modelsRes.status}`);
    }
    const pipelines = (await modelsRes.json()) as Array<{ id: string }>;
    const pipelineId = pipelines[0]?.id;
    if (!pipelineId) throw new Error('Не найден активный pipeline Kandinsky.');

    const form = new FormData();
    const params = {
      type: 'GENERATE',
      numImages: 1,
      width: aspectRatio === '16:9' ? 1024 : 960,
      height: aspectRatio === '16:9' ? 576 : 720,
      generateParams: { query: prompt },
    };
    form.append('pipeline_id', pipelineId);
    form.append('params', new Blob([JSON.stringify(params)], { type: 'application/json' }));

    const runRes = await fetch('https://api-key.fusionbrain.ai/key/api/v1/pipeline/run', {
      method: 'POST',
      headers,
      body: form,
    });
    if (!runRes.ok) {
      throw new Error(`Ошибка запуска Kandinsky: ${runRes.status}`);
    }
    const runData = (await runRes.json()) as { uuid: string };
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api-key.fusionbrain.ai/key/api/v1/pipeline/status/${runData.uuid}`, {
        headers,
      });
      const statusJson = (await statusRes.json()) as { status: string; result?: { files?: string[] } };
      if (statusJson.status === 'DONE' && statusJson.result?.files?.[0]) {
        return {
          buffer: Buffer.from(statusJson.result.files[0], 'base64'),
          mimeType: 'image/jpeg',
          providerUsed: 'kandinsky',
        };
      }
      if (statusJson.status === 'FAIL') {
        throw new Error('Kandinsky вернул ошибку генерации.');
      }
    }
    throw new Error('Таймаут ожидания Kandinsky.');
  }

  throw new Error(`Провайдер изображений "${provider}" не поддерживается.`);
}
