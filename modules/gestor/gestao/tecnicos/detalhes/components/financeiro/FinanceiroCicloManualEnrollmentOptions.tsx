import React from 'react';
import type { CicloManualModoMatricula } from './matricula-tecnica-ciclo-manual.types';

interface Props {
  mode: CicloManualModoMatricula;
  disabled: boolean;
  canSettle: boolean;
  openSettlement: boolean;
  onModeChange: (mode: CicloManualModoMatricula) => void;
  onOpenSettlementChange: (value: boolean) => void;
}

const options = [
  ['BOLETO', 'Emitir boleto da matrícula', 'Cria a matrícula e emite o boleto junto às mensalidades.'],
  ['REGISTRO_SEM_BOLETO', 'Registrar matrícula sem boleto', 'Cria a matrícula pendente no financeiro, para registrar o recebimento separadamente.'],
  ['OMITIR', 'Não incluir matrícula', 'Gera somente as mensalidades, sem criar cobrança de matrícula neste ciclo.'],
] as const;

const FinanceiroCicloManualEnrollmentOptions: React.FC<Props> = ({
  mode, disabled, canSettle, openSettlement, onModeChange, onOpenSettlementChange,
}) => (
  <fieldset disabled={disabled} className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
    <legend className="px-1 text-xs font-black text-blue-950">Cobrança da matrícula</legend>
    <div className="space-y-3">
      {options.map(([value, label, description]) => (
        <label key={value} className="flex items-start gap-3 text-xs text-blue-950">
          <input type="radio" name="manual-cycle-enrollment-mode" checked={mode === value}
            onChange={() => onModeChange(value)} className="mt-0.5" />
          <span><strong>{label}</strong><span className="mt-1 block font-medium">{description}</span></span>
        </label>
      ))}
    </div>
    {mode === 'REGISTRO_SEM_BOLETO' ? (
      <div className="mt-4 border-t border-blue-200 pt-3 text-xs text-blue-950">
        {canSettle ? (
          <label className="flex items-start gap-3 font-semibold">
            <input type="checkbox" checked={openSettlement} className="mt-0.5"
              onChange={(event) => onOpenSettlementChange(event.target.checked)} />
            Abrir recebimento da matrícula após gerar o ciclo
          </label>
        ) : <p>O recebimento poderá ser registrado por um usuário com permissão de baixa financeira.</p>}
        <p className="mt-2 font-medium">Esta escolha não registra pagamento. O recebimento exige confirmação de valor, data, conta e forma de pagamento.</p>
      </div>
    ) : null}
  </fieldset>
);

export default FinanceiroCicloManualEnrollmentOptions;
