import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import './gestao-turma-details.css';

interface TurmaDetailsHeaderProps {
  code: string;
  status: string;
  active?: boolean;
  title: string;
  description: ReactNode;
  onBack: () => void;
  children: ReactNode;
}

const TurmaDetailsHeader = ({
  code,
  status,
  active = false,
  title,
  description,
  onBack,
  children,
}: TurmaDetailsHeaderProps) => (
  <header className="gestao-turma-heading">
    <div className="gestao-turma-identity">
      <button type="button" aria-label="Voltar para turmas" className="gestao-turma-back" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" />
      </button>
      <div className="gestao-turma-title">
        <div className="gestao-turma-meta">
          <span className="gestao-turma-code">{code}</span>
          <span className={`gestao-turma-status ${active ? 'is-active' : ''}`}>{status}</span>
        </div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    {children}
  </header>
);

export default TurmaDetailsHeader;
