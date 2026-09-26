import React from 'react';
import { createPortal } from 'react-dom';
import { Landmark, Link as LinkIcon, Loader2, Plus, QrCode, Tag, WalletCards, X } from 'lucide-react';
import DespesaCredorPicker from '../despesas/components/DespesaCredorPicker';
import CategoriaFinanceiraInlineModal from '../despesas/components/CategoriaFinanceiraInlineModal';
import type { OutrosCreditosModel } from './useOutrosCreditos';
import { formatCurrency, formatCurrencyInput, normalizeCurrencyInput } from './outros-creditos.presentation';

type ModalModel = Pick<OutrosCreditosModel,
  | 'openPdv'
  | 'bankPresentation'
  | 'setBankPresentation'
  | 'mode'
  | 'setMode'
  | 'description'
  | 'setDescription'
  | 'value'
  | 'setValue'
  | 'dueDate'
  | 'setDueDate'
  | 'categoryId'
  | 'setCategoryId'
  | 'partnerType'
  | 'setPartnerType'
  | 'partnerId'
  | 'setPartnerId'
  | 'accountId'
  | 'setAccountId'
  | 'paymentMethod'
  | 'setPaymentMethod'
  | 'showCategoryModal'
  | 'setShowCategoryModal'
  | 'partners'
  | 'categories'
  | 'activePolo'
  | 'activeAccounts'
  | 'createMutation'
  | 'closeCreateModal'
  | 'validateAndSubmit'
  | 'isModalOpen'
>;

export const OtherCreditCreateModal = ({ model }: { model: ModalModel }) => {
  const {
    bankPresentation, setBankPresentation, mode, setMode, description, setDescription, value, setValue,
    dueDate, setDueDate, categoryId, setCategoryId, partnerType, setPartnerType,
    partnerId, setPartnerId, accountId, setAccountId, paymentMethod, setPaymentMethod,
    showCategoryModal, setShowCategoryModal, partners, categories, activePolo, activeAccounts,
    createMutation, closeCreateModal, validateAndSubmit, isModalOpen,
  } = model;
  if (!isModalOpen || typeof document === 'undefined') return null;
  return createPortal((
        <div
          className="fixed inset-0 z-[120] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-[#001a33]/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="outros-creditos-modal-title"
        >
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Novo crédito</p>
                <h4 id="outros-creditos-modal-title" className="text-xl font-black uppercase tracking-tight text-[#001a33]">Registrar entrada avulsa</h4>
              </div>
              <button
                onClick={closeCreateModal}
                disabled={createMutation.isPending}
                className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={validateAndSubmit}>
              <fieldset disabled={createMutation.isPending} className="space-y-5 disabled:opacity-70">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { id: 'LOCAL_PAGO' as const, label: 'Receber agora', desc: 'Entrada local no caixa/conta', icon: Landmark },
                  { id: 'LOCAL_RECEBER' as const, label: 'A receber local', desc: 'Cria conta pendente sem gateway', icon: WalletCards },
                  { id: 'GATEWAY' as const, presentation: 'PDV' as const, label: 'Receber na tela', desc: 'QR Pix e boleto no caixa', icon: QrCode },
                  { id: 'GATEWAY' as const, presentation: 'LINK' as const, label: 'Link bancário', desc: 'Gerar e enviar ao pagador', icon: LinkIcon },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = mode === option.id && (!option.presentation || bankPresentation === option.presentation);
                  return (
                    <button
                      key={option.presentation || option.id}
                      type="button"
                      onClick={() => {
                        if (option.presentation === 'PDV') { model.openPdv(); return; }
                        setMode(option.id);
                        if (option.presentation) setBankPresentation(option.presentation);
                        if (option.id === 'GATEWAY') setPaymentMethod('BOLETO');
                      }}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        active ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-100 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <Icon className={active ? 'text-emerald-700' : 'text-slate-400'} size={20} />
                      <p className="mt-3 text-sm font-black text-[#001a33]">{option.label}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-500">{option.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <Tag size={11} /> Categoria
                  </span>
                  <div className="relative flex gap-2">
                    <select
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                      className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                    >
                      <option value="">Selecionar categoria...</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.nome}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal((current) => !current)}
                      className="inline-flex h-12 items-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <Plus size={14} /> Nova
                    </button>
                    {showCategoryModal && (
                      <CategoriaFinanceiraInlineModal
                        tipo="OUTRO_CREDITO"
                        accent="emerald"
                        onCriada={(id) => {
                          setCategoryId(id);
                          setShowCategoryModal(false);
                        }}
                        onClose={() => setShowCategoryModal(false)}
                      />
                    )}
                  </div>
                </div>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Ex.: Juros de aplicação, rendimento de conta, entrada eventual..."
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => setValue(normalizeCurrencyInput(event.target.value))}
                    onBlur={() => setValue((current) => formatCurrencyInput(current))}
                    placeholder="0,00"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {mode === 'LOCAL_PAGO' ? 'Data do recebimento' : 'Vencimento'}
                  </span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400 focus:bg-white"
                  />
                </label>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Unidade atual</span>
                  <div className="min-h-12 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-black uppercase text-[#001a33]">
                      {activePolo?.nome || 'Unidade selecionada no topo'}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      {activePolo?.cnpj ? `CNPJ: ${activePolo.cnpj}` : 'Polo vinculado ao usuário'}
                      {activePolo?.cidade ? ` - ${activePolo.cidade}/${activePolo.estado || activePolo.uf || ''}` : ''}
                    </p>
                  </div>
                </div>
                <DespesaCredorPicker
                  parceiros={partners}
                  tipo={partnerType}
                  value={partnerId}
                  onTipoChange={setPartnerType}
                  onChange={setPartnerId}
                  tipoLabel="Tipo de parceiro"
                  pessoaLabel="Parceiro"
                  emptyLabel="Sem parceiro vinculado"
                  accent="emerald"
                  required={mode === 'GATEWAY'}
                />
                {(mode === 'LOCAL_PAGO' || mode === 'GATEWAY') && (
                  <>
                    {mode === 'LOCAL_PAGO' && (
                      <label className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Conta / caixa de entrada</span>
                        <select
                          value={accountId}
                          onChange={(event) => setAccountId(event.target.value)}
                          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          <option value="">Selecione a conta</option>
                          {activeAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.banco} - {account.conta} - Saldo: {formatCurrency(account.saldoAtual || 0)}
                            </option>
                          ))}
                        </select>
                        {activeAccounts.length === 0 && (
                          <p className="text-[10px] font-bold text-amber-600">Nenhuma conta ativa vinculada à unidade atual.</p>
                        )}
                      </label>
                    )}
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {mode === 'GATEWAY' ? 'Forma da cobrança' : 'Forma de recebimento'}
                      </span>
                      <select
                        value={paymentMethod}
                        onChange={(event) => setPaymentMethod(event.target.value as any)}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-400"
                      >
                        {mode === 'GATEWAY' ? (
                          <option value="BOLETO">BolePix (Banese)</option>
                        ) : (
                          <>
                            <option value="PIX">Pix</option>
                            <option value="BOLETO">Boleto</option>
                            <option value="CARTAO">Cartão</option>
                            <option value="DINHEIRO">Dinheiro</option>
                          </>
                        )}
                      </select>
                    </label>
                  </>
                )}
              </div>

              {mode === 'GATEWAY' && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
                  A cobrança será emitida como BolePix pelo Banese. O tipo e o parceiro são obrigatórios para identificar o pagador.
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={createMutation.isPending}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                  {mode === 'GATEWAY' && bankPresentation === 'PDV' ? 'Gerar e abrir caixa' : 'Salvar crédito'}
                </button>
              </div>
            </fieldset>
            </form>
          </div>
        </div>
  ), document.body);
};
