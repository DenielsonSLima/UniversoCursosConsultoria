import React from 'react';
import { Award, FileCheck2, LockKeyhole } from 'lucide-react';
import { getDocumentValidationUrl } from '../../../../shared/document-validation/document-validation.url';
import type { CertificadoAluno, QueryDisplayState } from '../../turmas.types';
import { formatDate, getQuizScore } from '../../turmas.utils';
import QueryStateNotice from '../QueryStateNotice';

interface CertificateTabProps {
  certificate: CertificadoAluno | null;
  state: QueryDisplayState;
  eadProgress: Record<string, any> | null;
}

const CertificateTab: React.FC<CertificateTabProps> = ({ certificate, state, eadProgress }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6">
    <QueryStateNotice state={state} label="o certificado desta matrícula" />
    {!state.isLoading && !state.isError && certificate?.status === 'FINALIZADO' && certificate.codigo_validacao ? (
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Award size={24} /></div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Certificado liberado</p><h4 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Curso concluído e certificado emitido</h4><p className="mt-2 text-xs font-bold text-slate-500">Código de validação: <span className="font-mono text-blue-700">{certificate.codigo_validacao}</span></p><p className="mt-1 text-xs font-semibold text-slate-500">Conclusão: {formatDate(certificate.data_conclusao)} | Nota final: {certificate.nota_final ?? getQuizScore(eadProgress) ?? '--'}</p></div><button type="button" onClick={() => window.open(getDocumentValidationUrl(certificate.codigo_validacao!), '_blank', 'noopener,noreferrer')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white hover:bg-slate-800"><FileCheck2 size={14} /> Validar QR/Código</button></div>
    ) : null}
    {!state.isLoading && !state.isError && !certificate ? <div className="flex flex-col gap-4 md:flex-row md:items-center"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><LockKeyhole size={22} /></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Certificado indisponível</p><h4 className="mt-1 text-base font-black text-[#001a33]">Conclua o curso e cumpra os critérios acadêmicos.</h4><p className="mt-1 text-xs font-semibold text-slate-500">O certificado desta matrícula aparecerá aqui automaticamente após a conclusão e aprovação.</p></div></div> : null}
  </div>
);

export default CertificateTab;
