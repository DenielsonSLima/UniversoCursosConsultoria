import React from 'react';
import { AcademicDocumentValidationResult } from '../validator.types';

const statusCopy = {
  valid: {
    title: 'Certificado válido',
    description: 'Certificado localizado na base de emissões e válido.',
    classes: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  },
  expired: {
    title: 'Certificado vencido',
    description: 'A emissão foi localizada, mas a validade está expirada.',
    classes: 'text-amber-700 bg-amber-50 border-amber-100',
  },
  revoked: {
    title: 'Certificado revogado',
    description: 'A emissão foi cancelada e não deve ser aceita.',
    classes: 'text-red-700 bg-red-50 border-red-100',
  },
  invalid: {
    title: 'Certificado inválido',
    description: 'Não foi possível validar este certificado.',
    classes: 'text-red-700 bg-red-50 border-red-100',
  },
};

const CertificadoValidationResult: React.FC<{ result: AcademicDocumentValidationResult }> = ({ result }) => {
  const status = statusCopy[result.status];

  return (
    <div className="mt-10 animate-fadeIn">
      <div className={`rounded-3xl p-7 text-center border ${status.classes}`}>
        <div className={`w-16 h-16 rounded-full bg-white shadow-sm ${status.classes} flex items-center justify-center mx-auto mb-4`}>
          <span className="text-lg font-black">✓</span>
        </div>
        <h3 className={`text-2xl font-black uppercase tracking-tight ${status.classes.split(' ')[0]}`}>{status.title}</h3>
        <p className={`mt-2 text-sm font-medium ${status.classes.split(' ')[0]}`}>{status.description}</p>
        <p className="mt-3 text-xs font-mono font-black text-slate-600">Código: {result.code}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aluno</p>
          <p className="font-black text-[#001a33] text-lg">{result.studentName}</p>
          <p className="text-xs text-slate-500 mt-1">CPF: {result.maskedCpf}</p>
          {result.maskedBirthDate && result.maskedBirthDate !== '**/**/****' && (
            <p className="text-xs text-slate-500 mt-1">Nascimento: {result.maskedBirthDate}</p>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Curso</p>
          <p className="font-black text-[#001a33] text-lg">{result.courseName}</p>
          <p className="text-xs text-slate-500 mt-1">Turma: {result.className}</p>
        </div>
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 md:col-span-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de inscrição</p>
          <p className="font-black text-[#001a33] text-lg">{result.enrollmentDate || 'Não informada'}</p>
        </div>
      </div>
    </div>
  );
};

export default CertificadoValidationResult;
