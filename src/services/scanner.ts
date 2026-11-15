import { Capacitor } from '@capacitor/core';

export type ScanResult =
  | { kind: 'ok'; code: string }
  | { kind: 'cancelled' }
  | { kind: 'unavailable'; message: string };

export const scannerIsNative = () => Capacitor.isNativePlatform();

/**
 * Leitura de EAN-13 pela câmera traseira usando o leitor do Google (ML Kit code scanner).
 * Retorna o código bruto; a validação é feita pelo parser, independente da biblioteca.
 *
 * No navegador não há câmera nativa: a UI oferece digitação do código (modo simulado).
 */
export async function scanEan13(): Promise<ScanResult> {
  if (!Capacitor.isNativePlatform()) {
    return { kind: 'unavailable', message: 'Câmera disponível apenas no aplicativo Android.' };
  }
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
  try {
    const { supported } = await BarcodeScanner.isSupported();
    if (!supported) return { kind: 'unavailable', message: 'Este aparelho não suporta leitura pela câmera.' };

    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      return {
        kind: 'unavailable',
        message:
          'O módulo de leitura do Google está sendo instalado (precisa de internet só nesta primeira vez). Tente novamente em alguns segundos.',
      };
    }

    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13] });
    const code = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
    return code ? { kind: 'ok', code } : { kind: 'cancelled' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) return { kind: 'cancelled' };
    return { kind: 'unavailable', message: `Falha na câmera: ${msg}` };
  }
}

export function vibrate(ms = 60): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem suporte */
  }
}
