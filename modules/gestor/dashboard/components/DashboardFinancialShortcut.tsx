import type React from 'react';
import { ArrowUpRight, WalletCards } from 'lucide-react';

interface DashboardFinancialShortcutProps {
  labels: string[];
  onOpen: () => void;
  title?: string;
  description?: string;
}

const DashboardFinancialShortcut: React.FC<DashboardFinancialShortcutProps> = ({
  labels, onOpen, title = 'Resumo financeiro',
  description = 'Consulte os dados completos no módulo Financeiro.',
}) => (
  <button type="button" onClick={onOpen} className="home-finance">
    <span className="home-finance-icon"><WalletCards size={24} strokeWidth={1.4} /></span>
    <span className="home-finance-copy">
      <strong>{title}</strong>
      <span>{description}</span>
      <span className="home-finance-labels">{labels.map((label) => <span key={label}>{label}</span>)}</span>
    </span>
    <span className="home-finance-link">Acessar <ArrowUpRight size={18} aria-hidden="true" /></span>
  </button>
);

export default DashboardFinancialShortcut;
