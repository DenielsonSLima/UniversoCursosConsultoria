import React from 'react';

interface DiarioClasseFooterProps {
  disciplina: {
    cargaHoraria: number;
    horasRealizadas: number;
  };
}

const DiarioClasseFooter: React.FC<DiarioClasseFooterProps> = ({ disciplina }) => (
  <footer className="mt-auto border-t border-slate-200 bg-slate-50 p-6 md:px-8">
    <div className="flex flex-col items-center justify-between gap-8 text-xs font-bold uppercase tracking-widest text-slate-500 xl:flex-row">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
        <div>
          Carga Horária Total:{' '}
          <span className="text-slate-700">{disciplina.cargaHoraria}H</span>
        </div>
        <div>
          Horas Lançadas:{' '}
          <span className="text-slate-700">{disciplina.horasRealizadas}H</span>
        </div>
        <div>
          Encerrado em:{' '}
          <span className="border-b border-dashed border-slate-400 px-8 text-transparent">
            ____/____/_____
          </span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-12 xl:mt-0">
        <div className="text-center">
          <div className="mb-2 h-4 w-56 border-b border-slate-400" />
          <p>ASSINATURA DO PROFESSOR</p>
        </div>
        <div className="text-center">
          <div className="mb-2 h-4 w-56 border-b border-slate-400" />
          <p>ASSINATURA DO COORDENADOR DO CURSO</p>
        </div>
      </div>
    </div>
  </footer>
);

export default DiarioClasseFooter;
