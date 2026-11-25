import { ArrowDown, ArrowUp, Check, Copy, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type {
  AppSettings,
  FallbackProviderTarget,
  ImageProviderId,
  PipelineMode,
  ProviderStatus,
  TextProviderId,
} from '../types';

interface SettingsViewProps {
  settings: AppSettings;
  providers: ProviderStatus[];
  onUpdated: (settings: AppSettings, providers: ProviderStatus[]) => void;
}

const NGINX_SNIPPET = `location = /dzen {
    return 301 /dzen/;
}

location /dzen/ {
    proxy_pass http://127.0.0.1:8003/dzen/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}`;

const DEFAULT_TEXT_MODELS: Record<TextProviderId, string> = {
  gemini: 'gemini-4-hydrogen',
  zai: 'glm-4.5',
  ollama: 'qwen2.5:14b',
  openrouter: 'openai/gpt-4o-mini',
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  qwen: 'qwen-plus',
  mistral: 'mistral-large-latest',
  xai: 'grok-3-mini',
  together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  anthropic: 'claude-3-5-sonnet-latest',
  yandex: 'yandexgpt/latest',
  custom_openai: 'gpt-4o-mini',
};

const TEXT_MODEL_PRESETS: Partial<Record<TextProviderId, string[]>> = {
  gemini: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon'],
  zai: ['glm-4.5', 'glm-4.5-air', 'glm-4.5-flash', 'glm-4-plus'],
  ollama: ['qwen2.5:14b', 'llama3.3', 'gemma3:12b', 'deepseek-r1:14b'],
  openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat', 'google/gemini-2.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
  groq: ['llama-3.3-70b-versatile', 'qwen-qwq-32b', 'mixtral-8x7b-32768'],
  qwen: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  mistral: ['mistral-large-latest', 'mistral-small-latest'],
  xai: ['grok-3-mini', 'grok-3'],
  together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-latest'],
};

const FAST_MODEL_DEFAULTS: Partial<Record<TextProviderId, string>> = {
  gemini: 'gemini-3.1-flash-lite',
  zai: 'glm-4.5-flash',
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  deepseek: 'deepseek-chat',
  groq: 'llama-3.1-8b-instant',
  qwen: 'qwen-turbo',
  mistral: 'mistral-small-latest',
  xai: 'grok-3-mini',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  anthropic: 'claude-3-5-haiku-latest',
};

const TEXT_PROVIDER_OPTIONS: Array<{ id: TextProviderId; label: string }> = [
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'zai', label: 'Z.ai (Zhipu GLM)' },
  { id: 'ollama', label: 'Ollama (локально)' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'groq', label: 'Groq (LPU)' },
  { id: 'qwen', label: 'Qwen (Alibaba)' },
  { id: 'mistral', label: 'Mistral AI' },
  { id: 'xai', label: 'xAI (Grok)' },
  { id: 'together', label: 'Together AI' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'yandex', label: 'YandexGPT' },
  { id: 'custom_openai', label: 'Кастомный OpenAI API' },
];

const DEFAULT_IMAGE_MODELS: Record<ImageProviderId, string> = {
  gemini: 'gemini-3.1-flash-lite-image',
  zai: 'cogview-4-250304',
  kandinsky: 'kandinsky-3.1',
  openai: 'gpt-image-1',
  disabled: '',
};

export function SettingsView({ settings, providers, onUpdated }: SettingsViewProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingOllama, setLoadingOllama] = useState(false);
  const [ollamaNote, setOllamaNote] = useState('');
  const [copiedNginx, setCopiedNginx] = useState(false);

  function handleTextProviderChange(nextProvider: TextProviderId) {
    const knownDefaults = new Set(Object.values(DEFAULT_TEXT_MODELS));
    const nextModel =
      !form.text_model || knownDefaults.has(form.text_model)
        ? DEFAULT_TEXT_MODELS[nextProvider]
        : form.text_model;
    setForm({ ...form, text_provider: nextProvider, text_model: nextModel });
    setTestResult(null);
  }

  function handleImageProviderChange(nextProvider: ImageProviderId) {
    const knownDefaults = new Set(Object.values(DEFAULT_IMAGE_MODELS));
    const nextModel =
      !form.image_model || knownDefaults.has(form.image_model)
        ? DEFAULT_IMAGE_MODELS[nextProvider]
        : form.image_model;
    setForm({ ...form, image_provider: nextProvider, image_model: nextModel });
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await apiFetch<{ settings: AppSettings; providers: ProviderStatus[] }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onUpdated(res.settings, res.providers);
      setSavedMsg('Настройки сохранены в SQLite.');
      setTimeout(() => setSavedMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestProvider() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; providerUsed?: string; sample?: string; error?: string }>(
        '/settings/test-provider',
        {
          method: 'POST',
          body: JSON.stringify(form),
        },
      );
      setTestResult({
        ok: true,
        message: `Подключение работает (${res.providerUsed}): ${res.sample || 'ОК'}`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Ошибка проверки провайдера.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleLoadOllamaModels() {
    setLoadingOllama(true);
    setOllamaNote('');
    try {
      const url = encodeURIComponent(form.ollama_base_url || 'http://127.0.0.1:11434/v1');
      const res = await apiFetch<{ models: string[]; error?: string }>(`/settings/ollama-models?baseUrl=${url}`);
      setOllamaModels(res.models || []);
      if (res.error) {
        setOllamaNote(res.error);
      } else if (res.models.length === 0) {
        setOllamaNote('Ollama доступна, но установленных моделей пока нет (выполните ollama pull qwen2.5:14b).');
      } else {
        setOllamaNote(`Найдено моделей: ${res.models.length}`);
      }
    } catch (err) {
      setOllamaNote(err instanceof Error ? err.message : 'Ошибка запроса к Ollama.');
    } finally {
      setLoadingOllama(false);
    }
  }

  async function handleCopyNginx() {
    await navigator.clipboard.writeText(NGINX_SNIPPET);
    setCopiedNginx(true);
    setTimeout(() => setCopiedNginx(false), 2000);
  }

  const activePresets =
    form.text_provider === 'ollama' && ollamaModels.length > 0
      ? ollamaModels
      : TEXT_MODEL_PRESETS[form.text_provider] || [];

  const recommendedFastModel = FAST_MODEL_DEFAULTS[form.text_provider];

  function handleAddFallback() {
    const firstCandidate =
      providers.find((p) => p.kind === 'text' && p.configured && p.id !== form.text_provider)?.id || 'zai';
    const nextProvider = firstCandidate as TextProviderId;
    const nextList: FallbackProviderTarget[] = [
      ...(form.fallback_providers || []),
      { provider: nextProvider, model: DEFAULT_TEXT_MODELS[nextProvider] || 'gpt-4o-mini' },
    ];
    setForm({ ...form, fallback_providers: nextList });
  }

  function handleAutoFillFallbacks() {
    const existing = form.fallback_providers || [];
    const existingKeys = new Set(existing.map((f) => `${f.provider}:${f.model}`));
    const configured = providers.filter(
      (p) => p.kind === 'text' && p.configured && p.id !== form.text_provider && p.id !== 'ollama',
    );
    const additions: FallbackProviderTarget[] = [];
    for (const p of configured) {
      const pid = p.id as TextProviderId;
      const model = FAST_MODEL_DEFAULTS[pid] || p.defaultModel || DEFAULT_TEXT_MODELS[pid];
      if (!existingKeys.has(`${pid}:${model}`)) {
        additions.push({ provider: pid, model });
      }
    }
    if (additions.length > 0) {
      setForm({
        ...form,
        auto_fallback_enabled: true,
        fallback_providers: [...existing, ...additions],
      });
    }
  }

  function handleUpdateFallback(index: number, patch: Partial<FallbackProviderTarget>) {
    const list = [...(form.fallback_providers || [])];
    const current = list[index];
    if (!current) return;
    let nextItem = { ...current, ...patch };
    if (patch.provider && patch.provider !== current.provider && !patch.model) {
      nextItem.model = DEFAULT_TEXT_MODELS[patch.provider] || '';
    }
    list[index] = nextItem;
    setForm({ ...form, fallback_providers: list });
  }

  function handleMoveFallback(index: number, delta: -1 | 1) {
    const list = [...(form.fallback_providers || [])];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setForm({ ...form, fallback_providers: list });
  }

  function handleRemoveFallback(index: number) {
    const list = (form.fallback_providers || []).filter((_, i) => i !== index);
    setForm({ ...form, fallback_providers: list });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Провайдеры ИИ, конвейер и Telegram-мост
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ключи API задаются в переменных окружения сервера (.env / Docker Compose) и никогда не передаются в браузер.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Провайдер текста (Этапы 1–7)
            </label>
            <select
              value={form.text_provider}
              onChange={(e) => handleTextProviderChange(e.target.value as TextProviderId)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="gemini">Google Gemini (встроенный)</option>
              <option value="zai">Z.ai (Zhipu GLM-4.5)</option>
              <option value="ollama">Ollama (локально / self-hosted)</option>
              <option value="openrouter">OpenRouter (200+ моделей)</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI (GPT-4o / 4.1)</option>
              <option value="groq">Groq (LPU, сверхбыстрый)</option>
              <option value="qwen">Qwen (Alibaba DashScope)</option>
              <option value="mistral">Mistral AI</option>
              <option value="xai">xAI (Grok)</option>
              <option value="together">Together AI</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="yandex">YandexGPT</option>
              <option value="custom_openai">Кастомный OpenAI-совместимый API</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Модель генерации текста</label>
            <input
              type="text"
              value={form.text_model}
              onChange={(e) => setForm({ ...form, text_model: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            {activePresets.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {activePresets.slice(0, 6).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm({ ...form, text_model: m })}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                      form.text_model === m
                        ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-600 dark:border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Провайдер визуала (Модуль 3)</label>
            <select
              value={form.image_provider}
              onChange={(e) => handleImageProviderChange(e.target.value as ImageProviderId)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="gemini">Gemini Image (gemini-3.1-flash-lite-image)</option>
              <option value="zai">Z.ai CogView (cogview-4-250304)</option>
              <option value="kandinsky">Kandinsky (FusionBrain)</option>
              <option value="openai">OpenAI Images</option>
              <option value="disabled">Отключено (только текст)</option>
            </select>
            {form.image_provider === 'gemini' && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                Генерация картинок Gemini требует платного тарифа AI Studio. Для работы на бесплатном ключе выберите «Отключено», Kandinsky или Z.ai.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Модель изображений</label>
            <input
              type="text"
              value={form.image_model}
              onChange={(e) => setForm({ ...form, image_model: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>

        {form.text_provider === 'ollama' && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Настройка сервера Ollama</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Локально без Docker: <span className="font-mono">http://127.0.0.1:11434/v1</span> · Внутри Docker на VPS:{' '}
                  <span className="font-mono">http://host.docker.internal:11434/v1</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadOllamaModels}
                disabled={loadingOllama}
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-md whitespace-nowrap"
              >
                {loadingOllama ? 'Загрузка...' : 'Загрузить модели Ollama'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={form.ollama_base_url}
                onChange={(e) => setForm({ ...form, ollama_base_url: e.target.value })}
                placeholder="http://127.0.0.1:11434/v1"
                className="flex-1 min-w-[240px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, ollama_base_url: 'http://host.docker.internal:11434/v1' })}
                className="px-2.5 py-2 text-[11px] font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Docker host
              </button>
            </div>
            {ollamaNote && <div className="text-[11px] text-slate-600 dark:text-slate-400">{ollamaNote}</div>}
          </div>
        )}

        {form.text_provider === 'custom_openai' && (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Custom OpenAI Base URL</label>
              <input
                type="url"
                value={form.custom_openai_base_url}
                onChange={(e) => setForm({ ...form, custom_openai_base_url: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Custom Model Name</label>
              <input
                type="text"
                value={form.custom_openai_model}
                onChange={(e) => setForm({ ...form, custom_openai_model: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Целевой объём статьи (знаков)
            </label>
            <input
              type="number"
              min={3500}
              max={5500}
              value={form.target_char_count}
              onChange={(e) => setForm({ ...form, target_char_count: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Порог авто-утверждения темы (0–100)
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={form.topic_auto_approve_threshold}
              onChange={(e) => setForm({ ...form, topic_auto_approve_threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>

        {/* Оптимизация запросов и экономия токенов */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Режим конвейера и экономия токенов
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Сокращает число обращений к API, сжимает RAG-контекст и объединяет подготовительные этапы.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {(
              [
                {
                  id: 'balanced' as PipelineMode,
                  title: 'Сбалансированный',
                  badge: '3–4 запроса · −50% ток.',
                  desc: 'Этапы 1–3 и 5–6 объединены, умный пропуск редактора и арт-директора.',
                },
                {
                  id: 'economy' as PipelineMode,
                  title: 'Экономичный',
                  badge: '2 запроса · −70% ток.',
                  desc: 'План за 1 вызов + чистовой текст за 1 вызов, без лишних LLM-проверок.',
                },
                {
                  id: 'full' as PipelineMode,
                  title: 'Полный (7 агентов)',
                  badge: '8 запросов · 100%',
                  desc: 'Каждый этап конвейера и арт-директор визуала выполняются отдельно.',
                },
              ] as const
            ).map((opt) => {
              const active = (form.pipeline_mode || 'balanced') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm({ ...form, pipeline_mode: opt.id })}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    active
                      ? 'bg-blue-50/70 dark:bg-blue-950/50 border-blue-600 dark:border-blue-500'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{opt.title}</div>
                  <div className="text-[11px] font-mono text-blue-700 dark:text-blue-400 mt-0.5">{opt.badge}</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Быстрая/дешёвая модель для этапов 1–3, 6 и трендов (опционально)
              </label>
              {recommendedFastModel && form.fast_model !== recommendedFastModel && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, fast_model: recommendedFastModel })}
                  className="text-[11px] font-mono text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Подставить {recommendedFastModel}
                </button>
              )}
            </div>
            <input
              type="text"
              value={form.fast_model || ''}
              onChange={(e) => setForm({ ...form, fast_model: e.target.value })}
              placeholder={`Оставьте пустым для использования основной модели (${form.text_model})`}
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>

        {/* Автопереключение моделей (Fallback) */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Автопереключение моделей при сбое (Fallback)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                При ошибке, 429 или исчерпании квоты ИИ автоматически переключается на лёгкую модель или резервный провайдер по порядку.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.auto_fallback_enabled}
              onClick={() => setForm({ ...form, auto_fallback_enabled: !form.auto_fallback_enabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.auto_fallback_enabled ? 'bg-blue-700 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  form.auto_fallback_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Цепочка резервных провайдеров (пропускает провайдеров без ключа в .env):
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAutoFillFallbacks}
                className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md whitespace-nowrap"
              >
                Автозаполнить из .env
              </button>
              <button
                type="button"
                onClick={handleAddFallback}
                className="px-2.5 py-1 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-md inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить резерв
              </button>
            </div>
          </div>

          {(form.fallback_providers || []).length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
              Резервные провайдеры не добавлены. Нажмите «Автозаполнить из .env» или добавьте вручную (при 429 всё равно сработает откат на лёгкую модель основного провайдера).
            </div>
          ) : (
            <div className="space-y-2">
              {(form.fallback_providers || []).map((item, idx) => (
                <div
                  key={`${item.provider}-${idx}`}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 w-5 shrink-0">#{idx + 1}</span>
                  <select
                    value={item.provider}
                    onChange={(e) => handleUpdateFallback(idx, { provider: e.target.value as TextProviderId })}
                    className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md min-w-[160px]"
                  >
                    {TEXT_PROVIDER_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={item.model}
                    onChange={(e) => handleUpdateFallback(idx, { model: e.target.value })}
                    placeholder="Имя модели"
                    className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Выше в очереди"
                      disabled={idx === 0}
                      onClick={() => handleMoveFallback(idx, -1)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Ниже в очереди"
                      disabled={idx === (form.fallback_providers || []).length - 1}
                      onClick={() => handleMoveFallback(idx, 1)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Удалить из резерва"
                      onClick={() => handleRemoveFallback(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Тумблер Модуля 4.2 */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Режим 4.2 — Публикация через Telegram (@zen_sync_bot)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                По умолчанию выключен. Включайте только при привязанном канале и заданном TELEGRAM_BOT_TOKEN.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.telegram_enabled}
              onClick={() => setForm({ ...form, telegram_enabled: !form.telegram_enabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.telegram_enabled ? 'bg-blue-700 dark:bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  form.telegram_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              ID или @username Telegram-канала
            </label>
            <input
              type="text"
              value={form.telegram_channel_id}
              onChange={(e) => setForm({ ...form, telegram_channel_id: e.target.value })}
              placeholder="@my_dzen_bridge_channel или -1001234567890"
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
          <button
            type="button"
            onClick={handleTestProvider}
            disabled={testing}
            className="px-3.5 py-2.5 text-sm font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg whitespace-nowrap"
          >
            {testing ? 'Проверка...' : 'Проверить ИИ'}
          </button>
          {savedMsg && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{savedMsg}</span>}
        </div>

        {testResult && (
          <div
            className={`p-3 text-xs rounded-lg border ${
              testResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
            }`}
          >
            {testResult.message}
          </div>
        )}
      </form>

      {/* Готовность ключей в окружении + Docker / Nginx */}
      <div className="lg:col-span-5 space-y-5">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Готовность серверных API-ключей (.env)</h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {providers.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{p.name}</div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">{p.note}</div>
                </div>
                <span
                  className={`font-medium whitespace-nowrap ${
                    p.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {p.configured ? 'Подключён' : 'Не задан'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Деплой на VPS (Docker · порт 8003)</h3>
            <button
              type="button"
              onClick={handleCopyNginx}
              className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md flex items-center gap-1 whitespace-nowrap"
            >
              {copiedNginx ? <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedNginx ? 'Скопировано' : 'Nginx конфиг'}
            </button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Запустите <span className="font-mono text-slate-900 dark:text-slate-200">docker compose up -d --build</span> на сервере, затем добавьте блок в конфигурацию Nginx домена <span className="font-mono text-slate-900 dark:text-slate-200">igrovoikompas.ru</span>:
          </p>
          <pre className="p-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
            {NGINX_SNIPPET}
          </pre>
        </section>
      </div>
    </div>
  );
}
