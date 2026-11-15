import { useEffect, useState } from 'react';
import { toBusinessDate, type DailyClosing } from '../../domain/closing';
import { formatBRL } from '../../domain/money';
import { PAYMENT_LABELS_UI, type PaymentMethod } from '../../domain/types';
import { useApp } from '../appContext';

function formatDay(businessDate: string): string {
  const [y, m, d] = businessDate.split('-');
  return `${d}/${m}/${y}`;
}

export function ClosingScreen() {
  const { repo, dataVersion } = useApp();
  const today = toBusinessDate(new Date());
  const [date, setDate] = useState(today);
  const [dates, setDates] = useState<string[]>([]);
  const [closing, setClosing] = useState<DailyClosing | null>(null);

  useEffect(() => {
    void repo.listBusinessDates().then((d) => setDates(d.includes(today) ? d : [today, ...d]));
  }, [repo, dataVersion, today]);

  useEffect(() => {
    void repo.dailyClosing(date).then(setClosing);
  }, [repo, date, dataVersion]);

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <h1 className="text-2xl font-bold">Fechamento do dia</h1>
      <select
        aria-label="Data"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="min-h-12 w-full rounded-xl border-2 border-stone-300 bg-white px-3 text-xl"
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {formatDay(d)}
            {d === today ? ' (hoje)' : ''}
          </option>
        ))}
      </select>

      {closing && (
        <>
          <div className="rounded-2xl bg-red-900 p-5 text-white">
            <div className="text-lg opacity-80">Total vendido</div>
            <div className="text-5xl font-black tabular-nums">{formatBRL(closing.totalCents)}</div>
            <div className="mt-1 text-lg">
              {closing.salesCount} {closing.salesCount === 1 ? 'venda' : 'vendas'}
            </div>
          </div>

          <div className="divide-y divide-stone-200 rounded-2xl bg-white">
            {(Object.keys(closing.byPayment) as PaymentMethod[]).map((m) => (
              <div key={m} className="flex items-center justify-between px-4 py-3 text-xl">
                <span>
                  {PAYMENT_LABELS_UI[m]} <span className="text-base text-stone-500">({closing.byPayment[m].count})</span>
                </span>
                <span className="font-bold tabular-nums">{formatBRL(closing.byPayment[m].totalCents)}</span>
              </div>
            ))}
          </div>

          <div className="divide-y divide-stone-200 rounded-2xl bg-white text-lg">
            <div className="flex justify-between px-4 py-3">
              <span>Descontos concedidos</span>
              <span className="tabular-nums">{formatBRL(closing.discountCents)}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span>Cancelamentos ({closing.cancelledCount})</span>
              <span className="tabular-nums">{formatBRL(closing.cancelledTotalCents)}</span>
            </div>
          </div>
          <p className="text-sm text-stone-500">Vendas canceladas não entram no total. Detalhes no Histórico.</p>
        </>
      )}
    </div>
  );
}
