import { Check, Copy, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { AppSettings, ImageProviderId, ProviderStatus, TextProviderId } from '../types';

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
  openai: 'gpt-4o',
  deepseek: 'deepseek-chat',
  anthropic: 'claude-3-5-sonnet-latest',
  yandex: 'yandexgpt/latest',
  custom_openai: 'gpt-4o-mini',
};

const DEFAULT_IMAGE_MODELS: Record<ImageProviderId, string> = {
  gemini: 'gemini-3.1-flash-lite-image',
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

  async function handleCopyNginx() {
    await navigator.clipboard.writeText(NGINX_SNIPPET);
    setCopiedNginx(true);
    setTimeout(() => setCopiedNginx(false), 2000);
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
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="deepseek">DeepSeek</option>
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
            {form.text_provider === 'gemini' && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-4-argon'].map((m) => (
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
              <option value="kandinsky">Kandinsky (FusionBrain)</option>
              <option value="openai">OpenAI Images</option>
              <option value="disabled">Отключено (только текст)</option>
            </select>
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
