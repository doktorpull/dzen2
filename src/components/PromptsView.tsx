import { Check, Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { PromptItem } from '../types';

interface PromptsViewProps {
  prompts: PromptItem[];
  createModalOpen: boolean;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
  onRefresh: () => Promise<void>;
}

async function copyTextSafe(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export function PromptsView({
  prompts,
  createModalOpen,
  onOpenCreateModal,
  onCloseCreateModal,
  onRefresh,
}: PromptsViewProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [savingTitleId, setSavingTitleId] = useState<number | null>(null);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<PromptItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [expandedPrompt, setExpandedPrompt] = useState<PromptItem | null>(null);
  const [modalContent, setModalContent] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  function closeCreate() {
    setError('');
    onCloseCreateModal();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch('/prompts', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      });
      setTitle('');
      setContent('');
      onCloseCreateModal();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить промт.');
    } finally {
      setSaving(false);
    }
  }

  function startEditTitle(item: PromptItem) {
    setEditingId(item.id);
    setEditingTitle(item.title);
  }

  function cancelEditTitle() {
    setEditingId(null);
    setEditingTitle('');
  }

  async function saveEditTitle(id: number) {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;
    setSavingTitleId(id);
    setError('');
    try {
      await apiFetch(`/prompts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle }),
      });
      setEditingId(null);
      setEditingTitle('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить название.');
    } finally {
      setSavingTitleId(null);
    }
  }

  async function handleCopy(item: PromptItem) {
    await copyTextSafe(item.content);
    setCopiedId(item.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === item.id ? null : prev));
    }, 2000);
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteItem) return;
    const targetId = confirmDeleteItem.id;
    setDeleting(true);
    setError('');
    try {
      await apiFetch(`/prompts/${targetId}`, { method: 'DELETE' });
      if (expandedPrompt?.id === targetId) {
        setExpandedPrompt(null);
      }
      setConfirmDeleteItem(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить промт.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveModalContent(e: FormEvent) {
    e.preventDefault();
    if (!expandedPrompt || !modalContent.trim()) return;
    setSavingModal(true);
    setError('');
    try {
      await apiFetch(`/prompts/${expandedPrompt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: modalContent.trim() }),
      });
      setExpandedPrompt(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить текст промта.');
    } finally {
      setSavingModal(false);
    }
  }

  const filteredPrompts = search.trim()
    ? prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.content.toLowerCase().includes(search.toLowerCase()),
      )
    : prompts;

  return (
    <div className="space-y-5">
      {error && !createModalOpen && (
        <div className="p-3 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg">
          {error}
        </div>
      )}

      {/* Заголовок списка и поиск */}
      {prompts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Сохранённые промты ({filteredPrompts.length})
          </h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или тексту..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>
      )}

      {/* Сетка плиток */}
      {prompts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Промтов пока нет</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Нажмите «Добавить промт» в шапке или кнопку ниже, чтобы создать первую карточку-плитку.
          </p>
          <div>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Добавить промт
            </button>
          </div>
        </div>
      ) : filteredPrompts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          По запросу «{search}» промты не найдены.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPrompts.map((item) => {
            const isEditing = editingId === item.id;
            const isCopied = copiedId === item.id;
            const previewText = item.content.length > 122 ? `${item.content.slice(0, 122)}...` : item.content;

            return (
              <article
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="space-y-3">
                  {/* Короткое редактируемое название */}
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        maxLength={120}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveEditTitle(item.id);
                          } else if (e.key === 'Escape') {
                            cancelEditTitle();
                          }
                        }}
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-semibold bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-blue-600 rounded-lg focus:outline-none"
                      />
                      <button
                        type="button"
                        title="Сохранить название"
                        disabled={savingTitleId === item.id}
                        onClick={() => void saveEditTitle(item.id)}
                        className="p-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Отмена"
                        onClick={cancelEditTitle}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        onClick={() => startEditTitle(item)}
                        title="Нажмите, чтобы отредактировать название"
                        className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug cursor-pointer hover:text-blue-700 dark:hover:text-blue-400 transition-colors line-clamp-2"
                      >
                        {item.title}
                      </h4>
                      <button
                        type="button"
                        title="Редактировать название"
                        onClick={() => startEditTitle(item)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Короткий текст 122 знака + многоточие */}
                  <p
                    onClick={() => {
                      setExpandedPrompt(item);
                      setModalContent(item.content);
                    }}
                    title="Нажмите, чтобы открыть полный текст промта"
                    className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap break-words cursor-pointer hover:text-slate-800 dark:hover:text-slate-300"
                  >
                    {previewText}
                  </p>
                </div>

                {/* Кнопки действий плитки */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(item)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      isCopied
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {isCopied ? 'Скопировано' : 'Скопировать'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteItem(item)}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Модальное окно добавления нового промта */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Добавить новый промт</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Сохраните короткое название и текст инструкции в библиотеку плиток.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Короткое название
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                  maxLength={120}
                  placeholder="Напр.: Рерайт под живой стиль Дзена"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Текст промта
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={6}
                  placeholder="Вставьте полный текст промта..."
                  className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreate}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {saving ? 'Добавление...' : 'Добавить промт'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения удаления */}
      {confirmDeleteItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          onClick={() => !deleting && setConfirmDeleteItem(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Вы действительно хотите удалить промт?
              </h3>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Промт <span className="font-medium text-slate-800 dark:text-slate-200">«{confirmDeleteItem.title}»</span>{' '}
              будет удалён без возможности восстановления.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteItem(null)}
                className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg whitespace-nowrap"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно просмотра / редактирования полного текста промта */}
      {expandedPrompt && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          onClick={() => setExpandedPrompt(null)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{expandedPrompt.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Полный текст промта ({modalContent.length} зн.)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedPrompt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModalContent} className="space-y-4">
              <textarea
                value={modalContent}
                onChange={(e) => setModalContent(e.target.value)}
                rows={10}
                required
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy({ ...expandedPrompt, content: modalContent })}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Скопировать текст
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedPrompt(null)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                  >
                    Закрыть
                  </button>
                  <button
                    type="submit"
                    disabled={savingModal}
                    className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg whitespace-nowrap"
                  >
                    {savingModal ? 'Сохранение...' : 'Сохранить изменения'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
