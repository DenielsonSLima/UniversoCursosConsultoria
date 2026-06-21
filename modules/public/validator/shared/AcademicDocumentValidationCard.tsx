import React from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, FileCheck2, GraduationCap, MapPin, ShieldX, UserRound } from 'lucide-react';
import { AcademicDocumentValidationResult } from '../validator.types';

interface AcademicDocumentValidationCardProps {
  result: AcademicDocumentValidationResult;
  accentClass: string;
  softClass: string;
}

const statusCopy = {
  valid: {
    title: 'Documento válido',
    description: 'Esta emissão consta na base local de documentos.',
    icon: CheckCircle2,
    color: 'text-emerald-700',
    background: 'bg-emerald-50 border-emerald-100',
  },
  expired: {
    title: 'Documento expirado',
    description: 'A emissão foi localizada, mas sua data de validade já terminou.',
    icon: AlertTriangle,
    color: 'text-amber-700',
    background: 'bg-amber-50 border-amber-100',
  },
  revoked: {
    title: 'Documento revogado',
    description: 'A emissão foi cancelada e não deve ser aceita.',
    icon: ShieldX,
    color: 'text-red-700',
    background: 'bg-red-50 border-red-100',
  },
  invalid: {
    title: 'Documento inválido',
    description: 'O código informado não corresponde a uma emissão válida.',
    icon: ShieldX,
    color: 'text-red-700',
    background: 'bg-red-50 border-red-100',
  },
};

const AcademicDocumentValidationCard: React.FC<AcademicDocumentValidationCardProps> = ({
  result,
  accentClass,
  softClass,
}) => {
  const status = statusCopy[result.status];
  const StatusIcon = status.icon;

  return (
    <div className="mt-10 animate-fadeIn">
      <div className={`rounded-3xl p-7 text-center border ${status.background}`}>
        <div className={`w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-4 ${status.color}`}>
          <StatusIcon size={34} />
        </div>
        <h3 className={`text-2xl font-black uppercase tracking-tight ${status.color}`}>{status.title}</h3>
        <p className={`mt-2 text-sm font-medium ${status.color}`}>{status.description}</p>
        <p className="mt-3 text-xs font-mono font-black text-slate-600">{result.code}</p>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl ${softClass} ${accentClass} flex items-center justify-center`}>
          <FileCheck2 size={23} />
        </div>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de documento</p>
          <h4 className="text-xl font-black text-[#001a33]">{result.documentTitle}</h4>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <UserRound size={16} className="text-slate-400 mb-3" />
          <div className="flex items-center gap-3">
            {result.studentPhotoUrl && result.type === 'cracha_estagio' ? (
              <img
                src={result.studentPhotoUrl}
                alt="Foto cadastral do estudante"
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white"
              />
            ) : null}
            <p className="font-black text-[#001a33]">{result.studentName}</p>
          </div>
          <p className="text-xs text-slate-500 mt-2">CPF: {result.maskedCpf}</p>
          <p className="text-xs text-slate-500">Nascimento: {result.maskedBirthDate}</p>
          <p className="text-xs text-slate-500">Mãe: {result.maskedMotherName}</p>
          <p className="text-xs text-slate-500">Matrícula: {result.maskedEnrollmentNumber}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <GraduationCap size={16} className="text-slate-400 mb-3" />
          <p className="font-black text-[#001a33]">{result.courseName}</p>
          <p className="text-xs text-slate-500 mt-2">{result.className}</p>
          <p className="text-xs text-slate-500 mt-1">Situação: {result.enrollmentStatus}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <MapPin size={16} className="text-slate-400 mb-3" />
          <p className="font-black text-[#001a33]">{result.institutionName}</p>
          <p className="text-xs text-slate-500 mt-2">CNPJ: {result.institutionCnpj}</p>
          <p className="text-xs text-slate-500 mt-1">{result.unitName}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <CalendarDays size={16} className="text-slate-400 mb-3" />
          <p className="text-xs text-slate-500">Emitido em: <strong className="text-[#001a33]">{result.issuedAt || 'Não informado'}</strong></p>
          <p className="text-xs text-slate-500 mt-2">Última emissão: <strong className="text-[#001a33]">{result.lastIssuedAt || result.issuedAt || 'Não informada'}</strong></p>
          <p className="text-xs text-slate-500 mt-2">Validade: <strong className="text-[#001a33]">{result.expiresAt || 'Sem vencimento cadastrado'}</strong></p>
          {result.referencePeriod && (
            <p className="text-xs text-slate-500 mt-2">Período: <strong className="text-[#001a33]">{result.referencePeriod}</strong></p>
          )}
          {result.issueCount && result.issueCount > 1 && (
            <p className="text-xs text-slate-500 mt-2">Reemissões registradas: <strong className="text-[#001a33]">{result.issueCount}</strong></p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AcademicDocumentValidationCard;
