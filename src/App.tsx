import {
  BookOpenText,
  Compass,
  FileText,
  Link2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from './api';
import { CpaOffersView } from './components/CpaOffersView';
import { LoginView } from './components/LoginView';
import { PipelineWorkspaceView } from './components/PipelineWorkspaceView';
import { PromptsView } from './components/PromptsView';
import { RagLibraryView } from './components/RagLibraryView';
import { SettingsView } from './components/SettingsView';
import { TopicsRadarView } from './components/TopicsRadarView';
import type { AppSettings, Article, CpaOffer, Niche, PromptItem, ProviderStatus, RagSample, Topic } from './types';

type ActiveSection = 'topics' | 'pipeline' | 'prompts' | 'rag' | 'cpa' | 'settings';
type ThemeMode = 'dark' | 'light';

const SECTION_META: Record<ActiveSection, { title: string; subtitle: string }> = {
  topics: { title: 'Радар тем и ниши', subtitle: 'Модуль 1 · Быстрый запуск и скоринг трендов' },
  pipeline: { title: 'Конвейер статей', subtitle: 'Модули 2–4 · 7 этапов, 10-пт валидатор, визуал и выдача' },
  prompts: { title: 'Промты', subtitle: 'Библиотека пользовательских промтов в формате плиток' },
  rag: { title: 'Библиотека стиля RAG', subtitle: 'Эталонные тексты ниш для стилевой мимикрии' },
  cpa: { title: 'Офферы CPA', subtitle: 'Партнёрские ссылки для нативной монетизации' },
  settings: { title: 'Настройки и Docker', subtitle: 'Провайдеры ИИ, Telegram-мост и деплой на порт 8003' },
};

function getInitialTheme(): ThemeMode {
  try {
    return window.localStorage.getItem('dzen_theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);

  const [section, setSection] = useState<ActiveSection>('topics');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [niches, setNiches] = useState<Niche[]>([]);
  const [offers, setOffers] = useState<CpaOffer[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [ragSamples, setRagSamples] = useState<RagSample[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [promptCreateModalOpen, setPromptCreateModalOpen] = useState(false);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('dzen_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const loadAllData = useCallback(async () => {
    setLoadingData(true);
    setLoadError('');
    try {
      const [n, o, t, r, a, p, s] = await Promise.all([
        apiFetch<Niche[]>('/niches'),
        apiFetch<CpaOffer[]>('/cpa-offers'),
        apiFetch<Topic[]>('/topics'),
        apiFetch<RagSample[]>('/rag-samples'),
        apiFetch<Article[]>('/articles'),
        apiFetch<PromptItem[]>('/prompts'),
        apiFetch<{ settings: AppSettings; providers: ProviderStatus[] }>('/settings'),
      ]);
      setNiches(n);
      setOffers(o);
      setTopics(t);
      setRagSamples(r);
      setArticles(a);
      setPrompts(p);
      setSettings(s.settings);
      setProviders(s.providers);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки данных.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    apiFetch<{ authenticated: boolean; username: string | null; usingDefaultPassword: boolean }>('/auth/me')
      .then((res) => {
        setAuthenticated(res.authenticated);
        setUsername(res.username);
        setUsingDefaultPassword(res.usingDefaultPassword);
      })
      .catch(() => {
        setAuthenticated(false);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    if (authenticated) {
      void loadAllData();
    }
  }, [authenticated, loadAllData]);

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setAuthToken(null);
    setAuthenticated(false);
    setUsername(null);
  }

  async function handleStartGeneration(payload: {
    niche_id: number;
    topic_id?: number;
    title?: string;
    cpa_offer_id?: number | null;
  }) {
    const created = await apiFetch<Article>('/articles/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadAllData();
    setSelectedArticleId(created.id);
    setSection('pipeline');
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Проверка сессии...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginView
        usingDefaultPassword={usingDefaultPassword}
        onSuccess={(user) => {
          setUsername(user);
          setAuthenticated(true);
        }}
      />
    );
  }

  const navItems: Array<{ id: ActiveSection; label: string; icon: typeof Compass; count?: number }> = [
    { id: 'topics', label: 'Радар тем', icon: Compass, count: topics.length },
    { id: 'pipeline', label: 'Конвейер статей', icon: FileText, count: articles.length },
    { id: 'prompts', label: 'Промты', icon: Terminal, count: prompts.length },
    { id: 'rag', label: 'Стиль RAG', icon: BookOpenText, count: ragSamples.length },
    { id: 'cpa', label: 'Офферы CPA', icon: Link2, count: offers.length },
    { id: 'settings', label: 'Настройки и Docker', icon: Settings },
  ];

  const meta = SECTION_META[section];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Боковая панель (256px на десктопе) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              Dzen AI Studio
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors flex items-center justify-between gap-2 whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.count !== undefined && (
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        isActive ? 'text-slate-300 dark:text-blue-100' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {settings && (
            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="truncate">
                Текст: <span className="font-mono text-slate-800 dark:text-slate-200">{settings.text_provider}</span>
              </div>
              <div className="truncate">
                Визуал: <span className="font-mono text-slate-800 dark:text-slate-200">{settings.image_provider}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{username || 'admin'}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Выйти
            </button>
          </div>
        </div>
      </aside>

      {/* Основной контент */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{meta.title}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{meta.subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {section === 'prompts' && (
              <button
                type="button"
                onClick={() => setPromptCreateModalOpen(true)}
                className="px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить промт
              </button>
            )}
            <button
              type="button"
              onClick={() => setSection('topics')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                section === 'prompts'
                  ? 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                  : 'bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white'
              }`}
            >
              Новая статья
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
          {loadError && (
            <div className="mb-5 p-4 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => void loadAllData()}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 whitespace-nowrap"
              >
                Повторить
              </button>
            </div>
          )}

          {loadingData && niches.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Загрузка рабочего пространства...
            </div>
          ) : (
            <>
              {section === 'topics' && (
                <TopicsRadarView
                  niches={niches}
                  offers={offers}
                  topics={topics}
                  onRefresh={loadAllData}
                  onStartGeneration={handleStartGeneration}
                  onNicheCreated={(n) => setNiches((prev) => [...prev, n])}
                />
              )}

              {section === 'pipeline' && settings && (
                <PipelineWorkspaceView
                  articles={articles}
                  selectedArticleId={selectedArticleId}
                  settings={settings}
                  onSelectArticle={setSelectedArticleId}
                  onRefresh={loadAllData}
                  onGoToTopics={() => setSection('topics')}
                />
              )}

              {section === 'prompts' && (
                <PromptsView
                  prompts={prompts}
                  createModalOpen={promptCreateModalOpen}
                  onOpenCreateModal={() => setPromptCreateModalOpen(true)}
                  onCloseCreateModal={() => setPromptCreateModalOpen(false)}
                  onRefresh={loadAllData}
                />
              )}

              {section === 'rag' && (
                <RagLibraryView niches={niches} samples={ragSamples} onRefresh={loadAllData} />
              )}

              {section === 'cpa' && (
                <CpaOffersView niches={niches} offers={offers} onRefresh={loadAllData} />
              )}

              {section === 'settings' && settings && (
                <SettingsView
                  settings={settings}
                  providers={providers}
                  onUpdated={(s, p) => {
                    setSettings(s);
                    setProviders(p);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
