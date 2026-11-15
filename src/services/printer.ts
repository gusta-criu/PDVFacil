import type { ReceiptLine } from '../domain/receipt';

export class PrinterError extends Error {
  constructor(
    message: string,
    readonly reason: 'unavailable' | 'disconnected' | 'no_paper' | 'unknown' = 'unknown',
  ) {
    super(message);
  }
}

/**
 * Interface abstrata da impressora (PRD §7). A implementação Bluetooth/ESC-POS só
 * será escrita depois de escolhido e testado o modelo da impressora (PRD §15.1).
 * O codificador ESC/POS genérico já existe em domain/escpos.ts.
 */
export interface PrinterAdapter {
  readonly id: string;
  readonly label: string;
  /** Envia o resumo. Resolve quando os dados foram enviados; rejeita com PrinterError. */
  print(lines: ReceiptLine[]): Promise<void>;
}

export type PrintJob = { at: string; lines: ReceiptLine[] };

type Listener = (job: PrintJob) => void;

/** Impressora simulada: mostra o resumo na tela. Pode simular falha para testar a recuperação. */
export class MockPrinter implements PrinterAdapter {
  readonly id = 'mock';
  readonly label = 'Impressora simulada (pré-visualização na tela)';
  simulateFailure = false;
  private listeners = new Set<Listener>();

  onPrint(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  async print(lines: ReceiptLine[]): Promise<void> {
    await new Promise((r) => setTimeout(r, 300));
    if (this.simulateFailure) {
      throw new PrinterError('Impressora desconectada (falha simulada).', 'disconnected');
    }
    const job = { at: new Date().toISOString(), lines };
    this.listeners.forEach((l) => l(job));
  }
}

export const mockPrinter = new MockPrinter();

export function getPrinter(): PrinterAdapter {
  return mockPrinter;
}
