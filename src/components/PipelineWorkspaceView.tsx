import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, authedApiUrl, copyRichArticleToClipboard, parseJson, resolveAssetUrl } from '../api';
import type {
  AppSettings,
  Article,
  ArticleImage,
  FactcheckFlag,
  PipelineStageState,
  ValidatorReport,
} from '../types';

interface PipelineWorkspaceViewProps {
  articles: Article[];
  selectedArticleId: number | null;
  settings: AppSettings;
  onSelectArticle: (id: number | null) => void;
  onRefresh: () => Promise<void>;
  onGoToTopics: () => void;
}

const ARTICLE_STATUS_MAP: Record<Article['status'], { label: string; cls: string }> = {
  queued: { label: 'В очереди', cls: 'text-slate-600 dark:text-slate-400' },
  generating: { label: 'Генерация...', cls: 'text-blue-700 dark:text-blue-400 font-medium' },
  needs_review: { label: 'Нужна проверка', cls: 'text-amber-700 dark:text-amber-400 font-medium' },
  ready: { label: 'Готова к выдаче', cls: 'text-emerald-700 dark:text-emerald-400 font-medium' },
  published_tg: { label: 'Отправлена в TG', cls: 'text-emerald-800 dark:text-emerald-400 font-medium' },
  failed: { label: 'Ошибка этапа', cls: 'text-red-700 dark:text-red-400 font-medium' },
};

export function PipelineWorkspaceView({
  articles,
  selectedArticleId,
  settings,
  onSelectArticle,
  onRefresh,
  onGoToTopics,
}: PipelineWorkspaceViewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'validator' | 'visuals' | 'artifacts'>('preview');
  const [liveArticle, setLiveArticle] = useState<Article | null>(null);
  const [copied, setCopied] = useState(false);
  const [rerunning, setRerunning] = useState<string | null>(null);
  const [tgResult, setTgResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editRubric, setEditRubric] = useState('');
  const [editPreviewDesc, setEditPreviewDesc] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const selectedFromList = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || articles[0] || null,
    [articles, selectedArticleId],
  );

  const article = liveArticle && liveArticle.id === selectedFromList?.id ? liveArticle : selectedFromList;

  useEffect(() => {
    setLiveArticle(null);
    setTgResult(null);
    setActionError('');
    if (selectedFromList) {
      setEditTitle(selectedFromList.title);
      setEditSubtitle(selectedFromList.subtitle || '');
      setEditRubric(selectedFromList.rubric || '');
      setEditPreviewDesc(selectedFromList.preview_description || '');
      setEditMarkdown(selectedFromList.final_markdown || '');
    }
  }, [selectedFromList?.id, selectedFromList?.updated_at, selectedFromList?.status, selectedFromList?.error_message]);

  useEffect(() => {
    if (!article || (article.status !== 'generating' && article.status !== 'queued')) {
      return;
    }

    const es = new EventSource(authedApiUrl(`/articles/${article.id}/stream`), { withCredentials: true });
    es.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          type: string;
          stages?: PipelineStageState[];
          current_stage?: number;
          article?: Article;
          error?: string;
        };
        if (data.type === 'stage' && data.stages) {
          setLiveArticle((prev) =>
            prev
              ? { ...prev, stages_json: JSON.stringify(data.stages), current_stage: data.current_stage || prev.current_stage }
              : { ...article, stages_json: JSON.stringify(data.stages), current_stage: data.current_stage || article.current_stage },
          );
        } else if (data.type === 'complete' || data.type === 'error') {
          if (data.article) {
            setLiveArticle(data.article);
            setEditTitle(data.article.title);
            setEditSubtitle(data.article.subtitle || '');
            setEditRubric(data.article.rubric || '');
            setEditPreviewDesc(data.article.preview_description || '');
            setEditMarkdown(data.article.final_markdown || '');
          } else if (data.type === 'error') {
            setLiveArticle((prev) => ({
              ...(prev || article),
              status: 'failed',
              error_message: data.error || 'Этап завершился с ошибкой.',
              stages_json: data.stages ? JSON.stringify(data.stages) : (prev || article).stages_json,
            }));
          }
          await onRefresh();
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    const poll = setInterval(() => {
      void onRefresh();
    }, 5000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [article?.id, article?.status]);

  const stages = useMemo(
    () => parseJson<PipelineStageState[]>(article?.stages_json, []),
    [article?.stages_json],
  );
  const validator = useMemo(
    () => parseJson<ValidatorReport | null>(article?.validator_json, null),
    [article?.validator_json],
  );
  const factFlags = useMemo(
    () => parseJson<FactcheckFlag[]>(article?.factcheck_flags_json, []),
    [article?.factcheck_flags_json],
  );
  const images = useMemo(
    () => parseJson<ArticleImage[]>(article?.images_json, []),
    [article?.images_json],
  );
  const tags = useMemo(
    () => parseJson<string[]>(article?.tags_json, []),
    [article?.tags_json],
  );
  const strategistBrief = useMemo(
    () => parseJson<Record<string, string>>(article?.strategist_brief_json, {}),
    [article?.strategist_brief_json],
  );
  const seoCore = useMemo(
    () => parseJson<Record<string, unknown>>(article?.seo_core_json, {}),
    [article?.seo_core_json],
  );

  async function handleCopyArticle() {
    if (!article) return;
    await copyRichArticleToClipboard(article.title, article.subtitle, article.final_html, article.final_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleRerun(action: 'auto_clean' | 'stylist' | 'injector' | 'visuals') {
    if (!article) return;
    setActionError('');
    setRerunning(action);
    try {
      const updated = await apiFetch<Article>(`/articles/${article.id}/rerun`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setLiveArticle(updated);
      setEditMarkdown(updated.final_markdown || '');
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Ошибка выполнения операции.');
    } finally {
      setRerunning(null);
    }
  }

  async function handleRetryPipeline(mode: 'resume' | 'restart') {
    if (!article) return;
    setActionError('');
    setRerunning(`retry_${mode}`);
    try {
      const updated = await apiFetch<Article>(`/articles/${article.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      setLiveArticle(updated);
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось перезапустить конвейер.');
    } finally {
      setRerunning(null);
    }
  }

  async function handleSaveEdits() {
    if (!article) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await apiFetch<Article>(`/articles/${article.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle,
          subtitle: editSubtitle,
          rubric: editRubric,
          preview_description: editPreviewDesc,
          final_markdown: editMarkdown,
        }),
      });
      setLiveArticle(updated);
      await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Ошибка сохранения.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTelegramPublish() {
    if (!article) return;
    setTgResult(null);
    setRerunning('telegram');
    try {
      const res = await apiFetch<{ ok: boolean; fallbackUsed: boolean; message: string }>(
        `/articles/${article.id}/publish-telegram`,
        { method: 'POST' },
      );
      setTgResult({ ok: res.ok, message: res.message });
      await onRefresh();
    } catch (err) {
      setTgResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Ошибка отправки в Telegram.',
      });
    } finally {
      setRerunning(null);
    }
  }

  async function handleDeleteArticle(id: number) {
    await apiFetch(`/articles/${id}`, { method: 'DELETE' });
    onSelectArticle(null);
    await onRefresh();
  }

  if (articles.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Конвейер статей пуст</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-5">
          Перейдите в «Радар тем», выберите нишу и запустите генерацию первой статьи по 7-этапному пайплайну.
        </p>
        <button
          type="button"
          onClick={onGoToTopics}
          className="px-4 py-2.5 text-sm font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg whitespace-nowrap"
        >
          Перейти в Радар тем
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Список статей */}
      <aside className="xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Очередь и выпуски</h2>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">{articles.length}</span>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[72vh] overflow-y-auto">
          {articles.map((item) => {
            const st = ARTICLE_STATUS_MAP[item.status] || ARTICLE_STATUS_MAP.queued;
            const rep = parseJson<ValidatorReport | null>(item.validator_json, null);
            const isSelected = article?.id === item.id;
            return (
              <div
                key={item.id}
                onClick={() => onSelectArticle(item.id)}
                className={`p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50/60 dark:bg-blue-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                    {item.title}
                  </div>
                  <button
                    type="button"
                    title="Удалить статью"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteArticle(item.id);
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.niche_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className={st.cls}>{st.label}</span>
                  {rep && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {rep.passed_count}/10 · {rep.char_count} зн.
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Рабочая область выбранной статьи */}
      {article && (
        <div className="xl:col-span-8 space-y-5">
          {/* Заголовок и 7-этапный статус */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{article.niche_name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{article.provider_used}</span>
                  <span aria-hidden="true">·</span>
                  <span className={(ARTICLE_STATUS_MAP[article.status] || ARTICLE_STATUS_MAP.queued).cls}>
                    {(ARTICLE_STATUS_MAP[article.status] || ARTICLE_STATUS_MAP.queued).label}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 leading-snug">{article.title}</h2>
                {article.subtitle && <p className="text-sm text-slate-600 dark:text-slate-400">{article.subtitle}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {article.status !== 'generating' && (
                  <button
                    type="button"
                    onClick={() => handleRetryPipeline(article.status === 'failed' ? 'resume' : 'restart')}
                    disabled={Boolean(rerunning)}
                    className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rerunning?.startsWith('retry_') ? 'animate-spin' : ''}`} />
                    {article.status === 'failed' ? 'Продолжить с этапа сбоя' : 'Перезапустить конвейер'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyArticle}
                  disabled={!article.final_html}
                  className="px-4 py-2 text-sm font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  {copied ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Скопировано с вёрсткой' : 'Скопировать статью'}
                </button>
              </div>
            </div>

            {(article.error_message || article.status === 'failed') && (
              <div className="mt-4 p-3.5 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg space-y-2.5">
                <div>Ошибка конвейера: {article.error_message || 'Этап завершился с ошибкой.'}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRetryPipeline('resume')}
                    disabled={Boolean(rerunning)}
                    className="px-3 py-1.5 text-xs font-medium bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 text-white rounded-md inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rerunning === 'retry_resume' ? 'animate-spin' : ''}`} />
                    Продолжить с этапа сбоя
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetryPipeline('restart')}
                    disabled={Boolean(rerunning)}
                    className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 hover:bg-red-100 dark:hover:bg-slate-800 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 disabled:opacity-50 rounded-md whitespace-nowrap"
                  >
                    Перезапустить с 1 этапа
                  </button>
                </div>
              </div>
            )}

            {/* 7 этапов */}
            {stages.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
                {stages.map((st) => (
                  <div
                    key={st.stage}
                    className={`p-2.5 rounded-lg border text-xs ${
                      st.status === 'done'
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-slate-800 dark:text-slate-200'
                        : st.status === 'running'
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                          : st.status === 'error'
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-medium">
                      <span className="font-mono tabular-nums">0{st.stage}</span>
                      <span>
                        {st.status === 'done'
                          ? 'Готово'
                          : st.status === 'running'
                            ? 'В работе'
                            : st.status === 'error'
                              ? 'Сбой'
                              : 'Ожидает'}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 leading-tight">{st.name}</div>
                    {st.duration_ms && (
                      <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        {(st.duration_ms / 1000).toFixed(1)}с
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Переключатель вкладок */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
              {[
                { id: 'preview', label: 'Превью и Выдача (Модуль 4)' },
                {
                  id: 'validator',
                  label: validator ? `Валидатор (${validator.passed_count}/10) и Редактор` : 'Валидатор и Редактор',
                },
                { id: 'visuals', label: `Визуал (${images.length})` },
                { id: 'artifacts', label: 'Артефакты этапов' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {actionError && (
            <div className="p-3 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg">
              {actionError}
            </div>
          )}

          {/* ВКЛАДКА 1: Превью и Выдача (Модуль 4) */}
          {activeTab === 'preview' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Превью под Дзен-Студию (первые 3 абзаца выделены как критическая зона алгоритма)
                  </span>
                  {validator && (
                    <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {validator.char_count} зн. · первые 3 абзаца: {validator.first_three_paragraphs_ok ? 'ОК' : 'проверить'}
                    </span>
                  )}
                </div>

                {images[0] && (
                  <figure className="space-y-1.5">
                    <img
                      src={resolveAssetUrl(images[0].url)}
                      alt={images[0].caption}
                      referrerPolicy="no-referrer"
                      className="w-full aspect-video object-cover rounded-lg border border-slate-200 dark:border-slate-800"
                    />
                    <figcaption className="text-xs text-slate-500 dark:text-slate-400">{images[0].caption}</figcaption>
                  </figure>
                )}

                {article.final_html ? (
                  <div
                    className="prose prose-slate dark:prose-invert max-w-none text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 [&>p]:mb-3 [&>p:nth-of-type(-n+3)]:bg-amber-50/70 dark:[&>p:nth-of-type(-n+3)]:bg-amber-950/30 [&>p:nth-of-type(-n+3)]:px-3 [&>p:nth-of-type(-n+3)]:py-1.5 [&>p:nth-of-type(-n+3)]:rounded [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 dark:[&_h2]:text-slate-100 [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_a]:text-blue-700 dark:[&_a]:text-blue-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: article.final_html }}
                  />
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                    Текст появится здесь после завершения этапов генерации.
                  </p>
                )}
              </div>

              <div className="lg:col-span-4 space-y-4">
                {/* Экспорт файлов (Режим 4.1) */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Режим 4.1 — Выдача и файлы</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <a
                      href={authedApiUrl(`/articles/${article.id}/export/docx`)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <span>Экспорт в Word (.docx)</span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={authedApiUrl(`/articles/${article.id}/export/md`)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <span>Экспорт в Markdown (.md)</span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={authedApiUrl(`/articles/${article.id}/export/html`)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <span>Чистый HTML (.html)</span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={authedApiUrl(`/articles/${article.id}/export/zip`)}
                      className="px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between"
                    >
                      <span>Архив картинок + подписи (.zip)</span>
                      <Archive className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Метаданные */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-2.5 text-xs">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Метаданные публикации</h3>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Рубрика:</span>{' '}
                    <span className="text-slate-900 dark:text-slate-100 font-medium">{article.rubric || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Превью-описание:</span>
                    <p className="text-slate-800 dark:text-slate-200 mt-0.5 leading-relaxed">
                      {article.preview_description || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Теги:</span>
                    <p className="text-slate-800 dark:text-slate-200 mt-0.5">{tags.length ? tags.join(' · ') : '—'}</p>
                  </div>
                </div>

                {/* Режим 4.2 — Telegram @zen_sync_bot */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Режим 4.2 — @zen_sync_bot</h3>
                    <span
                      className={`text-xs font-medium ${
                        settings.telegram_enabled
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {settings.telegram_enabled ? 'Включён' : 'Выкл.'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    По умолчанию выключен. Включается тумблером в «Настройках». При недоступности бота выполняется автоматический откат к режиму 4.1.
                  </p>
                  <button
                    type="button"
                    onClick={handleTelegramPublish}
                    disabled={!settings.telegram_enabled || rerunning === 'telegram' || !article.final_markdown}
                    className="w-full py-2 px-3.5 text-xs font-medium bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {rerunning === 'telegram' ? 'Отправка...' : 'Отправить в Telegram-канал'}
                  </button>
                  {tgResult && (
                    <div
                      className={`p-2.5 text-xs rounded-lg border ${
                        tgResult.ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
                          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {tgResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ВКЛАДКА 2: 10-пунктный Валидатор, Фактчекер и Редактор */}
          {activeTab === 'validator' && (
            <div className="space-y-5">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Финальный валидатор (чек-лист 10 пунктов)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Детерминированная проверка по требованиям Этапа 4 без опоры на внешние AI-детекторы
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRerun('auto_clean')}
                    disabled={Boolean(rerunning)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Автоочистка HTML и тире
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRerun('stylist')}
                    disabled={Boolean(rerunning)}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rerunning === 'stylist' ? 'animate-spin' : ''}`} />
                    Вернуть Стилисту
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRerun('injector')}
                    disabled={Boolean(rerunning)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Вернуть Инжектору
                  </button>
                </div>
              </div>

              {validator && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-4">№</th>
                        <th className="py-2.5 px-3">Проверка</th>
                        <th className="py-2.5 px-3">Факт</th>
                        <th className="py-2.5 px-3">Статус</th>
                        <th className="py-2.5 px-4">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {validator.checks.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">{c.id}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{c.label}</div>
                            <div className="text-slate-500 dark:text-slate-400">{c.details || c.criterion}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {c.actual}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {c.status === 'pass' && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Пройдено
                              </span>
                            )}
                            {c.status === 'warn' && (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" /> Внимание
                              </span>
                            )}
                            {c.status === 'fail' && (
                              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-medium">
                                <ShieldAlert className="w-3.5 h-3.5" /> Блок
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{c.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Флаги фактчекера */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Флаги фактчекера для ручной проверки ({factFlags.length})
                </h3>
                {factFlags.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Критических спорных утверждений фактчекер не выявил.</p>
                ) : (
                  <div className="space-y-2.5">
                    {factFlags.map((flag, i) => (
                      <div
                        key={i}
                        className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg text-xs space-y-1"
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">«{flag.claim}»</div>
                        <div className="text-slate-700 dark:text-slate-300">
                          Причина ({flag.severity}): {flag.reason}
                        </div>
                        <div className="text-slate-600 dark:text-slate-400">Рекомендация: {flag.suggestion}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ручной редактор */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Редактор статьи и метаданных</h3>
                  <button
                    type="button"
                    onClick={handleSaveEdits}
                    disabled={saving}
                    className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg whitespace-nowrap"
                  >
                    {saving ? 'Сохранение и пересчёт...' : 'Сохранить и перепроверить валидатором'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Заголовок"
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    value={editRubric}
                    onChange={(e) => setEditRubric(e.target.value)}
                    placeholder="Рубрика"
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    value={editSubtitle}
                    onChange={(e) => setEditSubtitle(e.target.value)}
                    placeholder="Подзаголовок"
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  <input
                    type="text"
                    value={editPreviewDesc}
                    onChange={(e) => setEditPreviewDesc(e.target.value)}
                    placeholder="Краткое описание превью"
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <textarea
                  value={editMarkdown}
                  onChange={(e) => setEditMarkdown(e.target.value)}
                  rows={14}
                  className="w-full p-3.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          )}

          {/* ВКЛАДКА 3: Визуал (Модуль 3) */}
          {activeTab === 'visuals' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Модуль 3 — Визуальное сопровождение («не сток»)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Обложка (16:9) и внутренние иллюстрации (4:3) в документальной редакционной эстетике
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRerun('visuals')}
                  disabled={rerunning === 'visuals'}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${rerunning === 'visuals' ? 'animate-spin' : ''}`} />
                  {rerunning === 'visuals' ? 'Генерация...' : 'Перегенерировать визуал'}
                </button>
              </div>

              {images.length === 0 ? (
                <div className="p-10 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                  <ImageIcon className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Изображения ещё не созданы</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Убедитесь, что выбран активный провайдер изображений в Настройках, и нажмите «Перегенерировать визуал».
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {images.map((img) => (
                    <div
                      key={img.filename}
                      className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950"
                    >
                      <img
                        src={resolveAssetUrl(img.url)}
                        alt={img.caption}
                        referrerPolicy="no-referrer"
                        className="w-full aspect-video object-cover bg-slate-200 dark:bg-slate-800"
                      />
                      <div className="p-4 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{img.role}</span>
                          <a
                            href={resolveAssetUrl(img.url)}
                            download={img.filename}
                            className="text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                          >
                            Скачать <Download className="w-3 h-3" />
                          </a>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 font-medium">{img.caption}</p>
                        <p className="text-slate-500 dark:text-slate-400">{img.authenticity_note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ВКЛАДКА 4: Артефакты этапов */}
          {activeTab === 'artifacts' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 text-xs">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Этап 1 — Бриф Стратега</h3>
                <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {JSON.stringify(strategistBrief, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Этап 2 — SEO-ядро</h3>
                <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {JSON.stringify(seoCore, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Этап 3 — План Архитектора</h3>
                <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {article.architect_plan || '—'}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  Этап 4 — Первичный черновик Писателя
                </h3>
                <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {article.draft_text || '—'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
