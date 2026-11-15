import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

type ConfirmOpts = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOpts = {
  title: string;
  message?: ReactNode;
  label?: string;
  placeholder?: string;
  initial?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  password?: boolean;
  confirmLabel?: string;
  validate?: (v: string) => string | null;
};

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info' };

type Dialogs = {
  confirm(o: ConfirmOpts): Promise<boolean>;
  prompt(o: PromptOpts): Promise<string | null>;
  alert(title: string, message?: ReactNode): Promise<void>;
  toast(text: string, tone?: Toast['tone']): void;
};

const Ctx = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error('DialogProvider ausente');
  return d;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: 'alert'; title: string; message?: ReactNode; resolve: () => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Pending[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const push = (p: Pending) => setStack((s) => [...s, p]);
  const pop = () => setStack((s) => s.slice(0, -1));

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 4000 : 2200);
  }, []);

  // Objeto estável: telas usam `dialogs` em dependências de efeitos.
  const api = useMemo<Dialogs>(
    () => ({
      confirm: (opts) => new Promise<boolean>((resolve) => push({ kind: 'confirm', opts, resolve })),
      prompt: (opts) => new Promise<string | null>((resolve) => push({ kind: 'prompt', opts, resolve })),
      alert: (title, message) => new Promise<void>((resolve) => push({ kind: 'alert', title, message, resolve })),
      toast,
    }),
    [toast],
  );

  const top = stack[stack.length - 1];

  return (
    <Ctx.Provider value={api}>
      {children}
      {top && (
        <Modal onClose={() => close(top, pop)}>
          {top.kind === 'confirm' && <ConfirmBody p={top} done={pop} />}
          {top.kind === 'prompt' && <PromptBody p={top} done={pop} />}
          {top.kind === 'alert' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">{top.title}</h2>
              {top.message && <div className="text-lg text-stone-700">{top.message}</div>}
              <Button
                full
                onClick={() => {
                  pop();
                  top.resolve();
                }}
              >
                OK
              </Button>
            </div>
          )}
        </Modal>
      )}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`max-w-md rounded-xl px-4 py-3 text-lg font-semibold text-white shadow-lg ${
              t.tone === 'ok' ? 'bg-green-700' : t.tone === 'error' ? 'bg-red-700' : 'bg-stone-800'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function close(p: Pending, pop: () => void) {
  pop();
  if (p.kind === 'confirm') p.resolve(false);
  else if (p.kind === 'prompt') p.resolve(null);
  else p.resolve();
}

function ConfirmBody({ p, done }: { p: Extract<Pending, { kind: 'confirm' }>; done: () => void }) {
  const { opts } = p;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{opts.title}</h2>
      {opts.message && <div className="text-lg text-stone-700">{opts.message}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            done();
            p.resolve(false);
          }}
        >
          {opts.cancelLabel ?? 'Voltar'}
        </Button>
        <Button
          variant={opts.danger ? 'danger' : 'primary'}
          onClick={() => {
            done();
            p.resolve(true);
          }}
        >
          {opts.confirmLabel ?? 'Confirmar'}
        </Button>
      </div>
    </div>
  );
}

function PromptBody({ p, done }: { p: Extract<Pending, { kind: 'prompt' }>; done: () => void }) {
  const { opts } = p;
  const [value, setValue] = useState(opts.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = opts.validate?.(value) ?? null;
    if (err) return setError(err);
    done();
    p.resolve(value);
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="text-xl font-bold">{opts.title}</h2>
      {opts.message && <div className="text-lg text-stone-700">{opts.message}</div>}
      <label className="block">
        {opts.label && <span className="mb-1 block font-semibold">{opts.label}</span>}
        <TextInput
          autoFocus
          type={opts.password ? 'password' : 'text'}
          inputMode={opts.inputMode}
          placeholder={opts.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </label>
      {error && <p className="font-semibold text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            done();
            p.resolve(null);
          }}
        >
          Voltar
        </Button>
        <Button type="submit">{opts.confirmLabel ?? 'OK'}</Button>
      </div>
    </form>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  full?: boolean;
  big?: boolean;
};

export function Button({ variant = 'primary', full, big, className = '', ...rest }: ButtonProps) {
  const styles = {
    primary: 'bg-red-800 text-white active:bg-red-900',
    success: 'bg-green-700 text-white active:bg-green-800',
    secondary: 'bg-stone-200 text-stone-900 active:bg-stone-300',
    danger: 'bg-red-600 text-white active:bg-red-700',
    ghost: 'bg-transparent text-red-800 underline',
  }[variant];
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-12 rounded-xl px-4 font-bold select-none disabled:opacity-40 ${
        big ? 'min-h-16 text-2xl' : 'text-lg'
      } ${full ? 'w-full' : ''} ${styles} ${className}`}
    />
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-12 w-full rounded-xl border-2 border-stone-300 px-3 text-lg focus:border-red-800 focus:outline-none ${
        props.className ?? ''
      }`}
    />
  );
}
