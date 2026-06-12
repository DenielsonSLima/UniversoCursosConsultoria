
import React from 'react';
import { Users, TrendingUp, AlertCircle, Calendar, Clock } from 'lucide-react';
import { Turma } from '../../../gestao.types';

interface TurmaResumoProps {
  turma: Turma;
}

const TurmaResumo: React.FC<TurmaResumoProps> = ({ turma }) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Users size={20} /></div>
            <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded-full">+2 este mês</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">{turma.alunosMatriculados}</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Alunos Ativos</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp size={20} /></div>
            <span className="text-emerald-600 text-[10px] font-bold bg-emerald-50 px-2 py-1 rounded-full">92%</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">Presença</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Média Geral</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><AlertCircle size={20} /></div>
            <span className="text-rose-600 text-[10px] font-bold bg-rose-50 px-2 py-1 rounded-full">3 Alunos</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">Risco</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Evasão / Reprovação</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Clock size={20} /></div>
            <span className="text-slate-400 text-[10px] font-bold">Módulo 1</span>
          </div>
          <p className="text-2xl font-black text-[#001a33]">25%</p>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Progresso do Curso</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Próximas Aulas */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Cronograma da Semana</h3>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex flex-col items-center justify-center bg-white w-12 h-12 rounded-lg shadow-sm text-[#001a33] font-bold text-xs border border-slate-100">
                  <span>SEG</span>
                  <span className="text-lg">1{i}</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#001a33] text-sm">Anatomia Humana - Aula {i}</h4>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                    <Clock size={12} /> 19:00 - 22:00 • Prof. Dr. Santos
                  </p>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold uppercase">Confirmada</span>
              </div>
            ))}
          </div>
        </div>

        {/* Avisos / Pendências */}
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
          <h3 className="text-lg font-bold text-[#001a33] mb-4">Avisos da Turma</h3>
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border-l-4 border-yellow-400 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Secretaria</p>
              <p className="text-sm text-slate-700 font-medium">5 alunos pendentes de entrega de documentos (Histórico).</p>
            </div>
            <div className="bg-white p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Coordenação</p>
              <p className="text-sm text-slate-700 font-medium">Cronograma de estágios liberado para o próximo módulo.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurmaResumo;
