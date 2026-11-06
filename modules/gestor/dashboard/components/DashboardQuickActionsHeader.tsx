import type React from 'react';
import { ArrowUpRight, UserPlus, WalletCards } from 'lucide-react';
import type { DashboardQuickActionMode } from '../dashboard.presentation';

interface DashboardQuickActionsHeaderProps {
  canCreatePartner: boolean;
  canSearchStudentFinance: boolean;
  onOpenAction: (mode: DashboardQuickActionMode) => void;
}

const DashboardQuickActionsHeader: React.FC<DashboardQuickActionsHeaderProps> = ({
  canCreatePartner, canSearchStudentFinance, onOpenAction,
}) => (
  <section className="home-shortcuts" aria-label="Atalhos">
    <div className="home-shortcuts-label">
      <span className="home-eyebrow">Atalhos</span>
      
    </div>
    <div className="home-shortcuts-actions">
      {canCreatePartner && (
        <button type="button" onClick={() => onOpenAction('partner')} className="home-shortcut">
          <span className="home-shortcut-icon"><UserPlus size={18} strokeWidth={1.6} /></span>
          <span className="home-shortcut-copy">
            <strong>Cadastrar parceiro</strong>
            <span>Aluno, professor, responsável, pessoa física ou jurídica</span>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      )}
      {canSearchStudentFinance && (
        <button type="button" onClick={() => onOpenAction('student-finance')} className="home-shortcut">
          <span className="home-shortcut-icon"><WalletCards size={18} strokeWidth={1.6} /></span>
          <span className="home-shortcut-copy">
            <strong>Financeiro do aluno</strong>
            <span>Digite o nome e consulte as parcelas</span>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  </section>
);

export default DashboardQuickActionsHeader;
