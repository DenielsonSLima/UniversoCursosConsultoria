import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { ResponsavelIdentidadeVerificacaoMetodo } from '../responsaveis.contract';
import type { ResponsaveisTabActions } from '../hooks/useResponsaveisTabActions';
import {
  isVerificationReferenceValid,
  RESPONSAVEL_FIELD_CLASS_NAME,
} from '../responsaveis-tab.helpers';

interface ResponsavelIdentitySectionProps {
  canRegisterVerification: boolean;
  hasVerificationFields: boolean;
  verification: ResponsaveisTabActions['identityVerification'];
}

const ResponsavelIdentitySection: React.FC<ResponsavelIdentitySectionProps> = ({
  canRegisterVerification,
  hasVerificationFields,
  verification,
}) => {
  if (!canRegisterVerification) {
    return (
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-700">Verificação não liberada neste escopo</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          O serviço autorizou apenas cadastros e vínculos pendentes para este contexto.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#001a33]">Verificação e ativação</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Registre o método e a referência/protocolo. O serviço revalida a evidência antes de ativar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => verification.setVisible((value) => !value)}
          className="text-[10px] font-black uppercase tracking-wide text-blue-700 hover:text-blue-900"
        >
          {verification.isVisible ? 'Cancelar' : 'Registrar'}
        </button>
      </div>
      {verification.isVisible ? (
        <form onSubmit={verification.submit} className="mt-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
            Método *
            <InstitutionalSelect
              required
              value={verification.method}
              onValueChange={(value) => verification.setMethod(value as ResponsavelIdentidadeVerificacaoMetodo | '')}
              ariaLabel="Método de verificação da identidade"
              placeholder="Selecione o método"
              options={[
                { value: '', label: 'Selecione o método' },
                { value: 'DOCUMENTO_CONFERIDO', label: 'Documento conferido' },
                { value: 'PRESENCIAL', label: 'Conferência presencial' },
              ]}
              className="mt-1 w-full"
            />
          </label>
          <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">
            Referência ou protocolo *
            <input
              required
              minLength={3}
              maxLength={120}
              value={verification.reference}
              onChange={(event) => verification.setReference(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
              placeholder="Ex.: protocolo interno ou referência documental"
            />
          </label>
          {!hasVerificationFields ? (
            <p className="mt-2 text-[10px] font-bold text-amber-700">
              CPF e e-mail completos são necessários para esta ação.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              !hasVerificationFields
              || !verification.method
              || !isVerificationReferenceValid(verification.reference)
              || verification.isPending
            }
            className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#001a33] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verification.isPending
              ? <Loader2 className="animate-spin" size={15} />
              : <CheckCircle2 size={15} />}
            Registrar verificação e ativar
          </button>
        </form>
      ) : null}
    </div>
  );
};

export default ResponsavelIdentitySection;
