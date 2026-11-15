import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { emptyCart, totalCents } from '../domain/cart';
import { formatBRL } from '../domain/money';
import type { Cart } from '../domain/types';
import type { PdvRepository } from '../data/repository';
import { openRepository } from '../services/database';
import { mockPrinter, type PrintJob } from '../services/printer';
import { AppProvider, Splash, useApp } from './appContext';
import { Button, DialogProvider, Modal, useDialogs } from './components/dialogs';
import { ClosingScreen } from './screens/ClosingScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ProductsScreen } from './screens/ProductsScreen';
import { SaleScreen } from './screens/SaleScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'sale' | 'history' | 'closing' | 'products' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sale', label: 'Venda', icon: '🛒' },
  { id: 'history', label: 'Histórico', icon: '🧾' },
  { id: 'closing', label: 'Caixa', icon: '📊' },
  { id: 'products', label: 'Produtos', icon: '🥩' },
  { id: 'settings', label: 'Ajustes', icon: '⚙️' },
];

export function App() {
  const [repo, setRepo] = useState<PdvRepository | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openRepository().then(setRepo, (e: Error) => setError(e.message));
  }, []);

  if (error) return <Splash text={`Erro ao abrir o banco de dados: ${error}`} />;
  if (!repo) return <Splash text="Casa do Bife" />;

  return (
    <DialogProvider>
      <AppProvider repo={repo}>
        <Shell />
      </AppProvider>
    </DialogProvider>
  );
}

function Shell() {
  const { repo, settings } = useApp();
  const dialogs = useDialogs();
  const [tab, setTab] = useState<Tab>('sale');
  const [initialCart, setInitialCart] = useState<Cart | null>(null);

  // Retomada segura de venda em andamento após fechamento inesperado (PRD §11).
  useEffect(() => {
    void (async () => {
      const open = await repo.loadOpenCart();
      if (!open || open.items.length === 0) return setInitialCart(emptyCart());
      const resume = await dialogs.confirm({
        title: 'Venda em andamento encontrada',
        message: (
          <p>
            Havia uma venda não finalizada com <b>{open.items.length} itens</b>, total <b>{formatBRL(totalCents(open))}</b>.
            Deseja continuar de onde parou?
          </p>
        ),
        confirmLabel: 'Continuar venda',
        cancelLabel: 'Descartar',
      });
      if (resume) {
        await repo.audit('cart_recovered', { items: open.items.length, total: totalCents(open) });
        setInitialCart(open);
      } else {
        await repo.audit('cart_cancelled', {
          recovered: true,
          items: open.items.map((i) => ({ name: i.productName, cents: i.priceCents })),
          total: totalCents(open),
        });
        await repo.saveOpenCart(null);
        setInitialCart(emptyCart());
      }
    })();
  }, [repo, dialogs]);

  // Botão "voltar" do Android: volta para a venda; na venda, minimiza o app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(({ App: CapApp }) =>
      CapApp.addListener('backButton', () => {
        setTab((t) => {
          if (t !== 'sale') return 'sale';
          void CapApp.minimizeApp();
          return t;
        });
      }).then((h) => (remove = () => void h.remove())),
    );
    return () => remove?.();
  }, []);

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center justify-between bg-red-900 px-4 py-2 text-white">
        <span className="text-xl font-black tracking-wide">{settings.store.name.toUpperCase()}</span>
        <span className="text-sm opacity-80">PDV · não fiscal</span>
      </header>

      <main className="relative min-h-0 flex-1">
        {/* A tela de venda fica sempre montada para não perder o carrinho ao trocar de aba. */}
        <div className={tab === 'sale' ? 'h-full' : 'hidden'}>
          {initialCart ? <SaleScreen initialCart={initialCart} /> : null}
        </div>
        {tab === 'history' && <HistoryScreen />}
        {tab === 'closing' && <ClosingScreen />}
        {tab === 'products' && <ProductsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav className="grid grid-cols-5 border-t border-stone-300 bg-white pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`flex min-h-16 flex-col items-center justify-center text-sm font-semibold ${
              tab === t.id ? 'text-red-800' : 'text-stone-500'
            }`}
          >
            <span className="text-2xl">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <ReceiptPreview />
    </div>
  );
}

/** Mostra na tela o que a impressora simulada "imprimiu". */
function ReceiptPreview() {
  const [job, setJob] = useState<PrintJob | null>(null);
  useEffect(() => mockPrinter.onPrint(setJob), []);
  if (!job) return null;
  return (
    <Modal onClose={() => setJob(null)}>
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Impressora simulada</h2>
        <div className="mx-auto w-fit bg-stone-50 p-3 shadow-inner">
          <pre className="font-mono text-[13px] leading-snug">
            {job.lines.map((l, i) => (
              <div key={i} className={l.bold ? 'font-bold' : ''}>
                {l.text || ' '}
              </div>
            ))}
          </pre>
        </div>
        <Button full onClick={() => setJob(null)}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
