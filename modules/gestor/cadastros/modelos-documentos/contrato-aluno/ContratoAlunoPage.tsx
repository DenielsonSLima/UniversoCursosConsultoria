import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { ContratoAlunoTemplateEditor } from './components/ContratoAlunoTemplateEditor';
import {
  CONTRATO_ALUNO_MODALIDADES,
  CONTRATO_ALUNO_MODALIDADE_LABEL,
  type ContratoAlunoModalidade,
} from './types/contrato-aluno.types';

const ContratoAlunoPage = () => {
  const [modalidade, setModalidade] = useState<ContratoAlunoModalidade>('TECNICO');

  return (
    <div className="animate-fadeIn">
      <div className="mb-7 flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#ed1c4e]">
            <FileSignature size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Modelos de documentos</span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#001a33]">Contrato do aluno</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">Modelo versionado para emissão segura, com marca-d'água, QR Code e regras de validade canônicas.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modalidade do contrato">
          {CONTRATO_ALUNO_MODALIDADES.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={modalidade === item}
              onClick={() => setModalidade(item)}
              className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${modalidade === item ? 'bg-[#001a33] text-white shadow-lg shadow-blue-950/15' : 'border border-slate-200 bg-slate-50 text-slate-500 hover:border-blue-300 hover:text-blue-700'}`}
            >
              {CONTRATO_ALUNO_MODALIDADE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>
      <ContratoAlunoTemplateEditor modalidade={modalidade} />
    </div>
  );
};

export default ContratoAlunoPage;
