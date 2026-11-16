import {
  Check,
  ExternalLink,
  Flame,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { CpaOffer, Niche, Topic } from '../types';

interface TopicsRadarViewProps {
  niches: Niche[];
  offers: CpaOffer[];
  topics: Topic[];
  onRefresh: () => Promise<void>;
  onStartGeneration: (payload: { niche_id: number; topic_id?: number; title?: string; cpa_offer_id?: number | null }) => Promise<void>;
  onNicheCreated: (niche: Niche) => void;
}

const SOURCE_LABELS: Record<Topic['source'], string> = {
  ai_search: 'Поиск ИИ + тренды',
  trend_rss: 'RSS-лента трендов',
  manual: 'Ручной ввод',
};

const STATUS_LABELS: Record<Topic['status'], { text: string; cls: string }> = {
  new: { text: 'Новая', cls: 'text-slate-600 dark:text-slate-400' },
  approved: { text: 'Утверждена', cls: 'text-emerald-700 dark:text-emerald-400 font-medium' },
  in_progress: { text: 'В конвейере', cls: 'text-blue-700 dark:text-blue-400 font-medium' },
  completed: { text: 'Готова статья', cls: 'text-slate-900 dark:text-slate-100 font-medium' },
  rejected: { text: 'Отклонена', cls: 'text-red-600 dark:text-red-400' },
};

export function TopicsRadarView({
  niches,
  offers,
  topics,
  onRefresh,
  onStartGeneration,
  onNicheCreated,
}: TopicsRadarViewProps) {
  const [selectedNicheId, setSelectedNicheId] = useState<number>(niches[0]?.id || 1);
  const [selectedOfferId, setSelectedOfferId] = useState<number | ''>('');
  const [quickTitle, setQuickTitle] = useState('');
  const [trendFocus, setTrendFocus] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');
  const [filterNiche, setFilterNiche] = useState<number | 'all'>('all');
  const [showAddNiche, setShowAddNiche] = useState(false);
  const [newNicheName, setNewNicheName] = useState('');
  const [newNicheTone, setNewNicheTone] = useState('');
  const [newNicheCpa, setNewNicheCpa] = useState('');

  const activeNiche = useMemo(
    () => niches.find((n) => n.id === selectedNicheId) || niches[0],
    [niches, selectedNicheId],
  );

  const nicheOffers = useMemo(
    () => offers.filter((o) => o.is_active === 1 && (!selectedNicheId || o.niche_id === selectedNicheId)),
    [offers, selectedNicheId],
  );

  const visibleTopics = useMemo(
    () => (filterNiche === 'all' ? topics : topics.filter((t) => t.niche_id === filterNiche)),
    [topics, filterNiche],
  );

  async function handleQuickGenerate(e: FormEvent) {
    e.preventDefault();
    if (!quickTitle.trim()) {
      setError('Введите тему или заголовок будущей статьи для запуска конвейера.');
      return;
    }
    setError('');
    setLaunching(true);
    try {
      await onStartGeneration({
        niche_id: selectedNicheId,
        title: quickTitle.trim(),
        cpa_offer_id: selectedOfferId === '' ? null : Number(selectedOfferId),
      });
      setQuickTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить генерацию.');
    } finally {
      setLaunching(false);
    }
  }

  async function handleDiscoverTrends() {
    setError('');
    setDiscovering(true);
    try {
      await apiFetch<Topic[]>('/topics/discover', {
        method: 'POST',
        body: JSON.stringify({
          niche_id: selectedNicheId,
          custom_focus: trendFocus.trim(),
        }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка поиска трендов.');
    } finally {
      setDiscovering(false);
    }
  }

  async function handleAddManualTopic() {
    if (!quickTitle.trim()) return;
    setError('');
    try {
      await apiFetch('/topics', {
        method: 'POST',
        body: JSON.stringify({
          niche_id: selectedNicheId,
          title: quickTitle.trim(),
          angle: trendFocus.trim() || 'Добавлено в очередь вручную',
        }),
      });
      setQuickTitle('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка добавления темы.');
    }
  }

  async function handleCreateNiche(e: FormEvent) {
    e.preventDefault();
    if (!newNicheName.trim()) return;
    try {
      const created = await apiFetch<Niche>('/niches', {
        method: 'POST',
        body: JSON.stringify({
          name: newNicheName.trim(),
          default_tone: newNicheTone.trim(),
          cpa_notes: newNicheCpa.trim(),
        }),
      });
      onNicheCreated(created);
      setSelectedNicheId(created.id);
      setNewNicheName('');
      setNewNicheTone('');
      setNewNicheCpa('');
      setShowAddNiche(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать нишу.');
    }
  }

  async function handleTopicStatus(id: number, status: Topic['status']) {
    await apiFetch(`/topics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await onRefresh();
  }

  async function handleDeleteTopic(id: number) {
    await apiFetch(`/topics/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Быстрый старт и Радар трендов (Гибрид Модуля 1) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Выбор ниши и запуск контента</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Запустите 7-этапную генерацию напрямую по своей теме или найдите свежие инфоповоды через Радар трендов
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddNiche((v) => !v)}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Своя ниша
          </button>
        </div>

        {showAddNiche && (
          <form
            onSubmit={handleCreateNiche}
            className="mb-6 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <input
              type="text"
              placeholder="Название новой ниши"
              value={newNicheName}
              onChange={(e) => setNewNicheName(e.target.value)}
              required
              className="px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <input
              type="text"
              placeholder="Тон подачи (напр. личный разбор)"
              value={newNicheTone}
              onChange={(e) => setNewNicheTone(e.target.value)}
              className="px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Заметки под CPA-офферы"
                value={newNicheCpa}
                onChange={(e) => setNewNicheCpa(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-blue-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 whitespace-nowrap shrink-0"
              >
                Создать
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Целевая ниша (ТОП-10 из Этапа 2 + свои)
            </label>
            <select
              value={selectedNicheId}
              onChange={(e) => setSelectedNicheId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.is_top10 ? `★ ${n.name}` : n.name} ({n.rpm_range})
                </option>
              ))}
            </select>

            {activeNiche && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                  <span className="font-mono tabular-nums">{activeNiche.rpm_range}</span>
                  <span aria-hidden="true">·</span>
                  <span>AI-fit: {activeNiche.ai_fit}</span>
                </div>
                <p>{activeNiche.growth_note}</p>
                <p className="text-slate-500 dark:text-slate-400">CPA: {activeNiche.cpa_notes || 'Без привязки'}</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 space-y-4">
            <form onSubmit={handleQuickGenerate} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Тема или рабочий заголовок статьи
                  </label>
                  <input
                    type="text"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="Например: Почему в 2026 вклады под 18% больше не спасают от инфляции"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CPA-оффер в статью</label>
                  <select
                    value={selectedOfferId}
                    onChange={(e) => setSelectedOfferId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="">Авто / Без оффера</option>
                    {nicheOffers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={launching}
                  className="px-4 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Play className="w-4 h-4" />
                  {launching ? 'Запуск...' : 'Сгенерировать статью'}
                </button>

                <button
                  type="button"
                  onClick={handleAddManualTopic}
                  disabled={!quickTitle.trim()}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  В очередь тем
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={trendFocus}
                onChange={(e) => setTrendFocus(e.target.value)}
                placeholder="Уточнение для радара трендов (необязательно)"
                className="flex-1 min-w-[220px] px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-blue-600"
              />
              <button
                type="button"
                onClick={handleDiscoverTrends}
                disabled={discovering}
                className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                {discovering ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                )}
                {discovering ? 'Анализ трендов...' : 'Найти горячие тренды'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg">
            {error}
          </div>
        )}
      </section>

      {/* Очередь тем со скорингом */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Очередь тем и скоринг</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {visibleTopics.length} записей
            </span>
          </div>

          <select
            value={filterNiche}
            onChange={(e) => setFilterNiche(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="all">Все ниши</option>
            {niches.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {visibleTopics.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Очередь тем пока пуста</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
              Нажмите «Найти горячие тренды» выше, чтобы получить 6 актуальных тем со скорингом для выбранной ниши.
            </p>
            <button
              type="button"
              onClick={handleDiscoverTrends}
              disabled={discovering}
              className="px-4 py-2 text-sm font-medium bg-blue-700 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-800 dark:hover:bg-blue-500 whitespace-nowrap"
            >
              Найти первые тренды
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Тема и угол подачи</th>
                  <th className="py-2.5 px-3 text-right">Спрос</th>
                  <th className="py-2.5 px-3 text-right">Конкур.</th>
                  <th className="py-2.5 px-3 text-right">CPA</th>
                  <th className="py-2.5 px-3 text-right">Приоритет</th>
                  <th className="py-2.5 px-3">Статус</th>
                  <th className="py-2.5 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {visibleTopics.map((topic) => {
                  const st = STATUS_LABELS[topic.status] || STATUS_LABELS.new;
                  return (
                    <tr key={topic.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 max-w-md">
                        <div className="font-medium text-slate-900 dark:text-slate-100 leading-snug">{topic.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                          <span>{topic.niche_name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{SOURCE_LABELS[topic.source]}</span>
                          {topic.source_url && (
                            <>
                              <span aria-hidden="true">·</span>
                              <a
                                href={topic.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                              >
                                источник <ExternalLink className="w-3 h-3" />
                              </a>
                            </>
                          )}
                        </div>
                        {topic.angle && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{topic.angle}</p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {topic.demand_score}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {topic.competition_score}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {topic.cpa_score}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {topic.priority_score}
                      </td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">
                        <span className={st.cls}>{st.text}</span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onStartGeneration({
                                niche_id: topic.niche_id,
                                topic_id: topic.id,
                                title: topic.title,
                                cpa_offer_id: selectedOfferId === '' ? null : Number(selectedOfferId),
                              })
                            }
                            className="px-2.5 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-md transition-colors inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            В работу
                          </button>
                          {topic.status === 'new' && (
                            <button
                              type="button"
                              title="Утвердить тему"
                              onClick={() => handleTopicStatus(topic.id, 'approved')}
                              className="p-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {topic.status !== 'rejected' && (
                            <button
                              type="button"
                              title="Отклонить"
                              onClick={() => handleTopicStatus(topic.id, 'rejected')}
                              className="p-1.5 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 rounded-md"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Удалить"
                            onClick={() => handleDeleteTopic(topic.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
