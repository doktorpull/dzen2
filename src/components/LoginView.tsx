import { Lock, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch, setAuthToken } from '../api';

interface LoginViewProps {
  usingDefaultPassword: boolean;
  onSuccess: (username: string) => void;
}

export function LoginView({ usingDefaultPassword, onSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState(usingDefaultPassword ? 'dzen2026' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: boolean; username: string; token?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (res.token) {
        setAuthToken(res.token);
      }
      onSuccess(res.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Dzen AI Studio</h1>
            <p className="text-sm text-slate-500">Вход в веб-админку конвейера</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-user" className="block text-sm font-medium text-slate-700 mb-1.5">
              Логин администратора
            </label>
            <input
              id="login-user"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div>
            <label htmlFor="login-pass" className="block text-sm font-medium text-slate-700 mb-1.5">
              Пароль
            </label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Введите пароль"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Проверка...' : 'Войти в панель'}
          </button>
        </form>

        {usingDefaultPassword && (
          <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            Используются стандартные учётные данные из конфигурации (<span className="font-mono text-slate-700">admin / dzen2026</span>). Для продакшена на VPS задайте <span className="font-mono text-slate-700">ADMIN_USERNAME</span> и <span className="font-mono text-slate-700">ADMIN_PASSWORD</span> в <span className="font-mono text-slate-700">.env</span>.
          </div>
        )}
      </div>
    </div>
  );
}
