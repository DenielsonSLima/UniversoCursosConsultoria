import React from 'react';
import { CheckCircle2, ChevronDown, RefreshCw, Send } from 'lucide-react';
import { ContasReceber } from '../../../financeiro/financeiro.service';
import { formatDocument, formatPhone, normalizePhone } from '../whatsapp/whatsapp.utils';
import { formatDate, formatMoney, OverdueModalityGroup, receivableId } from './utils';

interface OverdueTabProps {
  loading: boolean;
  totals: { count: number; value: number };
  groups: OverdueModalityGroup[];
  selectedIds: Set<string>;
  selectedSummary: { count: number; recipients: number; value: number };
  collapsedGroups: Set<string>;
  apiReady: boolean;
  isSending: boolean;
  onToggleGroup: (groupId: string) => void;
  onSetItemsSelected: (items: ContasReceber[], checked: boolean) => void;
  onToggleItemSelected: (item: ContasReceber, checked: boolean) => void;
  onClearSelection: () => void;
  onSendSelected: () => void;
}

const OverdueTab: React.FC<OverdueTabProps> = ({
  loading,
  totals,
  groups,
  selectedIds,
  selectedSummary,
  collapsedGroups,
  apiReady,
  isSending,
  onToggleGroup,
  onSetItemsSelected,
  onToggleItemSelected,
  onClearSelection,
  onSendSelected,
}) => {
  const selectedCountForItems = (items: ContasReceber[]) =>
    items.filter((item) => selectedIds.has(receivableId(item))).length;

  const areAllSelectableItemsSelected = (items: ContasReceber[]) => {
    const selectable = items.filter((item) => item.clienteId && normalizePhone(item.clienteTelefone));
    return selectable.length > 0 && selectable.every((item) => selectedIds.has(receivableId(item)));
  };

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-[#001a33]">{totals.count} parcelas em atraso</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Total em aberto: {formatMoney(totals.value)}
            {selectedSummary.count > 0 && (
              <span className="ml-2 font-bold text-emerald-700">
                {selectedSummary.count} selecionada(s), {selectedSummary.recipients} aluno(s), {formatMoney(selectedSummary.value)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedSummary.count > 0 && (
            <button type="button" onClick={onClearSelection} className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700">
              Limpar seleção
            </button>
          )}
          <button
            type="button"
            onClick={onSendSelected}
            disabled={isSending || selectedSummary.count === 0 || !apiReady}
            className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-5 text-xs font-bold uppercase tracking-wide text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedSummary.count > 0 && apiReady ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300'}`}
          >
            {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {isSending ? 'Enviando...' : 'Enviar selecionados'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">
          <RefreshCw size={18} className="animate-spin" />
          Carregando atrasos...
        </div>
      ) : totals.count === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={30} />
          <p className="mt-3 text-sm font-bold text-emerald-700">Nenhuma parcela em atraso</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((modality) => {
            const modalityItems = modality.courses.flatMap((course) => course.turmas.flatMap((turma) => turma.items));
            return (
              <section key={modality.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <GroupHeader
                  checkboxTitle="Selecionar modalidade"
                  label={modality.label}
                  meta={`${modality.count} parcela(s) • ${formatMoney(modality.total)}`}
                  rightLabel={`${modality.courses.length} curso(s)`}
                  items={modalityItems}
                  selectedCount={selectedCountForItems(modalityItems)}
                  isOpen={!collapsedGroups.has(modality.id)}
                  allSelected={areAllSelectableItemsSelected(modalityItems)}
                  onToggle={() => onToggleGroup(modality.id)}
                  onSelect={(checked) => onSetItemsSelected(modalityItems, checked)}
                  strong
                />

                {!collapsedGroups.has(modality.id) && (
                  <div className="space-y-3 p-3">
                    {modality.courses.map((course) => {
                      const courseItems = course.turmas.flatMap((turma) => turma.items);
                      return (
                        <section key={course.id} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                          <GroupHeader
                            checkboxTitle="Selecionar curso"
                            label={course.label}
                            meta={`${course.count} parcela(s) • ${formatMoney(course.total)}`}
                            rightLabel={`${course.turmas.length} turma(s)`}
                            items={courseItems}
                            selectedCount={selectedCountForItems(courseItems)}
                            isOpen={!collapsedGroups.has(course.id)}
                            allSelected={areAllSelectableItemsSelected(courseItems)}
                            onToggle={() => onToggleGroup(course.id)}
                            onSelect={(checked) => onSetItemsSelected(courseItems, checked)}
                          />

                          {!collapsedGroups.has(course.id) && (
                            <div className="divide-y divide-slate-100">
                              {course.turmas.map((turma) => (
                                <section key={turma.id}>
                                  <GroupHeader
                                    checkboxTitle="Selecionar turma"
                                    label={turma.label}
                                    meta={`${turma.count} parcela(s) • ${formatMoney(turma.total)}`}
                                    items={turma.items}
                                    selectedCount={selectedCountForItems(turma.items)}
                                    isOpen={!collapsedGroups.has(turma.id)}
                                    allSelected={areAllSelectableItemsSelected(turma.items)}
                                    onToggle={() => onToggleGroup(turma.id)}
                                    onSelect={(checked) => onSetItemsSelected(turma.items, checked)}
                                    compact
                                  />
                                  {!collapsedGroups.has(turma.id) && (
                                    <ReceivablesTable
                                      items={turma.items}
                                      selectedIds={selectedIds}
                                      onToggleItemSelected={onToggleItemSelected}
                                    />
                                  )}
                                </section>
                              ))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

const GroupHeader = ({
  checkboxTitle,
  label,
  meta,
  rightLabel,
  items,
  selectedCount,
  isOpen,
  allSelected,
  onToggle,
  onSelect,
  strong,
  compact,
}: {
  checkboxTitle: string;
  label: string;
  meta: string;
  rightLabel?: string;
  items: ContasReceber[];
  selectedCount: number;
  isOpen: boolean;
  allSelected: boolean;
  onToggle: () => void;
  onSelect: (checked: boolean) => void;
  strong?: boolean;
  compact?: boolean;
}) => (
  <div className={`flex flex-col gap-3 ${compact ? 'bg-slate-50/70' : strong ? 'border-b border-slate-100 bg-slate-50/80' : 'border-b border-slate-100 bg-white'} p-3 md:flex-row md:items-center md:justify-between`}>
    <div className="flex min-w-0 items-center gap-3">
      <input type="checkbox" checked={allSelected} onChange={(event) => onSelect(event.target.checked)} className="h-4 w-4 shrink-0 accent-emerald-600" title={checkboxTitle} />
      <button type="button" onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left">
        <ChevronDown size={strong ? 17 : 15} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        <div className="min-w-0">
          <p className={`truncate ${compact ? 'text-xs font-black uppercase tracking-wide text-slate-700' : strong ? 'text-sm font-black uppercase tracking-tight text-[#001a33]' : 'text-sm font-bold text-[#001a33]'}`}>
            {label}
          </p>
          <p className="text-[11px] font-semibold text-slate-500">
            {meta}
            {selectedCount > 0 && <span className="ml-2 font-bold text-emerald-700">{selectedCount} selecionada(s)</span>}
          </p>
        </div>
      </button>
    </div>
    {rightLabel && <span className="text-[11px] font-bold text-slate-400">{rightLabel}</span>}
  </div>
);

const ReceivablesTable = ({
  items,
  selectedIds,
  onToggleItemSelected,
}: {
  items: ContasReceber[];
  selectedIds: Set<string>;
  onToggleItemSelected: (item: ContasReceber, checked: boolean) => void;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead className="bg-white text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <tr>
          <th className="w-10 px-4 py-3"></th>
          <th className="px-4 py-3">Aluno</th>
          <th className="px-4 py-3">Cobrança</th>
          <th className="px-4 py-3">Vencimento</th>
          <th className="px-4 py-3">Contato</th>
          <th className="px-4 py-3 text-right">Valor</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((item) => {
          const id = receivableId(item);
          const hasPhone = Boolean(item.clienteId && normalizePhone(item.clienteTelefone));
          const selected = selectedIds.has(id);

          return (
            <tr key={id} className={selected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}>
              <td className="px-4 py-3">
                <input type="checkbox" checked={selected} disabled={!hasPhone} onChange={(event) => onToggleItemSelected(item, event.target.checked)} className="h-4 w-4 accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-30" title={hasPhone ? 'Selecionar aluno' : 'Aluno sem WhatsApp válido'} />
              </td>
              <td className="px-4 py-3">
                <p className="font-bold text-[#001a33]">{item.clienteNome}</p>
                <p className="mt-0.5 text-[10px] font-medium text-slate-400">{formatDocument(item.clienteCpfCnpj)}</p>
              </td>
              <td className="px-4 py-3 text-xs font-medium text-slate-500">
                <p className="line-clamp-2">{item.descricao}</p>
                {item.parcelaNumero && <p className="mt-1 text-[10px] font-bold text-slate-400">Parcela {item.parcelaNumero}</p>}
              </td>
              <td className="px-4 py-3 text-xs font-bold text-rose-600">{formatDate(item.dataVencimento)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold ${hasPhone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {hasPhone ? formatPhone(item.clienteTelefone) : 'Sem WhatsApp'}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(item.valor)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default OverdueTab;
