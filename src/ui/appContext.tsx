import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CANDIDATE_LAYOUT, type BarcodeLayout } from '../domain/barcode';
import { buildReceipt, type ReceiptLine } from '../domain/receipt';
import { DEFAULT_STORE, type SaleWithItems, type StoreInfo } from '../domain/types';
import type { PdvRepository } from '../data/repository';
import { getPrinter, mockPrinter, PrinterError } from '../services/printer';
import { useDialogs } from './components/dialogs';

export type AppSettings = {
  store: StoreInfo;
  receiptColumns: number;
  receiptAccents: boolean;
  /** PIN de supervisor para item manual, desconto e cancelamento. Vazio = só confirmação. */
  supervisorPin: string;
  /** Reabre a câmera automaticamente após cada leitura válida. */
  continuousScan: boolean;
  printerSimulateFailure: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  store: DEFAULT_STORE,
  receiptColumns: 32,
  receiptAccents: false,
  supervisorPin: '',
  continuousScan: false,
  printerSimulateFailure: false,
};

type AppCtx = {
  repo: PdvRepository;
  settings: AppSettings;
  layout: BarcodeLayout;
  saveSettings(patch: Partial<AppSettings>): Promise<void>;
  saveLayout(layout: BarcodeLayout): Promise<void>;
  /** Pede PIN se configurado; senão, só confirmação. */
  authorize(action: string): Promise<boolean>;
  receiptFor(sale: SaleWithItems, reprint: boolean): ReceiptLine[];
  /** Imprime e registra a tentativa. Nunca lança: falha vira aviso. */
  printSale(sale: SaleWithItems, reprint: boolean): Promise<boolean>;
  dataVersion: number;
  bumpData(): void;
};

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AppProvider ausente');
  return c;
}

export function AppProvider({ repo, children }: { repo: PdvRepository; children: ReactNode }) {
  const dialogs = useDialogs();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [layout, setLayout] = useState<BarcodeLayout>(CANDIDATE_LAYOUT);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      const s = await repo.getSetting<Partial<AppSettings>>('app_settings', {});
      const merged = { ...DEFAULT_SETTINGS, ...s, store: { ...DEFAULT_STORE, ...s.store } };
      mockPrinter.simulateFailure = merged.printerSimulateFailure;
      setSettings(merged);
      setLayout(await repo.getLayout());
    })();
  }, [repo, dataVersion]);

  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...(settings ?? DEFAULT_SETTINGS), ...patch };
      await repo.setSetting('app_settings', next);
      mockPrinter.simulateFailure = next.printerSimulateFailure;
      setSettings(next);
    },
    [repo, settings],
  );

  const saveLayout = useCallback(
    async (l: BarcodeLayout) => {
      await repo.setSetting('barcode_layout', l);
      await repo.audit('layout_changed', l);
      setLayout(l);
    },
    [repo],
  );

  const authorize = useCallback(
    async (action: string) => {
      const pin = settings?.supervisorPin ?? '';
      if (!pin) return dialogs.confirm({ title: action, message: 'Confirma esta operação?' });
      const typed = await dialogs.prompt({
        title: action,
        label: 'PIN do supervisor',
        inputMode: 'numeric',
        password: true,
        validate: (v) => (v === pin ? null : 'PIN incorreto'),
      });
      return typed === pin;
    },
    [settings, dialogs],
  );

  const receiptFor = useCallback(
    (sale: SaleWithItems, reprint: boolean) =>
      buildReceipt(sale, settings?.store ?? DEFAULT_STORE, {
        columns: settings?.receiptColumns ?? 32,
        accents: settings?.receiptAccents ?? false,
        reprint,
      }),
    [settings],
  );

  const printSale = useCallback(
    async (sale: SaleWithItems, reprint: boolean) => {
      try {
        await getPrinter().print(receiptFor(sale, reprint));
        await repo.recordPrintAttempt(sale.id, { ok: true }, reprint);
        return true;
      } catch (e) {
        const msg = e instanceof PrinterError || e instanceof Error ? e.message : String(e);
        await repo.recordPrintAttempt(sale.id, { ok: false, error: msg }, reprint).catch(() => {});
        await dialogs.alert(
          'Não foi possível imprimir',
          <>
            <p>{msg}</p>
            <p className="mt-2 font-semibold">A venda está salva. Você pode reimprimir depois pelo Histórico.</p>
          </>,
        );
        return false;
      } finally {
        setDataVersion((v) => v + 1);
      }
    },
    [repo, receiptFor, dialogs],
  );

  if (!settings) return <Splash text="Carregando configurações…" />;

  return (
    <Ctx.Provider
      value={{
        repo,
        settings,
        layout,
        saveSettings,
        saveLayout,
        authorize,
        receiptFor,
        printSale,
        dataVersion,
        bumpData: () => setDataVersion((v) => v + 1),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function Splash({ text }: { text: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-red-900 p-6 text-center text-2xl font-bold text-white">
      {text}
    </div>
  );
}
