import React from 'react';
import { DiarioTemplate } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';

interface DiarioPrintPageProps {
  template: DiarioTemplate;
  turma: any;
  disciplina: any;
  moduloNome: string;
  title: string;
  pageLabel: string;
  children: React.ReactNode;
}

const DiarioPrintPage: React.FC<DiarioPrintPageProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  title,
  pageLabel,
  children,
}) => (
  <section className="diario-print-page">
    <div className="diario-accent" />
    <div className="diario-page-body">
      <div className="text-center text-[7pt] font-bold uppercase tracking-[.12em] text-slate-500">{template.cabecalho}</div>
      <h2 className="diario-doc-title">{title}</h2>
      <div className="diario-meta">
        <div><strong>Curso:</strong> {turma.cursoNome || '—'}</div>
        <div><strong>Turma:</strong> {turma.nome || turma.codigo || '—'}</div>
        <div><strong>Professor(a):</strong> {disciplina.professor || 'Não atribuído'}</div>
        <div><strong>Módulo:</strong> {moduloNome}</div>
        <div><strong>Unidade educacional:</strong> {disciplina.nome}</div>
        <div><strong>Carga horária:</strong> {disciplina.cargaHoraria || 0}h</div>
      </div>
      {children}
      <div className="diario-footer">
        <span>{template.rodape}</span>
        <span>{pageLabel}</span>
      </div>
    </div>
  </section>
);

export default DiarioPrintPage;
