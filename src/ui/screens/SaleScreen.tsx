import { useEffect, useRef, useState } from 'react';
import { parseScaleBarcode } from '../../domain/barcode';
import { addItem, applyDiscount, checkDuplicate, emptyCart, removeItem, subtotalCents, totalCents } from '../../domain/cart';
import { isThirteenDigits } from '../../domain/ean13';
import { formatBRL, parseMoneyToCents } from '../../domain/money';
import type { Cart, CartItem, Product } from '../../domain/types';
import { scanEan13, scannerIsNative, vibrate } from '../../services/scanner';
import { useApp } from '../appContext';
import { Button, Modal, TextInput, useDialogs } from '../components/dialogs';
import { CheckoutScreen } from './CheckoutScreen';

const SAMPLE_CODES = [
  { code: '2000003006496', label: 'Patinho R$ 6,49' },
  { code: '2000018090480', label: 'Maminha R$ 90,48' },
  { code: '2000000201405', label: 'Diversos R$ 201,40' },
];

function newLineId(): string {
  return crypto.randomUUID();
}

export function SaleScreen({ initialCart }: { initialCart: Cart }) {
  const { repo, layout, settings, authorize } = useApp();
  const dialogs = useDialogs();
  const [cart, setCart] = useState<Cart>(initialCart);
  const cartRef = useRef(cart);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const busy = useRef(false);
  const firstRender = useRef(true);

  const updateCart = (next: Cart) => {
    cartRef.current = next;
    setCart(next);
  };

  // Salva o carrinho a cada alteração (recuperação após fechamento inesperado).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    repo.saveOpenCart(cart).catch((e) => dialogs.toast(`Falha ao salvar carrinho: ${e.message}`, 'error'));
  }, [cart, repo, dialogs]);

  const quickRegister = async (code: string): Promise<Product | null> => {
    const name = await dialogs.prompt({
      title: 'Produto não cadastrado',
      message: (
        <p>
          O código <b>{code}</b> da balança ainda não tem nome no app. Confira o nome impresso na etiqueta e
          cadastre:
        </p>
      ),
      label: 'Nome do produto',
      placeholder: 'Ex.: Patinho',
      confirmLabel: 'Cadastrar e adicionar',
      validate: (v) => (v.trim() ? null : 'Informe o nome'),
    });
    if (name === null) return null;
    try {
      const p = await repo.saveProduct({ scaleCode: code, name });
      await repo.audit('product_quick_register', { code, name });
      return p;
    } catch (e) {
      await dialogs.alert('Não foi possível cadastrar', (e as Error).message);
      return null;
    }
  };

  /** Retorna true se o item foi adicionado. */
  const handleCode = async (raw: string): Promise<boolean> => {
    const parsed = parseScaleBarcode(raw, layout);
    if (!parsed.ok) {
      vibrate(300);
      await dialogs.alert('Etiqueta recusada', parsed.message);
      return false;
    }
    const { productCode, priceCents } = parsed.value;
    if (priceCents === null) {
      await dialogs.alert(
        'Layout sem preço',
        'O layout configurado lê peso, não preço. Nesta versão o preço precisa vir na etiqueta.',
      );
      return false;
    }
    let product = await repo.getProductByScaleCode(productCode);
    if (!product) {
      product = await quickRegister(productCode);
      if (!product) return false;
    }
    if (!product.active) {
      await dialogs.alert(
        'Produto desativado',
        `"${product.name}" (código ${product.scaleCode}) está desativado. Reative em Produtos para vender.`,
      );
      return false;
    }

    const dup = checkDuplicate(cartRef.current, parsed.value.raw);
    if (dup.kind === 'recent_repeat') {
      const ok = await dialogs.confirm({
        title: 'Leitura repetida',
        message: `Esta etiqueta (${dup.existing.productName}, ${formatBRL(dup.existing.priceCents)}) acabou de ser lida. É outra embalagem igual?`,
        confirmLabel: 'Sim, adicionar',
        cancelLabel: 'Não, ignorar',
      });
      if (!ok) return false;
    } else if (dup.kind === 'same_code_in_cart') {
      const ok = await dialogs.confirm({
        title: 'Etiqueta igual já lançada',
        message: `Já há ${dup.count} etiqueta(s) idêntica(s) no carrinho (${dup.existing.productName}, ${formatBRL(dup.existing.priceCents)}). É outra embalagem?`,
        confirmLabel: 'Sim, adicionar',
        cancelLabel: 'Não',
      });
      if (!ok) return false;
    }

    const item: CartItem = {
      lineId: newLineId(),
      source: 'barcode',
      productId: product.id,
      productName: product.name,
      barcodeRaw: parsed.value.raw,
      priceCents,
      weightGrams: null,
      unitPriceCentsPerKg: null,
      addedAt: new Date().toISOString(),
    };
    updateCart(addItem(cartRef.current, item));
    setLastAdded(item.lineId);
    vibrate();
    dialogs.toast(`+ ${product.name}  ${formatBRL(priceCents)}`);
    return true;
  };

  const scan = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!scannerIsNative()) {
        setTyping(true);
        return;
      }
      for (;;) {
        const r = await scanEan13();
        if (r.kind === 'cancelled') break;
        if (r.kind === 'unavailable') {
          await dialogs.alert('Câmera indisponível', r.message);
          setTyping(true);
          break;
        }
        const added = await handleCode(r.code);
        if (!added || !settings.continuousScan) break;
      }
    } finally {
      busy.current = false;
    }
  };

  const remove = async (item: CartItem) => {
    const ok = await dialogs.confirm({
      title: 'Remover item?',
      message: `${item.productName} — ${formatBRL(item.priceCents)}`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    updateCart(removeItem(cartRef.current, item.lineId));
    await repo.audit('item_removed', { name: item.productName, cents: item.priceCents, barcode: item.barcodeRaw });
  };

  const manualItem = async () => {
    if (!(await authorize('Lançamento manual'))) return;
    const name = await dialogs.prompt({
      title: 'Lançamento manual',
      message: 'Use apenas quando a etiqueta estiver ilegível. O item ficará marcado como manual.',
      label: 'Descrição (nome na etiqueta)',
      validate: (v) => (v.trim() ? null : 'Informe a descrição'),
    });
    if (name === null) return;
    const value = await dialogs.prompt({
      title: name,
      label: 'Valor impresso na etiqueta (R$)',
      inputMode: 'decimal',
      placeholder: '0,00',
      validate: (v) => {
        const c = parseMoneyToCents(v);
        return c && c > 0 ? null : 'Valor inválido';
      },
    });
    if (value === null) return;
    const cents = parseMoneyToCents(value)!;
    updateCart(
      addItem(cartRef.current, {
        lineId: newLineId(),
        source: 'manual',
        productId: null,
        productName: name.trim(),
        barcodeRaw: null,
        priceCents: cents,
        weightGrams: null,
        unitPriceCentsPerKg: null,
        addedAt: new Date().toISOString(),
      }),
    );
    await repo.audit('manual_item', { name: name.trim(), cents });
  };

  const discount = async () => {
    if (!(await authorize('Desconto'))) return;
    const value = await dialogs.prompt({
      title: 'Desconto',
      message: `Subtotal: ${formatBRL(subtotalCents(cartRef.current))}. Digite 0 para remover o desconto.`,
      label: 'Valor do desconto (R$)',
      inputMode: 'decimal',
      initial: cartRef.current.discountCents ? String(cartRef.current.discountCents / 100).replace('.', ',') : '',
      validate: (v) => {
        const c = parseMoneyToCents(v);
        if (c === null) return 'Valor inválido';
        if (c > subtotalCents(cartRef.current)) return 'Desconto maior que o subtotal';
        return null;
      },
    });
    if (value === null) return;
    const cents = parseMoneyToCents(value)!;
    let reason = '';
    if (cents > 0) {
      const r = await dialogs.prompt({
        title: 'Motivo do desconto',
        label: 'Motivo',
        placeholder: 'Ex.: arredondamento',
        validate: (v) => (v.trim() ? null : 'Informe o motivo'),
      });
      if (r === null) return;
      reason = r;
    }
    const res = applyDiscount(cartRef.current, cents, reason);
    if (res.ok) updateCart(res.cart);
  };

  const cancelCart = async () => {
    const ok = await dialogs.confirm({
      title: 'Cancelar venda em aberto?',
      message: `Todos os ${cart.items.length} itens serão descartados. Nada foi cobrado ainda.`,
      confirmLabel: 'Cancelar venda',
      cancelLabel: 'Continuar venda',
      danger: true,
    });
    if (!ok) return;
    await repo.audit('cart_cancelled', {
      items: cart.items.map((i) => ({ name: i.productName, cents: i.priceCents })),
      total: totalCents(cart),
    });
    updateCart(emptyCart());
  };

  if (checkout) {
    return (
      <CheckoutScreen
        cart={cart}
        onBack={() => setCheckout(false)}
        onNewSale={() => {
          updateCart(emptyCart());
          setCheckout(false);
        }}
      />
    );
  }

  const total = totalCents(cart);

  return (
    <div className="flex h-full flex-col">
      {!layout.validated && (
        <div className="bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
          Modo conferência: o formato da etiqueta ainda não foi validado. Confira o valor de cada item com a etiqueta.
        </div>
      )}

      <div className="p-4">
        <Button big full onClick={scan} className="py-5">
          📷 Ler etiqueta
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setTyping(true)}>
            Digitar código
          </Button>
          <Button variant="secondary" onClick={manualItem}>
            Item manual
          </Button>
        </div>
      </div>

      <ul className="flex-1 divide-y divide-stone-200 overflow-y-auto border-t border-stone-200 bg-white">
        {cart.items.length === 0 && (
          <li className="p-8 text-center text-lg text-stone-500">Nenhum item. Toque em “Ler etiqueta”.</li>
        )}
        {cart.items.map((item, idx) => (
          <li
            key={item.lineId}
            className={`flex items-center gap-3 px-4 py-3 ${item.lineId === lastAdded ? 'bg-green-50' : ''}`}
          >
            <span className="w-6 text-right text-sm text-stone-400">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-semibold">{item.productName}</div>
              <div className="text-sm text-stone-500">
                {item.source === 'manual' ? (
                  <span className="rounded bg-amber-200 px-1 font-bold text-amber-900">MANUAL</span>
                ) : (
                  item.barcodeRaw
                )}
              </div>
            </div>
            <div className="text-xl font-bold tabular-nums">{formatBRL(item.priceCents)}</div>
            <button
              aria-label={`Remover ${item.productName}`}
              onClick={() => remove(item)}
              className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl text-red-700 active:bg-red-50"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t-2 border-stone-300 bg-stone-50 p-4">
        {cart.discountCents > 0 && (
          <div className="flex justify-between text-lg text-stone-600">
            <span>Desconto ({cart.discountReason})</span>
            <span className="tabular-nums">-{formatBRL(cart.discountCents)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-semibold">
            Total · {cart.items.length} {cart.items.length === 1 ? 'item' : 'itens'}
          </span>
          <span className="text-4xl font-black tabular-nums">{formatBRL(total)}</span>
        </div>
        <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
          <Button variant="secondary" disabled={cart.items.length === 0} onClick={cancelCart}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={cart.items.length === 0} onClick={discount}>
            Desconto
          </Button>
          <Button variant="success" disabled={cart.items.length === 0 || total <= 0} onClick={() => setCheckout(true)}>
            Finalizar
          </Button>
        </div>
      </div>

      {typing && (
        <TypeCodeModal
          onClose={() => setTyping(false)}
          onSubmit={async (code) => {
            setTyping(false);
            await handleCode(code);
          }}
        />
      )}
    </div>
  );
}

function TypeCodeModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  const valid = isThirteenDigits(code.trim());
  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(code.trim());
        }}
      >
        <h2 className="text-xl font-bold">Digitar código da etiqueta</h2>
        {!scannerIsNative() && (
          <p className="text-stone-600">Modo navegador: a câmera só funciona no app Android. Digite os 13 números.</p>
        )}
        <TextInput
          autoFocus
          inputMode="numeric"
          maxLength={13}
          placeholder="13 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="text-center font-mono text-2xl tracking-widest"
        />
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" disabled={!valid}>
            Adicionar
          </Button>
        </div>
        {!scannerIsNative() && (
          <div className="space-y-2 border-t border-stone-200 pt-3">
            <p className="text-sm font-semibold text-stone-500">Etiquetas de exemplo do PRD (simulação):</p>
            {SAMPLE_CODES.map((s) => (
              <Button key={s.code} variant="secondary" full className="font-mono text-base" onClick={() => onSubmit(s.code)}>
                {s.code} · {s.label}
              </Button>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}
