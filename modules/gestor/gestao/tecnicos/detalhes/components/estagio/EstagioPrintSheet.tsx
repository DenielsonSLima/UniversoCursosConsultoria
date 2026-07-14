import React from 'react';
import { Turma } from '../../../../gestao.types';
import {
  EstagioCriteriosValores,
  EstagioProcedimentosLog,
} from '../../turma-estagio.types';

interface EstagioPrintSheetProps {
  turma: Turma;
  aluno: any;
  disciplina: any;
  instrutorNome: string;
  dataAvaliacao: string;
  frequenciaEstagio: number;
  instrumentosConfig: any[];
  criteriosValores: EstagioCriteriosValores;
  procedimentosLog: EstagioProcedimentosLog;
  perfilAluno: string;
  ucConfig: any;
  avaliacaoCalculada: any;
  getSubtotal: (grupoNome: string) => number;
}

const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden; }
    #print-area, #print-area * { visibility: visible; }
    #print-area { position: absolute; left: 0; top: 0; width: 100%; }
    .no-print { display: none !important; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; }
    th, td { border: 1px solid black; padding: 6px; text-align: left; font-size: 11px; }
    th { background-color: #f2f2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-title { font-weight: bold; text-transform: uppercase; background-color: #e6e6e6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-logo { text-align: center; font-weight: 900; font-size: 15px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 15px; }
  }
`;

const getProcedureStatusLabel = (status: string) => {
  if (status === 'A') return 'Ajudou (A)';
  if (status === 'E') return 'Executou (E)';
  if (status === 'O') return 'Observou (O)';
  return 'Não Realizado';
};

const EstagioPrintSheet: React.FC<EstagioPrintSheetProps> = ({
  turma,
  aluno,
  disciplina,
  instrutorNome,
  dataAvaliacao,
  frequenciaEstagio,
  instrumentosConfig,
  criteriosValores,
  procedimentosLog,
  perfilAluno,
  ucConfig,
  avaliacaoCalculada,
  getSubtotal,
}) => (
  <div id="print-area" className="hidden print:block bg-white text-black p-4 text-[12px] font-sans">
    <style>{PRINT_STYLES}</style>

    <div className="header-logo">
      UNIVERSO CURSOS E CONSULTORIA<br />
      <span className="text-sm font-bold">CURSO PROFISSIONALIZANTE TÉCNICO EM ENFERMAGEM</span><br />
      <span className="text-xs uppercase font-medium">Instrumentos Avaliativos para Estágio Supervisionado</span>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-4 border border-black p-3 rounded bg-slate-50">
      <div>
        <p><strong>Aluno(a):</strong> {aluno.nome}</p>
        <p><strong>Turma / Código:</strong> {turma.nome} ({turma.codigo})</p>
        <p><strong>Unidade Curricular:</strong> {disciplina?.nome}</p>
      </div>
      <div>
        <p><strong>Instrutor(a) / Supervisor(a):</strong> {instrutorNome || '_____________________________________'}</p>
        <p><strong>Data de Avaliação:</strong> {dataAvaliacao ? new Date(`${dataAvaliacao}T12:00:00`).toLocaleDateString('pt-BR') : '__/__/____'}</p>
        <p><strong>Frequência no Estágio:</strong> {frequenciaEstagio}%</p>
      </div>
    </div>

    <h3 className="font-bold text-sm uppercase border-b border-black pb-1 mb-2">Critérios de Avaliação Acadêmica</h3>
    {instrumentosConfig.map((grupo, grupoIndex) => (
      <div key={grupoIndex} className="mb-4">
        <table className="min-w-full">
          <thead>
            <tr className="section-title">
              <th style={{ width: '8%' }}>Item</th>
              <th style={{ width: '50%' }}>{grupo.grupo} (Máx: {grupo.valorMax} pts)</th>
              <th style={{ width: '30%' }}>Observações</th>
              <th style={{ width: '12%' }}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {grupo.itens.map((item: string, itemIndex: number) => {
              const savedItem = criteriosValores[grupo.grupo]?.[item] || { nota: 0, obs: '' };
              return (
                <tr key={itemIndex}>
                  <td className="text-center font-mono">{String(itemIndex + 1).padStart(2, '0')}</td>
                  <td>{item}</td>
                  <td>{savedItem.obs || '—'}</td>
                  <td className="text-center font-bold">{savedItem.nota.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-bold">
              <td colSpan={3} className="text-right uppercase">Subtotal {grupo.grupo}:</td>
              <td className="text-center">{getSubtotal(grupo.grupo).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    ))}

    <div className="flex justify-end gap-4 p-3 border border-black rounded mb-6 bg-slate-50">
      <span className="font-black text-sm uppercase">Nota Final de Estágio (E):</span>
      <span className="font-black text-sm text-emerald-700">{Number(avaliacaoCalculada?.final || 0).toFixed(2)} / 10.00</span>
    </div>

    {ucConfig.atividades.length > 0 ? (
      <>
        <h3 className="font-bold text-sm uppercase border-b border-black pb-1 mb-2">Checklist de Competências / Procedimentos Práticos</h3>
        <table className="min-w-full">
          <thead>
            <tr className="section-title">
              <th style={{ width: '60%' }}>Procedimento / Atividade Realizada</th>
              <th style={{ width: '15%' }} className="text-center">Participação</th>
              <th style={{ width: '25%' }} className="text-center">Data Realização</th>
            </tr>
          </thead>
          <tbody>
            {ucConfig.atividades.map((atividade: string, atividadeIndex: number) => {
              const status = procedimentosLog[atividade]?.status || '';
              const date = procedimentosLog[atividade]?.data || '';
              return (
                <tr key={atividadeIndex}>
                  <td>{atividade}</td>
                  <td className="text-center font-bold text-xs">{getProcedureStatusLabel(status)}</td>
                  <td className="text-center">{date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[10px] italic text-slate-500 mb-4">Legenda de Participação: A - Ajudou; E - Executou; O - Observou</p>
      </>
    ) : null}

    <div className="mb-6">
      <h4 className="font-bold text-xs uppercase mb-1">Perfil do Aluno (a) / Comentários Qualitativos:</h4>
      <div className="border border-black p-3 rounded min-h-[80px] bg-slate-50 text-xs">
        {perfilAluno || 'Nenhuma observação cadastrada.'}
      </div>
    </div>

    <div className="grid grid-cols-3 gap-6 pt-8 mt-12 text-center text-xs font-bold no-print">
      <div className="border-t border-black pt-2">
        <p>{aluno.nome}</p>
        <p className="font-normal text-slate-500">Assinatura do(a) Aluno(a)</p>
      </div>
      <div className="border-t border-black pt-2">
        <p>{instrutorNome || '___________________________'}</p>
        <p className="font-normal text-slate-500">Assinatura e Carimbo do Instrutor(a)</p>
      </div>
      <div className="border-t border-black pt-2">
        <p>___________________________</p>
        <p className="font-normal text-slate-500">Assinatura do(a) Coordenador(a)</p>
      </div>
    </div>
  </div>
);

export default EstagioPrintSheet;
