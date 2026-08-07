import React from 'react';
import { DiarioTemplate } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';

interface DiarioPrintPageProps {
  template: DiarioTemplate;
  turma: any;
  disciplina: any;
  moduloNome: string;
  title: string;
  pageLabel: string;
  compactMode?: boolean;
  logoAlignRight?: boolean;
  children: React.ReactNode;
}

const DiarioPrintPage: React.FC<DiarioPrintPageProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  title,
  pageLabel,
  compactMode = false,
  logoAlignRight = false,
  children,
}) => (
  <section className={`diario-print-page ${compactMode ? 'diario-print-page--compact' : ''}`}>
    <div className="diario-accent" />
    <div className="diario-page-body">
      <div className={`diario-page-header ${logoAlignRight ? 'diario-page-header--right' : ''}`}>
        {template?.cabecalhoLogoUrl ? (
          <img
            src={template.cabecalhoLogoUrl}
            alt="Logo"
            className={`diario-page-logo ${logoAlignRight ? 'diario-page-logo--right' : ''}`}
          />
        ) : (
          <img
            src="/LogoUniverso.png"
            alt="Universo Cursos e Consultoria"
            className={`diario-page-logo ${logoAlignRight ? 'diario-page-logo--right' : ''}`}
          />
        )}
      </div>
      <h2 className="diario-doc-title">{title}</h2>
      <div className="diario-meta">
        <div><strong>Curso:</strong> {turma.cursoNome || '—'}</div>
        <div><strong>Turma:</strong> {turma.nome || turma.codigo || '—'}</div>
        <div><strong>Professor(a):</strong> {disciplina.professor || 'Não atribuído'}</div>
        <div><strong>Módulo:</strong> {moduloNome}</div>
        <div><strong>Unidade educacional:</strong> {disciplina.nome}</div>
        <div><strong>Carga horária:</strong> {disciplina.cargaHoraria || 0}h</div>
      </div>
      <div className="diario-page-content">
        {children}
      </div>
      <div className="diario-footer">
        <span>{template.rodape}</span>
        <span>{pageLabel}</span>
      </div>
    </div>
  </section>
);

export default DiarioPrintPage;
