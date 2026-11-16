import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { CpaOffer, Niche } from '../types';

interface CpaOffersViewProps {
  niches: Niche[];
  offers: CpaOffer[];
  onRefresh: () => Promise<void>;
}

export function CpaOffersView({ niches, offers, onRefresh }: CpaOffersViewProps) {
  const [nicheId, setNicheId] = useState<number>(niches[0]?.id || 1);
  const [title, setTitle] = useState('');
  const [affiliateUrl, setAffiliateUrl] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [pitchHint, setPitchHint] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/cpa-offers', {
        method: 'POST',
        body: JSON.stringify({
          niche_id: nicheId,
          title,
          affiliate_url: affiliateUrl,
          anchor_text: anchorText,
          payout_note: payoutNote,
          pitch_hint: pitchHint,
        }),
      });
      setTitle('');
      setAffiliateUrl('');
      setAnchorText('');
      setPayoutNote('');
      setPitchHint('');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(offer: CpaOffer) {
    await apiFetch(`/cpa-offers/${offer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: offer.is_active ? 0 : 1 }),
    });
    await onRefresh();
  }

  async function deleteOffer(id: number) {
    await apiFetch(`/cpa-offers/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Добавить CPA-оффер</h2>
          <p className="text-xs text-slate-500 mt-1">
            Стратег и Писатель автоматически встраивают активные партнёрские ссылки в статьи выбранной ниши.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ниша</label>
            <select
              value={nicheId}
              onChange={(e) => setNicheId(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              {niches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Название оффера (напр. Дебетовая карта с кэшбэком)"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <input
            type="url"
            value={affiliateUrl}
            onChange={(e) => setAffiliateUrl(e.target.value)}
            required
            placeholder="https://partner.example.com/?sub=dzen"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              required
              placeholder="Анкор ссылки"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              placeholder="Выплата (напр. 1800 ₽/лид)"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <textarea
            value={pitchHint}
            onChange={(e) => setPitchHint(e.target.value)}
            rows={3}
            placeholder="Нативный тезис: как естественно подвести читателя к ссылке"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Сохранение...' : 'Сохранить CPA-оффер'}
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Партнёрские офферы ({offers.length})</h3>
        </div>
        {offers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Офферы пока не добавлены. Добавьте первый CPA-оффер слева для автоматической интеграции в статьи.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {offers.map((offer) => (
              <div key={offer.id} className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-semibold text-slate-900">{offer.title}</div>
                  <div className="text-slate-500 flex flex-wrap items-center gap-1.5">
                    <span>{offer.niche_name}</span>
                    {offer.payout_note && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-800">{offer.payout_note}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <a
                      href={offer.affiliate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {offer.anchor_text} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  {offer.pitch_hint && <p className="text-slate-600 pt-1">{offer.pitch_hint}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleOffer(offer)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                      offer.is_active
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {offer.is_active ? 'Активен' : 'Пауза'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOffer(offer.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
