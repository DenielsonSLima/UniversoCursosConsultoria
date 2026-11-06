import type React from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

interface DashboardMetricCardProps {
  label: string;
  value: React.ReactNode;
  helper: string;
  icon: LucideIcon;
  tone: string;
  loading?: boolean;
  onClick?: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label, value, helper, icon: Icon, loading = false, onClick,
}) => {
  const Element = onClick ? 'button' : 'div';
  return (
    <Element type={onClick ? 'button' : undefined} onClick={onClick} className="home-metric">
      <span className="home-metric-label"><Icon size={15} strokeWidth={1.7} />{label}</span>
      <span className="home-metric-value">
        {loading ? <span className="home-skeleton h-9 w-20" /> : value}
        {onClick && <ArrowUpRight size={18} aria-hidden="true" />}
      </span>
      <span className="home-metric-helper">{helper}</span>
    </Element>
  );
};

export default DashboardMetricCard;
