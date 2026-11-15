import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isLayoutConsistent, parseScaleBarcode, type BarcodeLayout } from '../../domain/barcode';
import { formatBRL, parseMoneyToCents } from '../../domain/money';
import type { LabelValidation } from '../../data/repository';
import { readBackupFile, saveBackupFile } from '../../services/backupFile';
import { getPrinter } from '../../services/printer';
import { scanEan13, scannerIsNative } from '../../services/scanner';
import { useApp } from '../appContext';
import { Button, TextInput, useDialogs } from '../components/dialogs';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center gap-3 text-lg">
      <input type="checkbox" className="h-7 w-7" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SettingsScreen() {
  const { settings, saveSettings, repo, bumpData } = useApp();
  const dialogs = useDialogs();
  const [storeName, setStoreName] = useState(settings.store.name);
  const [header, setHeader] = useState(settings.store.headerLines.join('\n'));
  const [footer, setFooter] = useState(settings.store.footerLines.join('\n'));
  const fileRef = useRef<HTMLInputElement>(null);

  const saveStore = async () => {
    const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
    await saveSettings({ store: { name: storeName.trim() || 'CASA DO BIFE', headerLines: lines(header), footerLines: lines(footer) } });
    dialogs.toast('Dados da loja salvos');
  };

  const testPrint = async () => {
    const cols = settings.receiptColumns;
    try {
      await getPrinter().print([
        { text: 'TESTE DE IMPRESSAO', bold: true },
        { text: settings.store.name.toUpperCase() },
        { text: '1234567890'.repeat(Math.ceil(cols / 10)).slice(0, cols) },
        { text: '-'.repeat(cols) },
        { text: settings.receiptAccents ? 'Acentos: ÁÉÍÓÚ ÃÕ Ç' : 'Acentos desativados' },
        { text: `${cols} colunas` },
      ]);
      dialogs.toast('Teste enviado');
    } catch (e) {
      await dialogs.alert('Falha no teste de impressão', (e as Error).message);
    }
  };

  const exportBackup = async () => {
    try {
      const name = await saveBackupFile(await repo.exportBackup());
      await repo.audit('backup_exported', { name });
      dialogs.toast('Backup gerado. Guarde o arquivo fora do celular.');
    } catch (e) {
      await dialogs.alert('Falha no backup', (e as Error).message);
    }
  };

  const importBackup = async (file: File) => {
    try {
      const data = await readBackupFile(file);
      const ok = await dialogs.confirm({
        title: 'Restaurar backup?',
        message: (
          <>
            <p>
              Arquivo: <b>{file.name}</b>
            </p>
            <p className="mt-2 font-bold text-red-700">
              TODOS os dados atuais deste celular (vendas, produtos e configurações) serão substituídos pelos do backup.
            </p>
            <p className="mt-2">Recomendado: gere um backup do estado atual antes.</p>
          </>
        ),
        confirmLabel: 'Restaurar',
        danger: true,
      });
      if (!ok) return;
      const r = await repo.importBackup(data);
      await repo.audit('backup_restored', { file: file.name, ...r });
      bumpData();
      await dialogs.alert('Backup restaurado', `${r.sales} vendas e ${r.products} produtos restaurados.`);
    } catch (e) {
      await dialogs.alert('Backup não restaurado', (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto bg-stone-100 p-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <Section title="Dados da loja (cabeçalho do resumo)">
        <label className="block">
          <span className="font-semibold">Nome</span>
          <TextInput value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </label>
        <label className="block">
          <span className="font-semibold">Linhas do cabeçalho (endereço, telefone…)</span>
          <textarea
            rows={3}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            className="w-full rounded-xl border-2 border-stone-300 p-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="font-semibold">Mensagem do rodapé</span>
          <textarea
            rows={2}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            className="w-full rounded-xl border-2 border-stone-300 p-3 text-lg"
          />
        </label>
        <Button onClick={saveStore}>Salvar dados da loja</Button>
      </Section>

      <Section title="Impressora">
        <p className="rounded-lg bg-amber-100 p-2 text-amber-900">
          Impressora em uso: <b>{getPrinter().label}</b>. A conexão Bluetooth será adicionada quando o modelo da impressora
          for definido.
        </p>
        <label className="block">
          <span className="font-semibold">Largura do papel</span>
          <select
            value={settings.receiptColumns}
            onChange={(e) => saveSettings({ receiptColumns: Number(e.target.value) })}
            className="min-h-12 w-full rounded-xl border-2 border-stone-300 bg-white px-3 text-lg"
          >
            <option value={32}>58 mm — 32 colunas (padrão)</option>
            <option value={42}>58 mm fonte pequena — 42 colunas</option>
            <option value={48}>80 mm — 48 colunas</option>
          </select>
        </label>
        <Toggle label="Imprimir acentos" checked={settings.receiptAccents} onChange={(v) => saveSettings({ receiptAccents: v })} />
        <Toggle
          label="Simular falha da impressora (teste)"
          checked={settings.printerSimulateFailure}
          onChange={(v) => saveSettings({ printerSimulateFailure: v })}
        />
        <Button variant="secondary" onClick={testPrint}>
          Imprimir teste
        </Button>
      </Section>

      <Section title="Leitura e segurança">
        <Toggle
          label="Leitura contínua (reabrir a câmera após cada etiqueta)"
          checked={settings.continuousScan}
          onChange={(v) => saveSettings({ continuousScan: v })}
        />
        <PinSetting />
      </Section>

      <LayoutSection />

      <Section title="Backup">
        <p className="text-stone-600">
          Gere um backup ao fim do dia e envie para fora do celular (WhatsApp, Drive ou e-mail). Se o celular quebrar, o
          histórico pode ser restaurado em outro aparelho.
        </p>
        <Button full onClick={exportBackup}>
          Gerar backup
        </Button>
        <Button full variant="secondary" onClick={() => fileRef.current?.click()}>
          Restaurar backup…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importBackup(e.target.files[0])}
        />
      </Section>

      <AuditSection />
      <p className="pb-4 text-center text-sm text-stone-500">Casa do Bife PDV · v0.1.0 · documento não fiscal</p>
    </div>
  );
}

function PinSetting() {
  const { settings, saveSettings, authorize } = useApp();
  const dialogs = useDialogs();
  const change = async () => {
    if (settings.supervisorPin && !(await authorize('Alterar PIN'))) return;
    const pin = await dialogs.prompt({
      title: 'PIN do supervisor',
      message: 'Exigido para item manual, desconto e cancelamento de venda. Deixe vazio para desativar.',
      inputMode: 'numeric',
      password: true,
      validate: (v) => (v === '' || /^\d{4,8}$/.test(v) ? null : 'Use 4 a 8 números'),
    });
    if (pin === null) return;
    await saveSettings({ supervisorPin: pin });
    dialogs.toast(pin ? 'PIN definido' : 'PIN desativado');
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-lg">PIN do supervisor: {settings.supervisorPin ? <b>ativo</b> : 'desativado'}</span>
      <Button variant="secondary" onClick={change}>
        Alterar
      </Button>
    </div>
  );
}

const MIN_VALIDATIONS = 5;

function LayoutSection() {
  const { layout, saveLayout, repo, authorize } = useApp();
  const dialogs = useDialogs();
  const [records, setRecords] = useState<LabelValidation[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [printed, setPrinted] = useState('');
  const [draft, setDraft] = useState<BarcodeLayout>(layout);
  const [advanced, setAdvanced] = useState(false);

  const load = () => repo.listLabelValidations().then(setRecords);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setDraft(layout), [layout]);

  // Reavalia todas as leituras com o layout atual.
  const evaluated = records.map((r) => {
    const p = parseScaleBarcode(r.barcodeRaw, layout);
    const value = p.ok ? p.value.priceCents : null;
    return { ...r, parsed: p, matchesNow: p.ok && value === r.printedTotalCents };
  });
  const matches = evaluated.filter((r) => r.matchesNow);
  const mismatches = evaluated.filter((r) => !r.matchesNow);
  const distinctProducts = new Set(matches.map((r) => (r.parsed.ok ? r.parsed.value.productCode : ''))).size;
  const canValidate = matches.length >= MIN_VALIDATIONS && mismatches.length === 0 && distinctProducts >= 2;

  const scan = async () => {
    const r = await scanEan13();
    if (r.kind === 'ok') setCode(r.code);
    else if (r.kind === 'unavailable') await dialogs.alert('Câmera indisponível', r.message);
  };

  const add = async () => {
    const cents = parseMoneyToCents(printed);
    if (!/^\d{13}$/.test(code.trim()) || !label.trim() || !cents) {
      return dialogs.alert('Dados incompletos', 'Leia o código e informe o produto e o total impresso na etiqueta.');
    }
    const r = await repo.recordLabelValidation(code, label, cents, layout);
    dialogs.toast(r.matches ? 'Confere ✔' : 'NÃO confere ✘', r.matches ? 'ok' : 'error');
    setCode('');
    setLabel('');
    setPrinted('');
    await load();
  };

  const markValidated = async (validated: boolean) => {
    if (!(await authorize(validated ? 'Marcar layout como validado' : 'Voltar ao modo conferência'))) return;
    await saveLayout({ ...layout, validated });
  };

  const saveDraft = async () => {
    if (!isLayoutConsistent(draft)) return dialogs.alert('Layout inválido', 'Os campos se sobrepõem ou passam do limite.');
    if (!(await authorize('Alterar layout da etiqueta'))) return;
    await saveLayout({ ...draft, validated: false });
    dialogs.toast('Layout alterado. Valide novamente.', 'info');
  };

  const num = (k: keyof BarcodeLayout) => (
    <label className="block">
      <span className="text-sm font-semibold">{k}</span>
      <TextInput
        inputMode="numeric"
        value={String(draft[k])}
        onChange={(e) => setDraft({ ...draft, [k]: k === 'prefix' ? e.target.value.replace(/\D/g, '') : Number(e.target.value.replace(/\D/g, '') || 0) })}
      />
    </label>
  );

  return (
    <Section title="Etiquetas da balança">
      <div className={`rounded-lg p-3 font-semibold ${layout.validated ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
        {layout.validated ? 'Layout VALIDADO com etiquetas reais.' : 'Layout NÃO validado (modo conferência).'}
        <div className="mt-1 font-mono text-sm">
          prefixo {layout.prefix} · produto [{layout.productStart}..{layout.productStart + layout.productLength - 1}] · valor [
          {layout.valueStart}..{layout.valueStart + layout.valueLength - 1}] ({layout.valueKind === 'price_cents' ? 'preço em centavos' : 'peso em gramas'})
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-stone-200 p-3">
        <h3 className="font-bold">Validar com uma etiqueta real</h3>
        <p className="text-sm text-stone-600">
          Leia a etiqueta pela câmera e digite o nome e o TOTAL impressos nela. O app confere se o código decodificado bate.
          Use pelo menos {MIN_VALIDATIONS} etiquetas, de produtos e pesos diferentes, incluindo uma de valor alto.
        </p>
        <div className="flex gap-2">
          <TextInput
            inputMode="numeric"
            placeholder="Código (13 dígitos)"
            maxLength={13}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="font-mono"
          />
          {scannerIsNative() && (
            <Button variant="secondary" onClick={scan} aria-label="Ler pela câmera">
              📷
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextInput placeholder="Produto" value={label} onChange={(e) => setLabel(e.target.value)} />
          <TextInput placeholder="Total R$" inputMode="decimal" value={printed} onChange={(e) => setPrinted(e.target.value)} />
        </div>
        <Button full onClick={add}>
          Registrar leitura
        </Button>
      </div>

      {evaluated.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 text-sm">
          {evaluated.map((r) => (
            <li key={r.id} className={`px-3 py-2 ${r.matchesNow ? '' : 'bg-red-50'}`}>
              <div className="flex justify-between">
                <span className="font-mono">{r.barcodeRaw}</span>
                <span className="font-bold">{r.matchesNow ? '✔' : '✘'}</span>
              </div>
              <div className="text-stone-600">
                {r.productLabel} · etiqueta {formatBRL(r.printedTotalCents)} · lido{' '}
                {r.parsed.ok
                  ? `cód. ${r.parsed.value.productCode}, ${r.parsed.value.priceCents !== null ? formatBRL(r.parsed.value.priceCents) : `${r.parsed.value.weightGrams} g`}`
                  : r.parsed.message}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm">
        {matches.length} conferem · {mismatches.length} não conferem · {distinctProducts} produtos diferentes
      </p>

      {layout.validated ? (
        <Button variant="secondary" full onClick={() => markValidated(false)}>
          Voltar ao modo conferência
        </Button>
      ) : (
        <Button full disabled={!canValidate} onClick={() => markValidated(true)}>
          Marcar layout como validado
        </Button>
      )}
      {!canValidate && !layout.validated && (
        <p className="text-sm text-stone-500">
          Requer ≥ {MIN_VALIDATIONS} leituras conferidas, ≥ 2 produtos diferentes e nenhuma divergência.
        </p>
      )}

      <Button variant="ghost" onClick={() => setAdvanced((v) => !v)}>
        {advanced ? 'Ocultar layout avançado' : 'Editar layout (avançado)'}
      </Button>
      {advanced && (
        <div className="space-y-2">
          <p className="text-sm text-stone-600">Posições começam em 0. Alterar o layout volta para o modo conferência.</p>
          <div className="grid grid-cols-3 gap-2">
            {num('prefix')}
            {num('productStart')}
            {num('productLength')}
            {num('valueStart')}
            {num('valueLength')}
          </div>
          <Button full onClick={saveDraft}>
            Salvar layout
          </Button>
        </div>
      )}
    </Section>
  );
}

const ACTION_LABELS: Record<string, string> = {
  item_removed: 'Item removido',
  cart_cancelled: 'Venda em aberto cancelada',
  sale_cancelled: 'Venda cancelada',
  manual_item: 'Item manual',
  discount: 'Desconto',
  product_quick_register: 'Cadastro rápido',
  product_created: 'Produto criado',
  product_updated: 'Produto alterado',
  layout_changed: 'Layout alterado',
  backup_exported: 'Backup gerado',
  backup_restored: 'Backup restaurado',
  cart_recovered: 'Venda recuperada',
};

function AuditSection() {
  const { repo, dataVersion } = useApp();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof repo.listAudit>>>([]);
  useEffect(() => {
    if (open) void repo.listAudit(100).then(setRows);
  }, [open, repo, dataVersion]);
  return (
    <Section title="Registro de operações">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        {open ? 'Ocultar' : 'Mostrar últimas 100'}
      </Button>
      {open && (
        <ul className="divide-y divide-stone-200 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="py-1">
              <b>{ACTION_LABELS[r.action] ?? r.action}</b> · {new Date(r.at).toLocaleString('pt-BR')}
              {r.details && <div className="break-all text-stone-500">{r.details}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
