import { useState } from 'react';
import { totalCents, validateCheckout } from '../../domain/cart';
import { formatBRL, parseMoneyToCents } from '../../domain/money';
import { formatSaleNumber } from '../../domain/receipt';
import { PAYMENT_LABELS_UI, type Cart, type PaymentMethod, type SaleWithItems } from '../../domain/types';
import { useApp } from '../appContext';
import { Button, TextInput, useDialogs } from '../components/dialogs';

const METHODS: { id: PaymentMethod; icon: string }[] = [
  { id: 'pix', icon: '⚡' },
  { id: 'cash', icon: '💵' },
  { id: 'card', icon: '💳' },
];

export function CheckoutScreen({
  cart,
  onBack,
  onNewSale,
}: {
  cart: Cart;
  onBack: () => void;
  onNewSale: () => void;
}) {
  const { repo, printSale, bumpData } = useApp();
  const dialogs = useDialogs();
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [received, setReceived] = useState('');
  const [saving, setSaving] = useState(false);
  const [sale, setSale] = useState<SaleWithItems | null>(null);
  const [printing, setPrinting] = useState(false);

  const total = totalCents(cart);
  const receivedCents = received.trim() === '' ? total : parseMoneyToCents(received);
  const validation =
    method === null
      ? null
      : validateCheckout(cart, { method, receivedCents: method === 'cash' ? (receivedCents ?? -1) : undefined });

  const confirm = async () => {
    if (saving || !method || !validation?.ok) return;
    setSaving(true);
    try {
      const s = await repo.completeSale(cart, {
        method,
        receivedCents: method === 'cash' ? (receivedCents ?? undefined) : undefined,
      });
      setSale(s);
      bumpData();
    } catch (e) {
      await dialogs.alert(
        'A venda NÃO foi salva',
        <>
          <p>{(e as Error).message}</p>
          <p className="mt-2">Os itens continuam no carrinho. Verifique o espaço livre do celular e tente de novo.</p>
        </>,
      );
    } finally {
      setSaving(false);
    }
  };

  const print = async (reprint: boolean) => {
    if (!sale || printing) return;
    setPrinting(true);
    try {
      const ok = await printSale(sale, reprint);
      if (ok) dialogs.toast(reprint ? 'Segunda via enviada' : 'Resumo enviado para impressão');
      setSale(await repo.getSale(sale.id));
    } finally {
      setPrinting(false);
    }
  };

  if (sale) {
    return (
      <div className="flex h-full flex-col items-stretch justify-center gap-4 p-6 text-center">
        <div className="text-6xl">✅</div>
        <h1 className="text-3xl font-black">Venda {formatSaleNumber(sale.sequentialNumber)} concluída</h1>
        <p className="text-2xl">
          {formatBRL(sale.totalCents)} · {PAYMENT_LABELS_UI[sale.paymentMethod]}
        </p>
        {sale.paymentMethod === 'cash' && (
          <p className="rounded-xl bg-yellow-100 p-3 text-3xl font-black text-yellow-900">
            Troco: {formatBRL(sale.changeCents)}
          </p>
        )}
        {sale.printCount === 0 ? (
          <Button big full disabled={printing} onClick={() => print(false)}>
            🖨️ Imprimir resumo
          </Button>
        ) : (
          <Button big full variant="secondary" disabled={printing} onClick={() => print(true)}>
            🖨️ Reimprimir (2ª via)
          </Button>
        )}
        <Button big full variant="success" onClick={onNewSale}>
          Nova venda
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-stone-200 p-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          ← Voltar
        </Button>
        <h1 className="text-2xl font-bold">Finalizar venda</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <ul className="divide-y divide-stone-200 rounded-xl bg-white">
          {cart.items.map((i) => (
            <li key={i.lineId} className="flex justify-between px-3 py-2 text-lg">
              <span className="truncate">
                {i.productName}
                {i.source === 'manual' && <span className="ml-1 text-sm font-bold text-amber-700">(manual)</span>}
              </span>
              <span className="tabular-nums">{formatBRL(i.priceCents)}</span>
            </li>
          ))}
          {cart.discountCents > 0 && (
            <li className="flex justify-between px-3 py-2 text-lg text-stone-600">
              <span>Desconto ({cart.discountReason})</span>
              <span className="tabular-nums">-{formatBRL(cart.discountCents)}</span>
            </li>
          )}
        </ul>

        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold">Total</span>
          <span className="text-5xl font-black tabular-nums">{formatBRL(total)}</span>
        </div>

        <div>
          <h2 className="mb-2 text-xl font-bold">Forma de pagamento</h2>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                aria-pressed={method === m.id}
                className={`flex min-h-24 flex-col items-center justify-center rounded-xl border-4 text-xl font-bold ${
                  method === m.id ? 'border-red-800 bg-red-50' : 'border-stone-200 bg-white'
                }`}
              >
                <span className="text-3xl">{m.icon}</span>
                {PAYMENT_LABELS_UI[m.id]}
              </button>
            ))}
          </div>
        </div>

        {method === 'cash' && (
          <div className="space-y-2">
            <label className="block text-xl font-bold" htmlFor="received">
              Valor recebido
            </label>
            <TextInput
              id="received"
              inputMode="decimal"
              placeholder={`${formatBRL(total)} (valor exato)`}
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="text-2xl"
            />
            <div className="grid grid-cols-4 gap-2">
              {[5000, 10000, 20000].filter((v) => v >= total).map((v) => (
                <Button key={v} variant="secondary" onClick={() => setReceived(String(v / 100))}>
                  {v / 100}
                </Button>
              ))}
              <Button variant="secondary" onClick={() => setReceived('')}>
                Exato
              </Button>
            </div>
            {validation?.ok ? (
              <p className="text-3xl font-black text-green-800">Troco: {formatBRL(validation.changeCents)}</p>
            ) : (
              validation && <p className="text-lg font-semibold text-red-700">{validation.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 p-4">
        <Button big full variant="success" disabled={!validation?.ok || saving} onClick={confirm}>
          {saving ? 'Salvando…' : 'Confirmar venda'}
        </Button>
      </div>
    </div>
  );
}
