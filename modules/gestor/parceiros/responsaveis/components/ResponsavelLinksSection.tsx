import React from 'react';
import { Link2, Loader2 } from 'lucide-react';
import type {
  ResponsavelAlunoOption,
  ResponsavelLegalVinculo,
  ResponsavelVinculoVerificacaoMetodo,
} from '../responsaveis.contract';
import type { ResponsaveisTabActions } from '../hooks/useResponsaveisTabActions';
import { RESPONSAVEL_FIELD_CLASS_NAME } from '../responsaveis-tab.helpers';
import type { Parentesco, VinculoStatus } from '../responsaveis-tab.types';

interface ResponsavelLinksSectionProps {
  vinculos: readonly ResponsavelLegalVinculo[];
  alunos: readonly ResponsavelAlunoOption[];
  alunosPending: boolean;
  alunosError: boolean;
  onRetryAlunos: () => void;
  canRegisterVerification: boolean;
  linking: ResponsaveisTabActions['linking'];
}

const ResponsavelLinksSection: React.FC<ResponsavelLinksSectionProps> = ({
  vinculos,
  alunos,
  alunosPending,
  alunosError,
  onRetryAlunos,
  canRegisterVerification,
  linking,
}) => {
  const handleStatusChange = (nextStatus: VinculoStatus) => {
    linking.setStatus(nextStatus);
    if (nextStatus !== 'VERIFICADO') {
      linking.setVerificationMethod('');
      linking.setVerificationReference('');
    }
  };

  const outroInvalido = linking.parentesco === 'OUTRO'
    && (linking.descricaoOutro.trim().length < 2 || linking.descricaoOutro.trim().length > 120);

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#001a33]">Vínculos</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            A situação do vínculo é revalidada pelo backend.
          </p>
        </div>
        <button
          type="button"
          onClick={() => linking.setVisible((value) => !value)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-blue-200 px-3 text-[10px] font-black uppercase tracking-wide text-blue-700 hover:bg-blue-50"
        >
          <Link2 size={14} /> Vincular aluno
        </button>
      </div>

      {linking.isVisible ? (
        <form onSubmit={linking.submit} className="mt-3 rounded-2xl bg-slate-50 p-3">
          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
            Aluno *
            <select
              required
              value={linking.alunoId}
              onChange={(event) => linking.setAlunoId(event.target.value)}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
              disabled={alunosPending || alunosError}
            >
              <option value="">
                {alunosPending
                  ? 'Carregando alunos…'
                  : alunosError
                    ? 'Alunos indisponíveis'
                    : 'Selecione o aluno'}
              </option>
              {alunos.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>{aluno.nome}</option>
              ))}
            </select>
          </label>
          {alunosError ? (
            <p className="mt-2 text-[10px] font-bold text-rose-700">
              Não foi possível carregar a lista mínima de alunos.{' '}
              <button type="button" onClick={onRetryAlunos} className="underline">
                Tentar novamente
              </button>
            </p>
          ) : null}
          <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">
            Parentesco *
            <select
              required
              value={linking.parentesco}
              onChange={(event) => linking.setParentesco(event.target.value as Parentesco | '')}
              className={RESPONSAVEL_FIELD_CLASS_NAME}
            >
              <option value="">Selecione o parentesco</option>
              <option value="MAE">Mãe</option>
              <option value="PAI">Pai</option>
              <option value="TUTOR">Tutor(a)</option>
              <option value="GUARDIAO_JUDICIAL">Guardião(ã) judicial</option>
              <option value="OUTRO">Outro</option>
            </select>
          </label>
          {linking.parentesco === 'OUTRO' ? (
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">
              Descrição do parentesco *
              <input
                required
                minLength={2}
                maxLength={120}
                value={linking.descricaoOutro}
                onChange={(event) => linking.setDescricaoOutro(event.target.value)}
                className={RESPONSAVEL_FIELD_CLASS_NAME}
                placeholder="Ex.: madrasta responsável"
              />
            </label>
          ) : null}
          {canRegisterVerification ? (
            <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">
              Situação do vínculo *
              <select
                value={linking.status}
                onChange={(event) => handleStatusChange(event.target.value as VinculoStatus)}
                className={RESPONSAVEL_FIELD_CLASS_NAME}
              >
                <option value="PENDENTE">Registrar como pendente</option>
                <option value="VERIFICADO">Registrar como verificado</option>
              </select>
            </label>
          ) : null}
          {linking.status === 'VERIFICADO' && canRegisterVerification ? (
            <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">
                Evidência da verificação
              </p>
              <label className="mt-2 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                Método *
                <select
                  required
                  value={linking.verificationMethod}
                  onChange={(event) => linking.setVerificationMethod(event.target.value as ResponsavelVinculoVerificacaoMetodo | '')}
                  className={RESPONSAVEL_FIELD_CLASS_NAME}
                >
                  <option value="">Selecione o método</option>
                  <option value="DOCUMENTO_CONFERIDO">Documento conferido</option>
                  <option value="DECISAO_JUDICIAL">Decisão judicial</option>
                  <option value="PRESENCIAL">Conferência presencial</option>
                </select>
              </label>
              <label className="mt-3 block text-[10px] font-black uppercase tracking-wide text-slate-500">
                Referência ou protocolo *
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={linking.verificationReference}
                  onChange={(event) => linking.setVerificationReference(event.target.value)}
                  className={RESPONSAVEL_FIELD_CLASS_NAME}
                  placeholder="Ex.: protocolo interno ou processo"
                />
              </label>
            </div>
          ) : null}
          {!canRegisterVerification ? (
            <p className="mt-3 text-[10px] font-bold leading-relaxed text-slate-500">
              Este escopo registra novos vínculos como pendentes. O serviço poderá liberar verificação em contexto autorizado.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={
              linking.isPending
              || !linking.alunoId
              || !linking.parentesco
              || outroInvalido
              || (linking.status === 'VERIFICADO' && !linking.verificationReady)
            }
            className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-60"
          >
            {linking.isPending
              ? <Loader2 className="animate-spin" size={15} />
              : <Link2 size={15} />}
            {linking.status === 'VERIFICADO' ? 'Registrar vínculo verificado' : 'Enviar vínculo pendente'}
          </button>
        </form>
      ) : null}

      <ul className="mt-3 space-y-2">
        {vinculos.length ? vinculos.map((vinculo) => (
          <li key={vinculo.id} className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs font-black text-slate-700">{vinculo.alunoNome}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {vinculo.parentesco}
              {vinculo.descricaoOutro ? ` · ${vinculo.descricaoOutro}` : ''}
              {' · '}{vinculo.status}
            </p>
            {vinculo.verificacaoMetodo ? (
              <p className="mt-1 text-[10px] font-medium text-slate-500">
                {vinculo.verificacaoMetodo}
                {vinculo.verificacaoReferencia ? ` · ${vinculo.verificacaoReferencia}` : ''}
              </p>
            ) : null}
          </li>
        )) : (
          <li className="rounded-xl border border-dashed border-slate-200 p-3 text-xs font-medium text-slate-500">
            Nenhum vínculo informado pelo serviço.
          </li>
        )}
      </ul>
    </div>
  );
};

export default ResponsavelLinksSection;
