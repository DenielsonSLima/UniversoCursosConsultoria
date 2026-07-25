import React from 'react';
import { CheckCircle2, Info, ShieldCheck } from 'lucide-react';

const guidelines = [
  'Confira se todos os dados estão legíveis e sem cortes antes de enviar.',
  'Depois do envio, o arquivo fica bloqueado enquanto a secretaria analisa.',
  'Se o documento for recusado, o motivo aparecerá no item e um novo envio será liberado.',
  'As versões anteriores permanecem no histórico. Somente a gestão pode arquivar ou excluir arquivos.',
];

const DocumentoEnvioOrientacoes: React.FC = () => (
  <aside className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4" aria-labelledby="documento-orientacoes-title">
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-white p-2 text-blue-600 shadow-sm">
        <Info size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 id="documento-orientacoes-title" className="text-xs font-black uppercase tracking-wider text-[#001a33]">
          Antes de enviar
        </h3>
        <ul className="mt-3 space-y-2">
          {guidelines.map((guideline) => (
            <li key={guideline} className="flex items-start gap-2 text-[10px] font-semibold leading-relaxed text-slate-600">
              <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
              {guideline}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-white p-3 text-[10px] font-semibold leading-relaxed text-blue-800">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Seus arquivos ficam em armazenamento privado e são acessados por links temporários.
        </p>
      </div>
    </div>
  </aside>
);

export default DocumentoEnvioOrientacoes;

