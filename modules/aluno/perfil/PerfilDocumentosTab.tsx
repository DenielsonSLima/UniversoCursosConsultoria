import React from 'react';
import { CheckCircle, Clock, FileText, Upload, XCircle } from 'lucide-react';
import { PerfilDocumento } from './perfil.types';

interface PerfilDocumentosTabProps {
  documentos: PerfilDocumento[];
  uploading: boolean;
  onUpload: React.Dispatch<{ docName: string; file: File }>;
}

const getDocStatusBadge = (status?: string | null, hasFile = false) => {
  switch (status?.toLowerCase()) {
    case 'pendente':
    case 'entregue':
      if (!hasFile) break;
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700">
          <Clock size={10} /> Em Análise
        </span>
      );
    case 'aprovado':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700">
          <CheckCircle size={10} /> Aprovado
        </span>
      );
    case 'recusado':
    case 'rejeitado':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700">
          <XCircle size={10} /> Recusado
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-slate-650">
          Pendente
        </span>
      );
  }
};

const DocumentCard: React.FC<{
  doc: PerfilDocumento;
  uploading: boolean;
  onUpload: React.Dispatch<{ docName: string; file: File }>;
}> = ({ doc, uploading, onUpload }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-medium">
    <div className="flex flex-col items-start gap-2 min-[390px]:flex-row min-[390px]:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="break-words font-bold text-[#001a33]">{doc.nome}</p>
        {doc.observacao ? (
          <p className="text-[9px] font-bold text-red-500">{doc.observacao}</p>
        ) : (
          <p className="text-[9px] text-slate-400">{doc.arquivoUrl ? 'Arquivo enviado à secretaria' : 'Pendente de entrega'}</p>
        )}
      </div>
      {getDocStatusBadge(doc.status, Boolean(doc.arquivoUrl))}
    </div>

    {doc.status !== 'aprovado' && (
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-center text-[10px] font-black text-slate-500 transition-all hover:border-blue-500 hover:bg-white hover:text-blue-600">
        <Upload size={14} />
        <span>{uploading ? 'Enviando...' : doc.arquivoUrl ? 'Substituir Arquivo' : 'Escolher Arquivo'}</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload({ docName: doc.nome, file });
          }}
        />
      </label>
    )}

    {doc.arquivoUrl && (
      <a
        href={doc.arquivoUrl}
        target="_blank"
        rel="noreferrer"
        className="py-2 text-center text-[10px] font-black uppercase text-blue-600 hover:underline"
      >
        Visualizar arquivo enviado
      </a>
    )}
  </div>
);

const PerfilDocumentosTab: React.FC<PerfilDocumentosTabProps> = ({ documentos, uploading, onUpload }) => {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:rounded-[2.5rem]">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <FileText className="text-blue-600" size={18} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Documentação Escolar</h3>
      </div>

      <p className="mt-5 text-xs font-medium leading-relaxed text-slate-500">
        Para concluir sua matrícula, envie cópias legíveis em PDF ou imagem. A secretaria analisará cada arquivo.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {documentos.map((doc, index) => (
          <DocumentCard key={doc.id || `${doc.nome}-${index}`} doc={doc} uploading={uploading} onUpload={onUpload} />
        ))}
      </div>
      {documentos.length === 0 && (
        <p className="mt-5 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs font-medium text-slate-500">
          O checklist de documentos ainda não foi disponibilizado pela secretaria.
        </p>
      )}
    </div>
  );
};

export default PerfilDocumentosTab;
