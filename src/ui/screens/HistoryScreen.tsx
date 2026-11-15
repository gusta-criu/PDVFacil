import { useEffect, useState } from 'react';
import { formatBRL } from '../../domain/money';
import { formatDateTime, formatSaleNumber } from '../../domain/receipt';
import { PAYMENT_LABELS_UI, type Sale, type SaleWithItems } from '../../domain/types';
import { useApp } from '../appContext';
import { Button, Modal, useDialogs } from '../components/dialogs';

function formatDay(businessDate: string): string {
  const [y, m, d] = businessDate.split('-');
  return `${d}/${m}/${y}`;
}

export function HistoryScreen() {
  const { repo, dataVersion } = useApp();
  const [sales, setSales] = useState<Sale[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void repo.listSales({ limit: 300 }).then(setSales);
  }, [repo, dataVersion]);

  const byDay = new Map<string, Sale[]>();
  for (const s of sales) byDay.set(s.businessDate, [...(byDay.get(s.businessDate) ?? []), s]);

  return (
    <div className="h-full overflow-y-auto">
      <h1 className="p-4 text-2xl font-bold">Histórico de vendas</h1>
      {sales.length === 0 && <p className="p-8 text-center text-lg text-stone-500">Nenhuma venda registrada.</p>}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="sticky top-0 bg-stone-200 px-4 py-1 font-bold text-stone-700">{formatDay(day)}</h2>
          <ul className="divide-y divide-stone-200 bg-white">
            {list.map((s) => (
              <li key={s.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-100" onClick={() => setOpenId(s.id)}>
                  <span className="font-mono text-lg font-bold">{formatSaleNumber(s.sequentialNumber)}</span>
                  <span className="text-stone-500">{formatDateTime(s.createdAt).slice(11)}</span>
                  <span className="flex-1 text-stone-600">{PAYMENT_LABELS_UI[s.paymentMethod]}</span>
                  {s.status === 'cancelled' ? (
                    <span className="font-bold text-red-700 line-through">{formatBRL(s.totalCents)}</span>
                  ) : (
                    <span className="text-xl font-bold tabular-nums">{formatBRL(s.totalCents)}</span>
                  )}
                  {s.status === 'completed' && s.printCount === 0 && (
                    <span title="Não impresso" className="text-amber-600">●</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {openId && <SaleDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SaleDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { repo, printSale, authorize, bumpData, receiptFor } = useApp();
  const dialogs = useDialogs();
  const [sale, setSale] = useState<SaleWithItems | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const load = () => repo.getSale(id).then(setSale);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!sale) return null;

  const reprint = async () => {
    setBusy(true);
    try {
      const isReprint = sale.printCount > 0;
      if (await printSale(sale, isReprint)) dialogs.toast(isReprint ? 'Segunda via enviada' : 'Resumo enviado');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!(await authorize(`Cancelar venda ${formatSaleNumber(sale.sequentialNumber)}`))) return;
    const reason = await dialogs.prompt({
      title: 'Motivo do cancelamento',
      message: 'A venda continuará no histórico marcada como cancelada e sairá do total do dia.',
      label: 'Motivo',
      validate: (v) => (v.trim() ? null : 'Informe o motivo'),
    });
    if (reason === null) return;
    try {
      setSale(await repo.cancelSale(sale.id, reason));
      bumpData();
      dialogs.toast('Venda cancelada', 'info');
    } catch (e) {
      await dialogs.alert('Erro', (e as Error).message);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black">Venda {formatSaleNumber(sale.sequentialNumber)}</h2>
            <p className="text-stone-600">{formatDateTime(sale.createdAt)}</p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
        {sale.status === 'cancelled' && (
          <p className="rounded-lg bg-red-100 p-2 font-bold text-red-800">
            CANCELADA em {formatDateTime(sale.cancelledAt!)} — {sale.cancelReason}
          </p>
        )}
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
          {sale.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2 px-3 py-2">
              <span>
                {i.productNameSnapshot}
                {i.source === 'manual' && <span className="ml-1 text-sm font-bold text-amber-700">(manual)</span>}
                {i.barcodeRaw && <span className="block font-mono text-xs text-stone-500">{i.barcodeRaw}</span>}
              </span>
              <span className="tabular-nums">{formatBRL(i.priceCents)}</span>
            </li>
          ))}
        </ul>
        {sale.discountCents > 0 && (
          <p className="text-stone-600">
            Desconto: -{formatBRL(sale.discountCents)} ({sale.discountReason})
          </p>
        )}
        <p className="text-2xl font-black">Total {formatBRL(sale.totalCents)}</p>
        <p>
          Pagamento: <b>{PAYMENT_LABELS_UI[sale.paymentMethod]}</b>
          {sale.paymentMethod === 'cash' &&
            ` · recebido ${formatBRL(sale.paymentAmountCents)} · troco ${formatBRL(sale.changeCents)}`}
        </p>
        <p className="text-sm text-stone-500">
          {sale.printCount === 0 ? 'Ainda não impresso.' : `Impresso ${sale.printCount}x.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={reprint}>
            🖨️ {sale.printCount > 0 ? 'Reimprimir' : 'Imprimir'}
          </Button>
          <Button variant="secondary" onClick={() => setShowReceipt((v) => !v)}>
            {showReceipt ? 'Ocultar resumo' : 'Ver resumo'}
          </Button>
        </div>
        {showReceipt && (
          <pre className="overflow-x-auto rounded-lg bg-stone-100 p-3 font-mono text-sm">
            {receiptFor(sale, sale.printCount > 0).map((l) => l.text).join('\n')}
          </pre>
        )}
        {sale.status === 'completed' && (
          <Button variant="ghost" full onClick={cancel}>
            Cancelar esta venda
          </Button>
        )}
      </div>
    </Modal>
  );
}
