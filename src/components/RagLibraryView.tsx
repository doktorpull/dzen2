import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { Niche, RagSample } from '../types';

interface RagLibraryViewProps {
  niches: Niche[];
  samples: RagSample[];
  onRefresh: () => Promise<void>;
}

export function RagLibraryView({ niches, samples, onRefresh }: RagLibraryViewProps) {
  const [nicheId, setNicheId] = useState<number>(niches[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [styleSummary, setStyleSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiFetch('/rag-samples', {
        method: 'POST',
        body: JSON.stringify({
          niche_id: nicheId,
          title,
          content,
          style_summary: styleSummary,
        }),
      });
      setTitle('');
      setContent('');
      setStyleSummary('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка добавления образца');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await apiFetch(`/rag-samples/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Добавить эталон для RAG-мимикрии</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Загрузите 5–10 успешных статей в целевой нише. Стилист копирует только ритм, длину абзацев и интонацию — факты и структура не заимствуются.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Ниша</label>
            <select
              value={nicheId}
              onChange={(e) => setNicheId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Заголовок образца</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Заголовок успешной статьи-референса"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Текст образца (отрывок 1000–3000 зн.)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={7}
              placeholder="Вставьте живой текст с высокими дочитываниями..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Заметка по стилю (опционально)</label>
            <input
              type="text"
              value={styleSummary}
              onChange={(e) => setStyleSummary(e.target.value)}
              placeholder="Напр.: короткие рубленые абзацы, обращение на «вы», ирония"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>

          {error && (
            <div className="p-2.5 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Векторизация и сохранение...' : 'Добавить образец в базу RAG'}
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Эталонные тексты ({samples.length})</h3>
        </div>
        {samples.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">Образцы стиля ещё не добавлены.</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {samples.map((s) => (
              <div key={s.id} className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.title}</h4>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                      <span>{s.niche_name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Ср. предложение: {s.avg_sentence_len} сл.</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Субъективность: {Math.round(s.subjectivity_score * 100)}%</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {s.style_summary && (
                  <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-lg">
                    {s.style_summary}
                  </p>
                )}
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">{s.content}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
