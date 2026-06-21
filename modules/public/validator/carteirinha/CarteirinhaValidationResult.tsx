import React from 'react';
import { Calendar, CheckCircle2, CreditCard, GraduationCap, MapPin, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { CarteirinhaValidationResult as CarteirinhaResult } from '../validator.types';

interface CarteirinhaValidationResultProps {
  result: CarteirinhaResult;
}

const CarteirinhaValidationResult: React.FC<CarteirinhaValidationResultProps> = ({ result }) => {
  const valid = result.status === 'valid';
  const expired = result.status === 'expired';
  const headline = valid
    ? 'Carteirinha válida'
    : expired
      ? 'Carteirinha vencida'
      : 'Carteirinha sem vínculo ativo';

  return (
    <div className="mt-10 animate-fadeIn">
      <div className={`rounded-3xl p-7 text-center border ${valid ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-white shadow-sm ${valid ? 'text-emerald-600' : 'text-amber-600'}`}>
          {valid ? <CheckCircle2 size={34} /> : <XCircle size={34} />}
        </div>
        <h3 className={`text-2xl font-black uppercase tracking-tight ${valid ? 'text-emerald-800' : 'text-amber-800'}`}>
          {headline}
        </h3>
        <p className={`mt-2 text-sm font-medium ${valid ? 'text-emerald-700' : 'text-amber-700'}`}>
          Código <strong>{result.code}</strong> localizado na base acadêmica.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <UserRound size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Estudante</span>
          </div>
          <div className="flex items-center gap-3">
            {result.studentPhotoUrl ? (
              <img
                src={result.studentPhotoUrl}
                alt="Foto cadastral do estudante"
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-white"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                <UserRound size={24} />
              </div>
            )}
            <p className="font-black text-[#001a33]">{result.studentName}</p>
          </div>
          <p className="text-xs text-slate-500 mt-2">CPF: {result.maskedCpf}</p>
          <p className="text-xs text-slate-500">Nascimento: {result.maskedBirthDate}</p>
          <p className="text-xs text-slate-500">Mãe: {result.maskedMotherName}</p>
          <p className="text-xs text-slate-500">Matrícula: {result.maskedEnrollmentNumber}</p>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <GraduationCap size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Curso e turma</span>
          </div>
          <p className="font-black text-[#001a33]">{result.courseName}</p>
          <p className="text-xs text-slate-500 mt-2">{result.className}</p>
          <span className={`inline-block mt-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${valid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {result.enrollmentStatus}
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <MapPin size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Instituição emissora</span>
          </div>
          <p className="font-black text-[#001a33]">{result.institutionName}</p>
          <p className="text-xs text-slate-500 mt-2">CNPJ: {result.institutionCnpj}</p>
          <p className="text-xs text-slate-500 mt-1">{result.unitName}</p>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-slate-400 mb-3">
            <Calendar size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Referência cadastral</span>
          </div>
          <p className="text-xs text-slate-500">Matrícula em: <strong className="text-[#001a33]">{result.enrollmentDate || 'Não informada'}</strong></p>
          <p className="text-xs text-slate-500 mt-1">Validade estimada: <strong className="text-[#001a33]">{result.estimatedValidity || 'Não informada'}</strong></p>
        </div>
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
