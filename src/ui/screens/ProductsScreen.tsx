import { useEffect, useState } from 'react';
import { formatCents, formatBRL, parseMoneyToCents } from '../../domain/money';
import type { Product } from '../../domain/types';
import { useApp } from '../appContext';
import { Button, Modal, TextInput, useDialogs } from '../components/dialogs';

export function ProductsScreen() {
  const { repo, dataVersion, bumpData } = useApp();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  useEffect(() => {
    void repo.listProducts({ search, includeInactive: showInactive }).then(setProducts);
  }, [repo, search, showInactive, dataVersion]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Produtos</h1>
          <Button onClick={() => setEditing('new')}>+ Novo</Button>
        </div>
        <TextInput placeholder="Buscar por nome ou código" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" className="h-6 w-6" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar desativados
        </label>
      </div>
      <ul className="flex-1 divide-y divide-stone-200 overflow-y-auto border-t border-stone-200 bg-white">
        {products.length === 0 && (
          <li className="p-8 text-center text-stone-500">
            Nenhum produto. Cadastre pelo código da balança (PLU) ou leia uma etiqueta na tela de venda.
          </li>
        )}
        {products.map((p) => (
          <li key={p.id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-100" onClick={() => setEditing(p)}>
              <span className="w-16 font-mono text-lg font-bold text-stone-500">{p.scaleCode}</span>
              <span className={`flex-1 text-xl ${p.active ? '' : 'text-stone-400 line-through'}`}>{p.name}</span>
              {p.referencePriceCents !== null && (
                <span className="text-stone-500">{formatBRL(p.referencePriceCents)}/{p.unit}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            bumpData();
          }}
        />
      )}
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const { repo } = useApp();
  const dialogs = useDialogs();
  const [code, setCode] = useState(product?.scaleCode ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState<'kg' | 'un'>(product?.unit ?? 'kg');
  const [ref, setRef] = useState(product?.referencePriceCents != null ? formatCents(product.referencePriceCents) : '');
  const [active, setActive] = useState(product?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const refCents = ref.trim() === '' ? null : parseMoneyToCents(ref);
    if (ref.trim() !== '' && refCents === null) return setError('Preço de referência inválido');
    try {
      const saved = await repo.saveProduct({ id: product?.id, scaleCode: code, name, unit, active, referencePriceCents: refCents });
      await repo.audit(product ? 'product_updated' : 'product_created', { code: saved.scaleCode, name: saved.name, active });
      dialogs.toast('Produto salvo');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="text-xl font-bold">{product ? 'Editar produto' : 'Novo produto'}</h2>
        <label className="block">
          <span className="font-semibold">Código na balança (PLU)</span>
          <TextInput inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus={!product} />
        </label>
        <label className="block">
          <span className="font-semibold">Nome</span>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Patinho" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-semibold">Unidade</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as 'kg' | 'un')}
              className="min-h-12 w-full rounded-xl border-2 border-stone-300 bg-white px-3 text-lg"
            >
              <option value="kg">kg</option>
              <option value="un">un</option>
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Preço ref. (R$)</span>
            <TextInput inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="opcional" />
          </label>
        </div>
        <p className="text-sm text-stone-500">O preço de referência é só informativo: a venda sempre usa o valor da etiqueta.</p>
        <label className="flex items-center gap-2 text-lg">
          <input type="checkbox" className="h-6 w-6" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Ativo
        </label>
        {error && <p className="font-semibold text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
