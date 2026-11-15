import { Capacitor } from '@capacitor/core';
import type { Backup } from '../data/repository';

function fileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `backup-casa-do-bife-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/**
 * Salva o backup e abre o menu de compartilhamento do Android (WhatsApp, Drive, e-mail...),
 * para que a cópia saia do aparelho. No navegador, faz download do arquivo.
 */
export async function saveBackupFile(backup: Backup): Promise<string> {
  const name = fileName();
  const json = JSON.stringify(backup);
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'Backup Casa do Bife PDV', files: [uri] });
    return name;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Arquivo de backup corrompido ou inválido.');
  }
}
