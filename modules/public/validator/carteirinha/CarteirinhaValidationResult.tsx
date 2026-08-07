import React from 'react';
import { Calendar, CheckCircle2, CreditCard, GraduationCap, MapPin, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { CarteirinhaValidationResult as CarteirinhaResult } from '../validator.types';
import {
  isValidationFieldVisible,
  type PublicValidationField,
} from '../validator.fields';

interface CarteirinhaValidationResultProps {
  result: CarteirinhaResult;
}

const CarteirinhaValidationResult: React.FC<CarteirinhaValidationResultProps> = ({ result }) => {
  const valid = result.status === 'valid';
  const expired = result.status === 'expired';
  const revoked = result.status === 'revoked';
  const headline = valid
    ? 'Carteirinha válida'
    : expired
      ? 'Carteirinha vencida'
      : revoked
        ? 'Carteirinha revogada'
        : 'Carteirinha inválida';
  const statusClasses = valid
    ? {
      container: 'bg-emerald-50 border-emerald-100',
      color: 'text-emerald-700',
    }
    : revoked
      ? {
        container: 'bg-red-50 border-red-100',
        color: 'text-red-700',
      }
      : {
        container: 'bg-amber-50 border-amber-100',
        color: 'text-amber-700',
      };
  const statusDescription = valid
    ? 'Esta carteirinha consta como ativa na base acadêmica.'
    : expired
      ? 'A carteirinha foi localizada, mas sua validade já terminou.'
      : revoked
        ? 'A carteirinha foi cancelada e não deve ser aceita.'
        : 'A carteirinha não corresponde a um vínculo válido.';
  const visible = (field: PublicValidationField) => (
    isValidationFieldVisible(result.visibleFields, field)
  );
  const showIdentity = ['studentName', 'studentPhotoUrl', 'studentCpf', 'studentBirthDate', 'maskedMotherName', 'maskedEnrollmentNumber']
    .some((field) => visible(field as PublicValidationField));
  const showAcademic = ['courseName', 'className', 'enrollmentStatus']
    .some((field) => visible(field as PublicValidationField));
  const showInstitution = ['institutionName', 'institutionCnpj', 'unitName']
    .some((field) => visible(field as PublicValidationField));
  const showReference = ['enrollmentDate', 'issuedAt', 'lastIssuedAt', 'expiresAt', 'issueCount']
    .some((field) => visible(field as PublicValidationField));

  return (
    <div className="mt-10 animate-fadeIn">
      <div className={`rounded-3xl p-7 text-center border ${statusClasses.container}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-white shadow-sm ${statusClasses.color}`}>
          {valid ? <CheckCircle2 size={34} /> : <XCircle size={34} />}
        </div>
        <h3 className={`text-2xl font-black uppercase tracking-tight ${statusClasses.color}`}>
          {headline}
        </h3>
        <p className={`mt-2 text-sm font-medium ${statusClasses.color}`}>
          {statusDescription}
        </p>
        <p className="mt-3 break-all font-mono text-xs font-black text-slate-600">{result.code}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {showIdentity && <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <UserRound size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Estudante</span>
          </div>
          <div className="flex items-center gap-3">
            {visible('studentPhotoUrl') && result.studentPhotoUrl ? (
              <img
                src={result.studentPhotoUrl}
                alt="Foto cadastral do estudante"
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white"
              />
            ) : visible('studentPhotoUrl') ? (
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                <UserRound size={24} />
              </div>
            ) : null}
            {visible('studentName') && <p className="font-black text-[#001a33]">{result.studentName}</p>}
          </div>
          {visible('studentCpf') && <p className="text-xs text-slate-500 mt-2">CPF: {result.maskedCpf}</p>}
          {visible('studentBirthDate') && <p className="text-xs text-slate-500">Nascimento: {result.maskedBirthDate}</p>}
          {visible('maskedMotherName') && <p className="text-xs text-slate-500">Mãe: {result.maskedMotherName}</p>}
          {visible('maskedEnrollmentNumber') && <p className="text-xs text-slate-500">Matrícula: {result.maskedEnrollmentNumber}</p>}
        </div>}

        {showAcademic && <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <GraduationCap size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Curso e turma</span>
          </div>
          {visible('courseName') && <p className="font-black text-[#001a33]">{result.courseName}</p>}
          {visible('className') && <p className="text-xs text-slate-500 mt-2">{result.className}</p>}
          {visible('enrollmentStatus') && <span className={`inline-block mt-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${valid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {result.enrollmentStatus}
          </span>}
        </div>}

        {showInstitution && <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <MapPin size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Instituição emissora</span>
          </div>
          {visible('institutionName') && <p className="font-black text-[#001a33]">{result.institutionName}</p>}
          {visible('institutionCnpj') && <p className="text-xs text-slate-500 mt-2">CNPJ: {result.institutionCnpj}</p>}
          {visible('unitName') && <p className="text-xs text-slate-500 mt-1">{result.unitName}</p>}
        </div>}

        {showReference && <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Calendar size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Emissão e referência</span>
          </div>
          {visible('enrollmentDate') && <p className="text-xs text-slate-500">Matrícula em: <strong className="text-[#001a33]">{result.enrollmentDate || 'Não informada'}</strong></p>}
          {visible('issuedAt') && <p className="text-xs text-slate-500 mt-1">Emitida em: <strong className="text-[#001a33]">{result.issuedAt || 'Não informada'}</strong></p>}
          {visible('lastIssuedAt') && <p className="text-xs text-slate-500 mt-1">Última emissão: <strong className="text-[#001a33]">{result.lastIssuedAt || result.issuedAt || 'Não informada'}</strong></p>}
          {visible('expiresAt') && <p className="text-xs text-slate-500 mt-1">Validade estimada: <strong className="text-[#001a33]">{result.estimatedValidity || 'Não informada'}</strong></p>}
          {visible('issueCount') && result.issueCount && result.issueCount > 1 && <p className="text-xs text-slate-500 mt-1">Emissões registradas: <strong className="text-[#001a33]">{result.issueCount}</strong></p>}
        </div>}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
        <ShieldCheck size={20} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          {result.registryMode === 'emission'
            ? 'Esta consulta corresponde ao registro individual da emissão da carteirinha.'
            : 'Esta carteirinha foi localizada pelo vínculo acadêmico legado. Novas emissões passam a possuir registro individual.'}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-400 uppercase font-black tracking-widest">
        <CreditCard size={14} /> Carteira de Identificação Estudantil
      </div>
    </div>
  );
};

export default CarteirinhaValidationResult;
