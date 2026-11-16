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

export function SettingsView({ settings, providers, onUpdated }: SettingsViewProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [copiedNginx, setCopiedNginx] = useState(false);

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

  async function handleCopyNginx() {
    await navigator.clipboard.writeText(NGINX_SNIPPET);
    setCopiedNginx(true);
    setTimeout(() => setCopiedNginx(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form onSubmit={handleSave} className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Провайдеры ИИ, конвейер и Telegram-мост</h2>
          <p className="text-xs text-slate-500 mt-1">
            Ключи API задаются в переменных окружения сервера (.env / Docker Compose) и никогда не передаются в браузер.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Провайдер текста (Этапы 1–7)</label>
            <select
              value={form.text_provider}
              onChange={(e) => setForm({ ...form, text_provider: e.target.value as TextProviderId })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="gemini">Google Gemini (gemini-4-hydrogen)</option>
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="yandex">YandexGPT</option>
              <option value="custom_openai">Кастомный OpenAI-совместимый API</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Модель генерации текста</label>
            <input
              type="text"
              value={form.text_model}
              onChange={(e) => setForm({ ...form, text_model: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Провайдер визуала (Модуль 3)</label>
            <select
              value={form.image_provider}
              onChange={(e) => setForm({ ...form, image_provider: e.target.value as ImageProviderId })}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="gemini">Gemini Image (gemini-3.1-flash-lite-image)</option>
              <option value="kandinsky">Kandinsky (FusionBrain)</option>
              <option value="openai">OpenAI Images</option>
              <option value="disabled">Отключено (только текст)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Модель изображений</label>
            <input
              type="text"
              value={form.image_model}
              onChange={(e) => setForm({ ...form, image_model: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {form.text_provider === 'custom_openai' && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Custom OpenAI Base URL</label>
              <input
                type="url"
                value={form.custom_openai_base_url}
                onChange={(e) => setForm({ ...form, custom_openai_base_url: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Custom Model Name</label>
              <input
                type="text"
                value={form.custom_openai_model}
                onChange={(e) => setForm({ ...form, custom_openai_model: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Целевой объём статьи (знаков)</label>
            <input
              type="number"
              min={3500}
              max={5500}
              value={form.target_char_count}
              onChange={(e) => setForm({ ...form, target_char_count: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Порог авто-утверждения темы (0–100)</label>
            <input
              type="number"
              min={10}
              max={100}
              value={form.topic_auto_approve_threshold}
              onChange={(e) => setForm({ ...form, topic_auto_approve_threshold: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Тумблер Модуля 4.2 */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Режим 4.2 — Публикация через Telegram (@zen_sync_bot)</div>
              <p className="text-xs text-slate-500">
                По умолчанию выключен. Включайте только при привязанном канале и заданном TELEGRAM_BOT_TOKEN.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.telegram_enabled}
              onClick={() => setForm({ ...form, telegram_enabled: !form.telegram_enabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                form.telegram_enabled ? 'bg-blue-700' : 'bg-slate-300'
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
            <label className="block text-xs font-medium text-slate-600 mb-1">ID или @username Telegram-канала</label>
            <input
              type="text"
              value={form.telegram_channel_id}
              onChange={(e) => setForm({ ...form, telegram_channel_id: e.target.value })}
              placeholder="@my_dzen_bridge_channel или -1001234567890"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center gap-2 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
          {savedMsg && <span className="text-xs font-medium text-emerald-700">{savedMsg}</span>}
        </div>
      </form>

      {/* Готовность ключей в окружении + Docker / Nginx */}
      <div className="lg:col-span-5 space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Готовность серверных API-ключей (.env)</h3>
          </div>
          <div className="divide-y divide-slate-200 text-xs">
            {providers.map((p) => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="text-slate-500 mt-0.5">{p.note}</div>
                </div>
                <span
                  className={`font-medium whitespace-nowrap ${
                    p.configured ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {p.configured ? 'Подключён' : 'Не задан'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Деплой на VPS (Docker · порт 8003)</h3>
            <button
              type="button"
              onClick={handleCopyNginx}
              className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1 whitespace-nowrap"
            >
              {copiedNginx ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedNginx ? 'Скопировано' : 'Nginx конфиг'}
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Запустите <span className="font-mono text-slate-900">docker compose up -d --build</span> на сервере, затем добавьте блок в конфигурацию Nginx домена <span className="font-mono text-slate-900">igrovoikompas.ru</span>:
          </p>
          <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
            {NGINX_SNIPPET}
          </pre>
        </section>
      </div>
    </div>
  );
}
