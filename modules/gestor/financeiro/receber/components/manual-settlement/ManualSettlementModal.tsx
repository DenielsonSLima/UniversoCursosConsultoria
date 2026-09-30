import React, { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  WalletCards,
  X,
} from 'lucide-react';
import type { ContaBancaria, ContasReceber } from '../../../financeiro.service';
import ManualSettlementCombobox, {
  type ManualSettlementComboboxOption,
} from './ManualSettlementCombobox';
import { todayInMaceio } from './manual-settlement-date';
import {
  formatCurrencyInput,
  sanitizeCurrencyInput,
  useManualSettlementForm,
  type ManualSettlementPayload,
  type ManualSettlementPaymentMethod,
} from './useManualSettlementForm';

interface ManualSettlementModalProps {
  receivable: ContasReceber;
  accounts: ContaBancaria[];
  initialAccountId?: string;
  pending: boolean;
  submitDisabled?: boolean;
  enrollmentNotice?: string;
  error?: string | null;
  onClose: () => void;
  onConfirm: (payload: ManualSettlementPayload) => void;
}

const CurrencyField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  detail: string;
  tone?: 'default' | 'discount';
  invalid?: boolean;
}> = ({ label, value, onChange, detail, tone = 'default', invalid = false }) => {
  const inputId = useId();
  const detailId = `${inputId}-detail`;
  const errorId = `${inputId}-error`;

  return (
    <label htmlFor={inputId} className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="relative mt-1.5 block">
        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black ${
          tone === 'discount' ? 'text-emerald-600' : 'text-slate-400'
        }`}>R$</span>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={value}
          aria-invalid={invalid}
          aria-describedby={`${detailId}${invalid ? ` ${errorId}` : ''}`}
          onChange={(event) => onChange(sanitizeCurrencyInput(event.target.value, value))}
          onBlur={(event) => onChange(formatCurrencyInput(event.currentTarget.value))}
          onFocus={(event) => event.currentTarget.select()}
          placeholder="0,00"
          className={`h-12 w-full rounded-xl border bg-white py-3 pl-10 pr-3 text-sm font-black text-[#001a33] outline-none transition-all placeholder:text-slate-300 focus:ring-4 ${
            invalid
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10'
              : tone === 'discount'
                ? 'border-emerald-200 focus:border-emerald-400 focus:ring-emerald-500/10'
                : 'border-slate-200 focus:border-emerald-400 focus:ring-emerald-500/10'
          }`}
        />
      </span>
      <span id={detailId} className="mt-1 block text-[10px] font-medium text-slate-400">{detail}</span>
      {invalid ? (
        <span id={errorId} className="mt-1 block text-[10px] font-bold text-rose-600">Use um valor válido, como 10,50.</span>
      ) : null}
    </label>
  );
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const hasRemoteCharge = (receivable: ContasReceber) => Boolean(
  receivable.gatewayProvider
  || receivable.asaasPaymentId
  || receivable.asaasPaymentLinkId,
);

const paymentMethodOptions: ManualSettlementComboboxOption[] = [
  {
    value: 'DINHEIRO',
    label: 'Dinheiro',
    description: 'Recebimento presencial em espécie',
    keywords: 'caixa especie',
    icon: <Banknote size={17} />,
  },
  {
    value: 'PIX',
    label: 'Pix',
    description: 'Transferência instantânea confirmada',
    keywords: 'transferencia instantanea',
    icon: <Smartphone size={17} />,
  },
  {
    value: 'CARTAO',
    label: 'Cartão',
    description: 'Pagamento presencial com cartão',
    keywords: 'credito debito maquininha',
    icon: <CreditCard size={17} />,
  },
  {
    value: 'BOLETO',
    label: 'Boleto',
    description: 'Título bancário já liquidado',
    keywords: 'linha digitavel bancario',
    icon: <ReceiptText size={17} />,
  },
];

const SummaryLine: React.FC<{
  label: string;
  value: number;
  kind?: 'positive' | 'negative';
}> = ({ label, value, kind = 'positive' }) => (
  <div className="flex items-center justify-between gap-4 py-1.5 text-xs">
    <span className="flex items-center gap-1.5 font-semibold text-slate-500">
      {kind === 'negative'
        ? <Minus size={12} className="text-emerald-600" />
        : <Plus size={12} className="text-slate-400" />}
      {label}
    </span>
    <strong className={kind === 'negative' ? 'text-emerald-700' : 'text-slate-700'}>
      {kind === 'negative' ? '− ' : '+ '}{formatCurrency(value)}
    </strong>
  </div>
);

export const ManualSettlementModal: React.FC<ManualSettlementModalProps> = ({
  receivable,
  accounts,
  initialAccountId = '',
  pending,
  submitDisabled = false,
  enrollmentNotice,
  error,
  onClose,
  onConfirm,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const form = useManualSettlementForm(receivable.valor, initialAccountId);
  const accountOptions = useMemo<ManualSettlementComboboxOption[]>(() => accounts
    .filter((account): account is ContaBancaria & { id: string } => Boolean(account.id))
    .map((account) => ({
      value: account.id,
      label: `${account.banco} · ${account.conta}`,
      description: account.natureza === 'CAIXA_INTERNO'
        ? `Caixa interno · ${account.titular}`
        : `Ag. ${account.agencia} · ${account.titular}`,
      keywords: [account.banco, account.conta, account.agencia, account.titular, account.poloNome]
        .filter(Boolean)
        .join(' '),
      icon: account.natureza === 'CAIXA_INTERNO'
        ? <WalletCards size={17} />
        : <Landmark size={17} />,
    })), [accounts]);
  const adjustmentTotal = form.amounts.adjustmentCents / 100;

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus?.({ preventScroll: true });
    };
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !pending) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current
      ? (Array.from(dialogRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )) as HTMLElement[]).filter((element) => element.offsetParent !== null)
      : [];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex min-h-screen w-full items-center justify-center overflow-y-auto bg-[#001225]/80 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={pending}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-[0_35px_100px_-24px_rgba(0,18,37,0.75)] outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-[2rem]"
      >
        <header className="relative shrink-0 overflow-hidden bg-[#001a33] px-5 py-5 text-white sm:px-7 sm:py-6">
          <div className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full border border-emerald-300/15 bg-emerald-400/10" />
          <div className="pointer-events-none absolute right-24 top-10 h-20 w-20 rounded-full bg-cyan-300/5 blur-xl" />
          <div className="relative flex items-start gap-4 pr-10">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15 text-emerald-300 shadow-inner">
              <CircleDollarSign size={24} />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                <ShieldCheck size={13} /> Baixa manual segura
              </p>
              <h2 id={titleId} className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Confirmar recebimento</h2>
              <p id={descriptionId} className="mt-1 max-w-2xl truncate text-xs font-medium text-slate-300 sm:text-sm">
                {receivable.clienteNome} · {receivable.descricao}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar confirmação de recebimento"
            className="absolute right-4 top-4 rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 sm:right-6 sm:top-6"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-6">
          {receivable.tipoLancamento === 'MATRICULA' ? (
            <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-800">
              {enrollmentNotice ?? 'Ao confirmar esta matrícula, o sistema criará as parcelas futuras conforme o cronograma e a rota bancária configurada.'}
            </div>
          ) : null}

          {hasRemoteCharge(receivable) ? (
            <div className="mb-4 flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-800">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>A baixa local só será consolidada depois que a integração bancária confirmar que o título deixou de aceitar pagamento. Retornos incertos serão bloqueados para revisão.</span>
            </div>
          ) : null}

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
            <section aria-labelledby={`${titleId}-details`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p id={`${titleId}-details`} className="text-sm font-black text-[#001a33]">Dados do recebimento</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">Informe a origem, a data e somente os ajustes aplicados.</p>
                </div>
                <span className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 sm:inline-flex">Servidor valida</span>
              </div>

              <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <ManualSettlementCombobox
                    label="Conta bancária / caixa"
                    value={form.accountId}
                    options={accountOptions}
                    onChange={form.setAccountId}
                    placeholder="Busque ou selecione a conta de recebimento"
                    emptyMessage={accounts.length ? 'Nenhuma conta corresponde à busca' : 'Nenhuma conta ativa disponível'}
                    disabled={pending}
                  />
                </div>
                <ManualSettlementCombobox
                  label="Forma de pagamento"
                  value={form.paymentMethod}
                  options={paymentMethodOptions}
                  onChange={(value) => form.setPaymentMethod(value as ManualSettlementPaymentMethod)}
                  placeholder="Busque a forma de pagamento"
                  emptyMessage="Nenhuma forma de pagamento encontrada"
                  disabled={pending}
                />
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Data do pagamento <span aria-hidden="true" className="text-emerald-600">*</span></span>
                  <span className="relative mt-1.5 block">
                    <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      max={todayInMaceio()}
                      value={form.paymentDate}
                      onChange={(event) => form.setPaymentDate(event.target.value)}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-bold text-[#001a33] outline-none transition-all focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                    />
                  </span>
                </label>

                <div className="sm:col-span-2 mt-1 border-t border-slate-200 pt-4">
                  <div className="mb-3">
                    <p className="text-xs font-black text-[#001a33]">Ajustes desta baixa</p>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-500">Cada alteração recalcula automaticamente o valor final recebido.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CurrencyField label="Juros recebidos" value={form.interestValue} onChange={form.setInterestValue} detail="Somado ao valor da cobrança" invalid={!form.amounts.inputValidity.interestValue} />
                    <CurrencyField label="Multa recebida" value={form.penaltyValue} onChange={form.setPenaltyValue} detail="Somada ao valor da cobrança" invalid={!form.amounts.inputValidity.penaltyValue} />
                    <CurrencyField label="Desconto concedido" value={form.discountValue} onChange={form.setDiscountValue} detail="Subtraído automaticamente do total" tone="discount" invalid={!form.amounts.inputValidity.discountValue} />
                    <CurrencyField label="Outros acréscimos" value={form.additionValue} onChange={form.setAdditionValue} detail="Somados ao valor da cobrança" invalid={!form.amounts.inputValidity.additionValue} />
                  </div>
                </div>
              </fieldset>
            </section>

            <aside aria-label="Resumo financeiro da baixa" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-0">
              <div className="border-b border-slate-100 bg-[#001a33]/[0.035] px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Resumo da composição</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <span className="text-xs font-bold text-slate-600">Valor da cobrança</span>
                  <strong className="text-xl font-black tracking-tight text-[#001a33]">{formatCurrency(form.amounts.principal)}</strong>
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Ajustes</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    adjustmentTotal < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {adjustmentTotal >= 0 ? '+' : '−'} {formatCurrency(Math.abs(adjustmentTotal))}
                  </span>
                </div>
                <SummaryLine label="Juros" value={form.amounts.interest} />
                <SummaryLine label="Multa" value={form.amounts.penalty} />
                <SummaryLine label="Outros acréscimos" value={form.amounts.addition} />
                <SummaryLine label="Desconto" value={form.amounts.discount} kind="negative" />
              </div>
              <div className="m-3 mt-0 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-lg shadow-emerald-900/15">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">Total a receber</p>
                <p className="mt-1 text-3xl font-black tracking-tight">{formatCurrency(form.amounts.received)}</p>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-100">
                  <CheckCircle2 size={13} /> Valor final recebido · calculado automaticamente
                </p>
              </div>
              <p className="px-5 pb-4 text-[10px] font-medium leading-relaxed text-slate-400">
                Cobrança + juros + multa + acréscimos − desconto. O servidor confere a composição exata antes de registrar.
              </p>
            </aside>
          </div>

          {!accounts.length ? (
            <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold text-amber-700">
              Nenhuma conta ativa foi encontrada para este polo. Cadastre uma conta do polo ou global antes da baixa.
            </p>
          ) : null}

          {form.compositionError ? (
            <p role="alert" className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              <AlertCircle size={16} className="shrink-0" /> {form.compositionError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </p>
          ) : null}

          <footer className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onConfirm(form.payload)}
              disabled={!form.canSubmit || pending || submitDisabled}
              className="flex min-w-[240px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {pending ? 'Confirmando...' : `Confirmar ${formatCurrency(form.amounts.received)}`}
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ManualSettlementModal;
