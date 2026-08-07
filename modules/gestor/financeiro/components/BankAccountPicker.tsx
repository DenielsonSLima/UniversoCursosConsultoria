import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Landmark, WalletCards } from 'lucide-react';
import { ContaBancaria } from '../financeiro.service';

type ButtonElement = React.ElementRef<'button'>;

interface BankAccountPickerProps {
  accounts: ContaBancaria[];
  value: string;
  onChange: (accountId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tone?: 'emerald' | 'indigo' | 'blue';
}

const formatCurrency = (value?: number) => (
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
);

const accountPrimaryLabel = (account: ContaBancaria) => (
  account.natureza === 'CAIXA_INTERNO'
    ? `${account.banco} • ${account.conta}`
    : `${account.banco} • Ag. ${account.agencia} • Conta ${account.conta}`
);

const accountLocation = (account: ContaBancaria) => (
  [account.poloCidade, account.poloUf].filter(Boolean).join('/') || account.poloNome || 'Unidade não informada'
);

const accountBalanceLabel = (account: ContaBancaria) => (
  account.compartilhada && account.saldoGerencialPolo !== undefined
    ? `Posição do polo ${formatCurrency(account.saldoGerencialPolo)}`
    : `Saldo contábil ${formatCurrency(account.saldoAtual)}`
);

const toneClasses = {
  emerald: {
    focus: 'focus-visible:ring-emerald-500',
    active: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-50 text-emerald-700',
  },
  indigo: {
    focus: 'focus-visible:ring-indigo-500',
    active: 'border-indigo-200 bg-indigo-50/70',
    icon: 'bg-indigo-50 text-indigo-700',
  },
  blue: {
    focus: 'focus-visible:ring-blue-500',
    active: 'border-blue-200 bg-blue-50/70',
    icon: 'bg-blue-50 text-blue-700',
  },
} as const;

const BankAccountPicker: React.FC<BankAccountPickerProps> = ({
  accounts,
  value,
  onChange,
  placeholder = 'Selecionar conta...',
  disabled = false,
  tone = 'emerald',
}) => {
  const listboxId = useId();
  const buttonRef = useRef<ButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 320,
  });
  const selected = useMemo(
    () => accounts.find((account) => account.id === value),
    [accounts, value],
  );
  const colors = toneClasses[tone];

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const viewportPadding = 16;
    const desiredHeight = Math.min(320, Math.max(130, accounts.length * 74 + 16));
    const roomBelow = window.innerHeight - rect.bottom - viewportPadding;
    const roomAbove = rect.top - viewportPadding;
    const showAbove = roomBelow < Math.min(desiredHeight, 220) && roomAbove > roomBelow;
    const maxHeight = Math.max(130, Math.min(desiredHeight, showAbove ? roomAbove - 8 : roomBelow - 8));

    setPosition({
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)),
      top: showAbove ? Math.max(viewportPadding, rect.top - maxHeight - 8) : rect.bottom + 8,
      width: rect.width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return undefined;

    updatePosition();
    const handleViewportChange = () => updatePosition();
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [accounts.length, open]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = accounts.findIndex((account) => account.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [accounts, open, value]);

  const choose = (account: ContaBancaria) => {
    if (!account?.id) return;
    onChange(account.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<ButtonElement>) => {
    if (disabled || accounts.length === 0) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (
        (current + direction + accounts.length) % accounts.length
      ));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) setOpen(true);
      else choose(accounts[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-label="Contas disponíveis"
        aria-activedescendant={
          accounts[activeIndex]?.id
            ? `${listboxId}-${accounts[activeIndex].id}`
            : undefined
        }
        style={{
          left: position.left,
          top: position.top,
          width: position.width,
          maxHeight: position.maxHeight,
        }}
        className="fixed z-[280] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/20"
      >
        {accounts.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs font-semibold text-slate-400">
            Nenhuma conta ativa disponível para este polo.
          </div>
        ) : accounts.map((account, index) => {
          const isSelected = account.id === value;
          const isActive = index === activeIndex;
          return (
            <button
              key={account.id}
              id={`${listboxId}-${account.id}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(account)}
              className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors last:mb-0 ${
                isActive || isSelected
                  ? colors.active
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
                {account.natureza === 'CAIXA_INTERNO'
                  ? <WalletCards size={17} />
                  : <Landmark size={17} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-black text-[#001a33]">
                  {accountPrimaryLabel(account)}
                </span>
                <span className="mt-0.5 flex min-w-0 items-center justify-between gap-3">
                  <span className="truncate text-[10px] font-semibold text-slate-500">
                    {account.titular} • {accountLocation(account)}
                  </span>
                  <span className={`shrink-0 text-[10px] font-black ${
                    Number(account.saldoAtual || 0) < 0 ? 'text-rose-600' : 'text-emerald-700'
                  }`}>
                    {accountBalanceLabel(account)}
                  </span>
                </span>
              </span>
              {isSelected ? <Check size={15} className="shrink-0 text-emerald-600" /> : null}
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className={`flex min-h-[58px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left outline-none transition-all focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 ${colors.focus}`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
          {selected?.natureza === 'CAIXA_INTERNO'
            ? <WalletCards size={17} />
            : <Landmark size={17} />}
        </span>
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-[#001a33]">
              {accountPrimaryLabel(selected)}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center justify-between gap-3">
              <span className="truncate text-[10px] font-semibold text-slate-500">
                {selected.titular} • {accountLocation(selected)}
              </span>
              <span className={`shrink-0 text-[10px] font-black ${
                Number(selected.saldoAtual || 0) < 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}>
                {accountBalanceLabel(selected)}
              </span>
            </span>
          </span>
        ) : (
          <span className="flex-1 text-sm font-semibold text-slate-400">{placeholder}</span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {menu}
    </>
  );
};

export default BankAccountPicker;
