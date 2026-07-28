import type React from 'react';
import { Activity, DollarSign, FileText, GraduationCap } from 'lucide-react';
import type { RecentActivityItem } from '../dashboard.service';
import { formatTimeAgo } from '../dashboard.presentation';

interface DashboardRecentActivityProps {
  activities: RecentActivityItem[];
  loading: boolean;
  now: Date;
}

const DashboardRecentActivity: React.FC<DashboardRecentActivityProps> = ({ activities, loading, now }) => (
  <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
        <Activity size={17} />
      </span>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-600">Movimentação</p>
        <h2 className="text-sm font-bold">Atividade recente</h2>
      </div>
    </div>

    {loading ? (
      <div className="mt-4 space-y-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex animate-pulse gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-1/3 rounded bg-slate-100" />
              <div className="h-2 w-2/3 rounded bg-slate-50" />
            </div>
          </div>
        ))}
      </div>
    ) : activities.length > 0 ? (
      <div className="mt-4 divide-y divide-slate-100">
        {activities.slice(0, 4).map((activity, index) => (
          <div key={`${activity.dataEvento}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              activity.tipoAtividade === 'matricula'
                ? 'bg-blue-50 text-blue-600'
                : activity.tipoAtividade === 'pagamento'
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-amber-50 text-amber-600'
            }`}>
              {activity.tipoAtividade === 'matricula'
                ? <GraduationCap size={14} />
                : activity.tipoAtividade === 'pagamento'
                  ? <DollarSign size={14} />
                  : <FileText size={14} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{activity.titulo}</span>
              <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">{activity.descricao}</span>
            </span>
            <span className="shrink-0 text-[9px] font-semibold text-slate-400">{formatTimeAgo(activity.dataEvento, now)}</span>
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs font-medium text-slate-500">
        Nenhuma atividade recente registrada.
      </p>
    )}
  </section>
);

export default DashboardRecentActivity;
