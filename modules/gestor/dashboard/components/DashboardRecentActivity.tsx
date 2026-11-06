import type React from 'react';
import { DollarSign, FileText, GraduationCap } from 'lucide-react';
import type { RecentActivityItem } from '../dashboard.service';
import { formatTimeAgo } from '../dashboard.presentation';

interface DashboardRecentActivityProps {
  activities: RecentActivityItem[];
  loading: boolean;
  now: Date;
}

const DashboardRecentActivity: React.FC<DashboardRecentActivityProps> = ({ activities, loading, now }) => (
  <section className="home-panel home-activity">
    <div className="home-panel-heading">
      <div><p className="home-eyebrow">Movimentação</p><h2>Atividade recente</h2></div>
    </div>
    {loading ? (
      <div className="home-activity-list" aria-label="Carregando atividades" role="status">
        {[1, 2, 3].map((item) => <div key={item} className="home-skeleton h-12 w-full" />)}
      </div>
    ) : activities.length > 0 ? (
      <ol className="home-activity-list">
        {activities.slice(0, 4).map((activity, index) => (
          <li key={`${activity.dataEvento}-${index}`} className="home-activity-item">
            <span className={`home-activity-icon ${activity.tipoAtividade === 'pagamento' ? 'is-payment' : ''}`}>
              {activity.tipoAtividade === 'matricula' ? <GraduationCap size={17} strokeWidth={1.7} />
                : activity.tipoAtividade === 'pagamento' ? <DollarSign size={17} strokeWidth={1.7} />
                  : <FileText size={17} strokeWidth={1.7} />}
            </span>
            <div className="home-activity-copy"><strong>{activity.titulo}</strong><p>{activity.descricao}</p></div>
            <span className="home-activity-time">{formatTimeAgo(activity.dataEvento, now)}</span>
          </li>
        ))}
      </ol>
    ) : <p className="home-empty">Nenhuma atividade recente registrada.</p>}
  </section>
);

export default DashboardRecentActivity;
