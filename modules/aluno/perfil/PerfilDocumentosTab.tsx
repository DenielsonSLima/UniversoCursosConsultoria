import React from 'react';
import { CheckCircle, Clock, FileText, Upload, XCircle } from 'lucide-react';
import { PerfilDocumento } from './perfil.types';

interface PerfilDocumentosTabProps {
  documentos: PerfilDocumento[];
  uploading: boolean;
  onUpload: React.Dispatch<{ docName: string; file: File }>;
}

const standardDocuments = [
  'Registro Geral (RG)',
  'CPF ou CNH',
  'Histórico Escolar Ensino Médio',
  'Comprovante de Residência',
];

const getDocStatusBadge = (status?: string | null) => {
  switch (status?.toLowerCase()) {
    case 'entregue':
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
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700">
          <XCircle size={10} /> Pendente
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
    <div className="flex items-start justify-between gap-2">
      <div className="space-y-0.5">
        <p className="font-bold text-[#001a33]">{doc.nome}</p>
        {doc.observacao ? (
          <p className="text-[9px] font-bold text-red-500">{doc.observacao}</p>
        ) : (
          <p className="text-[9px] text-slate-400">Pendente de entrega</p>
        )}
      </div>
      {getDocStatusBadge(doc.status)}
    </div>

    {doc.status !== 'aprovado' && (
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2 text-[10px] font-black text-slate-500 transition-all hover:border-blue-500 hover:bg-white hover:text-blue-600">
        <Upload size={14} />
        <span>{uploading ? 'Enviando...' : doc.status === 'entregue' ? 'Reenviar Arquivo' : 'Escolher Arquivo'}</span>
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

    {doc.status === 'aprovado' && doc.arquivoUrl && (
      <a
        href={doc.arquivoUrl}
        target="_blank"
        rel="noreferrer"
        className="py-2 text-center text-[10px] font-black uppercase text-blue-600 hover:underline"
      >
        Visualizar Documento Homologado
      </a>
    )}
  </div>
);

const PerfilDocumentosTab: React.FC<PerfilDocumentosTabProps> = ({ documentos, uploading, onUpload }) => {
  const docsToRender = documentos.length > 0
    ? documentos
    : standardDocuments.map((nome) => ({ nome, status: 'pendente' }));

  return (
    <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <FileText className="text-blue-600" size={18} />
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Documentação Escolar</h3>
      </div>

      <p className="mt-5 text-[10px] font-medium leading-relaxed text-slate-500">
        Para homologar sua matrícula definitiva, envie cópias legíveis em formato PDF ou imagem dos seus documentos.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {docsToRender.map((doc, index) => (
          <DocumentCard key={doc.id || `${doc.nome}-${index}`} doc={doc} uploading={uploading} onUpload={onUpload} />
        ))}
      </div>
    </div>
  );
};

export default PerfilDocumentosTab;
