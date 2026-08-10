import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, LoaderCircle, PackagePlus, Pencil, Plus, Save, X } from 'lucide-react';
import { usePatrimonioDialog } from '../hooks/usePatrimonioDialog';
import type { PatrimonioProductType } from '../patrimonio-product-types.service';
import {
  calculatePatrimonioTotalCents,
  formatPatrimonioCents,
  formatPatrimonioCurrencyInput,
  formatPatrimonioCurrencyTyping,
  parsePatrimonioCurrencyToCents,
  parsePatrimonioQuantity,
  PATRIMONIO_MAX_UNIT_CENTS,
} from '../patrimonio.formatters';
import { createPatrimonioRequestId } from '../patrimonio.service';
import type {
  CreatePatrimonioInput,
  PatrimonioItem,
  UpdatePatrimonioInput,
} from '../patrimonio.types';
import { PatrimonioProductTypeFormModal } from './PatrimonioProductTypeFormModal';

interface PatrimonioFormModalBaseProps {
  poloId: string;
  productTypes: PatrimonioProductType[];
  areProductTypesLoading: boolean;
  productTypesError?: string;
  canManageProductTypes: boolean;
  isPending: boolean;
  errorMessage?: string;
  onClose: () => void;
}

interface CreatePatrimonioFormModalProps extends PatrimonioFormModalBaseProps {
  mode: 'create';
  onSubmit: (input: CreatePatrimonioInput) => void;
}

interface EditPatrimonioFormModalProps extends PatrimonioFormModalBaseProps {
  mode: 'edit';
  item: PatrimonioItem;
  onSubmit: (input: UpdatePatrimonioInput) => void;
}

type PatrimonioFormModalProps = CreatePatrimonioFormModalProps | EditPatrimonioFormModalProps;

interface PatrimonioFormState {
  dataAquisicao: string;
  tipoProdutoId: string;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  numeroSerie: string;
  observacao: string;
  motivo: string;
}

const getToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const initialState = (
  mode: PatrimonioFormModalProps['mode'],
  item?: PatrimonioItem,
): PatrimonioFormState => mode === 'edit' && item
  ? {
      dataAquisicao: item.dataAquisicao,
      tipoProdutoId: item.tipoProdutoId || '',
      descricao: item.descricao,
      quantidade: String(item.quantidadeOriginal),
      valorUnitario: formatPatrimonioCurrencyInput(item.valorUnitario),
      numeroSerie: item.numeroSerie || '',
      observacao: item.observacao || '',
      motivo: '',
    }
  : {
      dataAquisicao: getToday(),
      tipoProdutoId: '',
      descricao: '',
      quantidade: '1',
      valorUnitario: '',
      numeroSerie: '',
      observacao: '',
      motivo: '',
    };

const inputClassName = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

const centsToNumericString = (cents: bigint) => (
  `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
);

export function PatrimonioFormModal(props: PatrimonioFormModalProps) {
  const {
    poloId,
    productTypes,
    areProductTypesLoading,
    productTypesError,
    canManageProductTypes,
    isPending,
    errorMessage,
    onClose,
  } = props;
  const [requestId, setRequestId] = useState(createPatrimonioRequestId);
  const [form, setForm] = useState<PatrimonioFormState>(() => (
    initialState(props.mode, props.mode === 'edit' ? props.item : undefined)
  ));
  const [isProductTypeFormOpen, setIsProductTypeFormOpen] = useState(false);
  const [createdProductType, setCreatedProductType] = useState<PatrimonioProductType | null>(null);
  const currentTypeId = props.mode === 'edit' ? props.item.tipoProdutoId : undefined;
  const { dialogRef, initialFocusRef } = usePatrimonioDialog(
    true,
    onClose,
    isPending || isProductTypeFormOpen,
  );

  const activeProductTypes = useMemo(() => {
    const active = productTypes.filter((type) => (
      type.status === 'ativo' || type.id === currentTypeId
    ));
    const createdTypeAlreadyLoaded = createdProductType
      ? productTypes.some((type) => type.id === createdProductType.id)
      : false;
    if (!createdProductType || createdTypeAlreadyLoaded) return active;
    return [...active, createdProductType].sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
  }, [createdProductType, currentTypeId, productTypes]);

  useEffect(() => {
    if (!form.tipoProdutoId) return;
    if (activeProductTypes.some((type) => type.id === form.tipoProdutoId)) return;
    if (form.tipoProdutoId === currentTypeId) return;
    setForm((current) => ({ ...current, tipoProdutoId: '' }));
    setRequestId(createPatrimonioRequestId());
  }, [activeProductTypes, currentTypeId, form.tipoProdutoId]);

  const quantity = parsePatrimonioQuantity(form.quantidade);
  const unitCents = parsePatrimonioCurrencyToCents(form.valorUnitario);
  const isUnitWithinLimit = unitCents !== null && unitCents <= PATRIMONIO_MAX_UNIT_CENTS;
  const estimatedTotalCents = quantity !== null && isUnitWithinLimit
    ? calculatePatrimonioTotalCents(quantity, unitCents)
    : null;
  const hasTotalOverflow = quantity !== null && isUnitWithinLimit && estimatedTotalCents === null;
  const canSubmit = Boolean(
    form.dataAquisicao
    && form.tipoProdutoId
    && form.descricao.trim()
    && quantity !== null
    && isUnitWithinLimit
    && estimatedTotalCents !== null
    && (props.mode === 'create' || form.motivo.trim()),
  );
  const canEditEconomicFields = props.mode === 'create' || props.item.canEditEconomicFields;

  const update = <Field extends keyof PatrimonioFormState>(field: Field, value: PatrimonioFormState[Field]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setRequestId(createPatrimonioRequestId());
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || quantity === null || unitCents === null) return;

    const commonInput = {
      requestId,
      poloId,
      dataAquisicao: form.dataAquisicao,
      tipoProdutoId: form.tipoProdutoId,
      descricao: form.descricao.trim(),
      quantidade: quantity,
      valorUnitario: centsToNumericString(unitCents),
      numeroSerie: form.numeroSerie,
      observacao: form.observacao,
    };

    if (props.mode === 'create') {
      props.onSubmit(commonInput);
      return;
    }

    props.onSubmit({
      ...commonInput,
      patrimonioId: props.item.id,
      expectedUpdatedAt: props.item.updatedAt,
      motivo: form.motivo.trim(),
    });
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end bg-slate-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:justify-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPending && !isProductTypeFormOpen) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patrimonio-form-title"
        aria-hidden={isProductTypeFormOpen ? true : undefined}
        aria-busy={isPending}
        inert={isProductTypeFormOpen ? true : undefined}
        tabIndex={-1}
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-7">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              {props.mode === 'create' ? <PackagePlus size={21} /> : <Pencil size={21} />}
            </div>
            <div>
              <h2 id="patrimonio-form-title" className="text-lg font-black text-[#001a33]">
                {props.mode === 'create' ? 'Novo patrimônio' : 'Editar patrimônio'}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {props.mode === 'create'
                  ? 'Registre o bem no polo selecionado.'
                  : 'Atualize os dados permitidos e informe o motivo da alteração.'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar formulário"><X size={19} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Data de aquisição</span>
              <input
                ref={(element) => { if (canEditEconomicFields) initialFocusRef.current = element; }}
                type="date"
                max={getToday()}
                required
                value={form.dataAquisicao}
                onChange={(event) => update('dataAquisicao', event.target.value)}
                disabled={isPending || !canEditEconomicFields}
                className={inputClassName}
              />
            </label>

            <div className="block">
              <label htmlFor="patrimonio-tipo-produto" className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Tipo de produto</label>
              <div className="flex gap-2">
                <select
                  id="patrimonio-tipo-produto"
                  required
                  value={form.tipoProdutoId}
                  onChange={(event) => update('tipoProdutoId', event.target.value)}
                  disabled={isPending || areProductTypesLoading || activeProductTypes.length === 0}
                  className={`${inputClassName} min-w-0 flex-1`}
                >
                  <option value="">
                    {areProductTypesLoading
                      ? 'Carregando tipos...'
                      : activeProductTypes.length > 0
                        ? 'Selecione o tipo'
                        : 'Nenhum tipo ativo disponível'}
                  </option>
                  {activeProductTypes.map((type) => <option key={type.id} value={type.id}>{type.nome}</option>)}
                  {props.mode === 'edit'
                    && props.item.tipoProdutoId
                    && !activeProductTypes.some((type) => type.id === props.item.tipoProdutoId)
                    ? <option value={props.item.tipoProdutoId}>{props.item.tipoProduto} (histórico)</option>
                    : null}
                </select>
                {canManageProductTypes ? (
                  <button
                    type="button"
                    onClick={() => setIsProductTypeFormOpen(true)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Novo tipo de produto"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Novo
                  </button>
                ) : null}
              </div>
              {productTypesError ? <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-600">{productTypesError}</p> : null}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Descrição</span>
            <input ref={(element) => { if (!canEditEconomicFields) initialFocusRef.current = element; }} required value={form.descricao} onChange={(event) => update('descricao', event.target.value)} disabled={isPending} placeholder="Ex.: Notebook para atendimento" className={inputClassName} />
          </label>

          {!canEditEconomicFields ? (
            <div className="flex gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-amber-800">
              <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs font-semibold leading-relaxed">
                Este patrimônio já possui baixa. Data de aquisição, quantidade original e valor unitário ficam preservados para não reescrever o histórico. Tipo, descrição, número de série e observação continuam editáveis.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Quantidade</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="2147483647"
                step="1"
                required
                value={form.quantidade}
                onChange={(event) => update('quantidade', event.target.value)}
                disabled={isPending || !canEditEconomicFields}
                aria-invalid={Boolean(form.quantidade && quantity === null)}
                className={inputClassName}
              />
              {form.quantidade && quantity === null ? <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Informe uma quantidade inteira positiva.</p> : null}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Valor unitário</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={20}
                  required
                  value={form.valorUnitario}
                  onChange={(event) => update('valorUnitario', formatPatrimonioCurrencyTyping(event.target.value, form.valorUnitario))}
                  onBlur={(event) => update('valorUnitario', formatPatrimonioCurrencyInput(event.target.value))}
                  disabled={isPending || !canEditEconomicFields}
                  placeholder="0,00"
                  aria-invalid={Boolean(form.valorUnitario && !isUnitWithinLimit)}
                  className={`${inputClassName} pl-10`}
                />
              </div>
              {form.valorUnitario && !isUnitWithinLimit ? <p className="mt-1.5 text-[11px] font-semibold text-rose-600">O valor unitário excede o limite permitido.</p> : null}
            </label>
          </div>

          <div className={`rounded-xl border px-4 py-3 ${hasTotalOverflow ? 'border-rose-100 bg-rose-50' : 'border-blue-100 bg-blue-50'}`}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-wider ${hasTotalOverflow ? 'text-rose-700' : 'text-blue-700'}`}>
                  {props.mode === 'edit' && !canEditEconomicFields ? 'Valor total original' : 'Valor total estimado'}
                </p>
                <p className={`mt-1 text-[11px] font-medium ${hasTotalOverflow ? 'text-rose-600' : 'text-blue-700'}`}>Quantidade × valor unitário</p>
              </div>
              <output aria-live="polite" className={`text-lg font-black ${hasTotalOverflow ? 'text-rose-800' : 'text-[#001a33]'}`}>
                {hasTotalOverflow
                  ? 'Limite excedido'
                  : estimatedTotalCents === null
                    ? '—'
                    : formatPatrimonioCents(estimatedTotalCents)}
              </output>
            </div>
            <p className={`mt-2 text-xs font-medium leading-relaxed ${hasTotalOverflow ? 'text-rose-700' : 'text-blue-800'}`}>
              {hasTotalOverflow
                ? 'Reduza a quantidade ou o valor unitário antes de cadastrar.'
                : `Estimativa em tela. O total final será calculado e validado pelo sistema ao ${props.mode === 'create' ? 'cadastrar' : 'salvar'}.`}
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Número de série <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span></span>
            <input value={form.numeroSerie} onChange={(event) => update('numeroSerie', event.target.value)} disabled={isPending} placeholder="Ex.: SN-123456" className={inputClassName} />
          </label>

          {props.mode === 'edit' ? (
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Motivo da edição</span>
              <textarea
                required
                maxLength={500}
                value={form.motivo}
                onChange={(event) => update('motivo', event.target.value)}
                disabled={isPending}
                rows={2}
                placeholder="Explique por que este cadastro está sendo alterado"
                className={`${inputClassName} resize-y`}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">Observação <span className="font-medium normal-case tracking-normal text-slate-400">(opcional)</span></span>
            <textarea value={form.observacao} onChange={(event) => update('observacao', event.target.value)} disabled={isPending} rows={3} placeholder="Informações complementares sobre o bem" className={`${inputClassName} resize-y`} />
          </label>

          {errorMessage ? (
            <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold leading-relaxed text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={isPending} className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={isPending || !canSubmit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-blue-950/15 transition-colors hover:bg-[#073b73] disabled:cursor-not-allowed disabled:opacity-60">
              {isPending
                ? <LoaderCircle size={15} className="animate-spin" />
                : props.mode === 'create'
                  ? <PackagePlus size={15} />
                  : <Save size={15} />}
              {isPending
                ? 'Salvando...'
                : props.mode === 'create'
                  ? 'Cadastrar patrimônio'
                  : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>

      {isProductTypeFormOpen ? (
        <PatrimonioProductTypeFormModal
          poloId={poloId}
          onClose={() => setIsProductTypeFormOpen(false)}
          onSaved={(saved) => {
            setCreatedProductType(saved);
            update('tipoProdutoId', saved.id);
            setIsProductTypeFormOpen(false);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
