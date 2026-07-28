import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  BookOpen,
  Box,
  Clock3,
  Database,
  File,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HardDrive,
  Image,
  Layers3,
  LockKeyhole,
  Music,
  Presentation,
  RefreshCw,
  School,
  ShieldCheck,
  UserRoundCog,
  Users,
  Video,
} from 'lucide-react';
import {
  armazenamentoDashboardQueryKey,
  armazenamentoService,
  EntityMetric,
  StorageFileType,
} from './armazenamento.service';

const numberFormatter = new Intl.NumberFormat('pt-BR');

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  const maximumFractionDigits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value)} ${units[unitIndex]}`;
};

const formatPercent = (percent: number) => {
  if (percent > 0 && percent < 0.01) return '< 0,01%';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: percent < 1 ? 2 : 1,
    maximumFractionDigits: 2,
  }).format(percent)}%`;
};

const fileTypeMeta: Record<StorageFileType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bar: string;
}> = {
  imagens: { label: 'Imagens', icon: Image, color: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  pdfs: { label: 'PDFs', icon: FileText, color: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' },
  documentos: { label: 'Documentos', icon: File, color: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
  planilhas: { label: 'Planilhas', icon: FileSpreadsheet, color: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  apresentacoes: { label: 'Apresentações', icon: Presentation, color: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  videos: { label: 'Vídeos', icon: Video, color: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  audios: { label: 'Áudios', icon: Music, color: 'bg-fuchsia-50 text-fuchsia-700', bar: 'bg-fuchsia-500' },
  compactados: { label: 'Compactados', icon: Archive, color: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  outros: { label: 'Outros', icon: Box, color: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
};

const entityIcons: Record<string, React.ElementType> = {
  alunos: GraduationCap,
  professores: Users,
  matriculas: BookOpen,
  turmas: School,
  cursos: Layers3,
  gestores: UserRoundCog,
  parceiros: Users,
};

const bucketLabels: Record<string, string> = {
  anexos: 'Anexos da comunicação',
  assinaturas: 'Assinaturas',
  'bank-cnab': 'Arquivos bancários',
  biblioteca: 'Biblioteca',
  'despesas-anexos': 'Anexos de despesas',
  documentos: 'Documentos do sistema',
  'documentos-alunos': 'Documentos de alunos',
  vacinas: 'Comprovantes de vacinas',
  'whatsapp-assets': 'Mídias do WhatsApp',
};

const tableLabels: Record<string, string> = {
  sistema_eventos: 'Logs e eventos',
  contas_receber: 'Contas a receber',
  documentos_templates: 'Templates de documentos',
  cursos: 'Cursos',
  diario_frequencia: 'Frequências',
  parceiros: 'Alunos, professores e parceiros',
  documentos_aluno: 'Controle documental dos alunos',
  gestao_realtime_events: 'Eventos em tempo real',
};

const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse" aria-label="Carregando dados de armazenamento">
    <div className="h-64 rounded-[2rem] bg-slate-100" />
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="h-80 rounded-[2rem] bg-slate-100" />
      <div className="h-80 rounded-[2rem] bg-slate-100" />
    </div>
  </div>
);

const EntityCard = ({ entity }: { entity: EntityMetric }) => {
  const Icon = entityIcons[entity.id] || Layers3;
  const showsActive = ['alunos', 'professores', 'cursos', 'gestores'].includes(entity.id);
  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-700">
          <Icon size={19} />
        </span>
        {showsActive && (
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
            {numberFormatter.format(entity.activeCount)} ativos
          </span>
        )}
      </div>
      <p className="text-2xl font-black tracking-tight text-[#001a33]">{numberFormatter.format(entity.totalCount)}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{entity.label}</p>
    </div>
  );
};

const ArmazenamentoConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: armazenamentoDashboardQueryKey,
    queryFn: armazenamentoService.getDashboard,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const dashboard = dashboardQuery.data;
  const storage = dashboard?.storage;
  const usagePercent = Math.min(Math.max(storage?.usagePercent || 0, 0), 100);
  const maxTypeBytes = Math.max(...(storage?.byType.map((item) => item.usedBytes) || [0]), 1);
  const maxTableBytes = Math.max(...(dashboard?.database.largestTables.map((item) => item.usedBytes) || [0]), 1);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: armazenamentoDashboardQueryKey });
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-7 flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            <HardDrive size={15} />
            Infraestrutura e capacidade
          </div>
          <h2 className="text-3xl font-black tracking-tight text-[#001a33]">Armazenamento</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Acompanhe arquivos, banco de dados e o crescimento dos principais cadastros do Universo.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={dashboardQuery.isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw size={15} className={dashboardQuery.isFetching ? 'animate-spin' : ''} />
          Atualizar dados
        </button>
      </div>

      {dashboardQuery.isLoading && <DashboardSkeleton />}

      {dashboardQuery.isError && (
        <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-8 text-center">
          <HardDrive className="mx-auto mb-3 text-rose-500" size={30} />
          <h3 className="font-black text-rose-900">Não foi possível carregar o armazenamento</h3>
          <p className="mx-auto mt-1 max-w-lg text-sm text-rose-700">
            Confirme sua permissão em Configurações e tente atualizar os dados.
          </p>
          <button type="button" onClick={refresh} className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white">
            Tentar novamente
          </button>
        </div>
      )}

      {dashboard && storage && (
        <div className="space-y-6 animate-fadeIn">
          <section className="relative overflow-hidden rounded-[2rem] bg-[#001f3d] p-6 text-white shadow-xl shadow-blue-950/15 md:p-8">
            <div className="pointer-events-none absolute inset-0 opacity-20" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
              backgroundSize: '34px 34px',
            }} />
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">
                  <ShieldCheck size={14} />
                  Supabase Storage
                </div>
                <p className="text-sm font-bold text-blue-200">Capacidade contratada</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-5xl font-black tracking-[-0.05em] md:text-6xl">{formatBytes(storage.quotaBytes)}</span>
                  <span className="text-sm font-bold text-blue-200">para arquivos</span>
                </div>
                <div className="mt-7 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Em uso</p>
                    <p className="mt-1 text-xl font-black">{formatBytes(storage.usedBytes)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Disponível</p>
                    <p className="mt-1 text-xl font-black">{formatBytes(storage.availableBytes)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Arquivos</p>
                    <p className="mt-1 text-xl font-black">{numberFormatter.format(storage.objectCount)}</p>
                  </div>
                </div>
              </div>

              <div className="relative mx-auto flex h-48 w-48 shrink-0 items-center justify-center rounded-full p-[14px]" style={{
                background: `conic-gradient(#22d3ee ${Math.max(usagePercent, 0.35)}%, rgba(255,255,255,.12) 0)`,
              }}>
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-white/10 bg-[#001f3d] text-center shadow-inner">
                  <span className="text-3xl font-black tracking-tight">{formatPercent(usagePercent)}</span>
                  <span className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">ocupado</span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
            <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#001a33]">Arquivos por tipo</h3>
                  <p className="text-xs font-medium text-slate-500">Quantidade e espaço consumido por formato.</p>
                </div>
                <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><FileText size={20} /></span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {storage.byType.map((item) => {
                  const meta = fileTypeMeta[item.type];
                  const Icon = meta.icon;
                  const width = item.usedBytes > 0 ? Math.max((item.usedBytes / maxTypeBytes) * 100, 4) : 0;
                  return (
                    <div key={item.type} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.color}`}><Icon size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-sm font-black text-slate-800">{meta.label}</p>
                            <p className="text-xs font-black text-slate-600">{formatBytes(item.usedBytes)}</p>
                          </div>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{numberFormatter.format(item.objectCount)} arquivos</p>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-[#001a33]">Espaço do sistema</h3>
                  <p className="text-xs font-medium text-slate-500">PostgreSQL, tabelas, índices e histórico.</p>
                </div>
                <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Database size={20} /></span>
              </div>
              <div className="mb-5 rounded-2xl bg-emerald-950 p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Banco de dados utilizado</p>
                <p className="mt-1 text-3xl font-black tracking-tight">{formatBytes(dashboard.database.usedBytes)}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-emerald-100/80">
                  Indicador separado da cota de 100 GB destinada aos arquivos do Storage.
                </p>
              </div>
              <div className="space-y-3">
                {dashboard.database.largestTables.map((table) => (
                  <div key={table.name}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-bold text-slate-600">{tableLabels[table.name] || table.name.replaceAll('_', ' ')}</span>
                      <span className="shrink-0 font-black text-slate-800">{formatBytes(table.usedBytes)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max((table.usedBytes / maxTableBytes) * 100, 2)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-[2rem] border border-slate-200/80 bg-slate-50/60 p-6">
            <div className="mb-5">
              <h3 className="text-lg font-black text-[#001a33]">Dados cadastrados</h3>
              <p className="text-xs font-medium text-slate-500">Visão rápida do volume operacional do sistema.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {dashboard.entities.map((entity) => (
                <div key={entity.id}>
                  <EntityCard entity={entity} />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-[#001a33]">Pastas de armazenamento</h3>
                <p className="text-xs font-medium text-slate-500">Consumo por bucket e nível de acesso dos arquivos.</p>
              </div>
              <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><HardDrive size={20} /></span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="hidden grid-cols-[1fr_130px_120px_100px] gap-4 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 md:grid">
                <span>Pasta</span><span>Arquivos</span><span>Espaço</span><span>Acesso</span>
              </div>
              {storage.byBucket.map((bucket) => (
                <div key={bucket.id} className="grid gap-3 border-t border-slate-100 px-5 py-4 first:border-t-0 md:grid-cols-[1fr_130px_120px_100px] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Box size={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-700">{bucketLabels[bucket.id] || bucket.name}</p>
                      <p className="truncate font-mono text-[10px] text-slate-400">{bucket.id}</p>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-slate-600"><span className="mr-1 text-slate-400 md:hidden">Arquivos:</span>{numberFormatter.format(bucket.objectCount)}</p>
                  <p className="text-xs font-black text-slate-700"><span className="mr-1 text-slate-400 md:hidden">Espaço:</span>{formatBytes(bucket.usedBytes)}</p>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${bucket.isPublic ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {bucket.isPublic ? <Layers3 size={11} /> : <LockKeyhole size={11} />}
                    {bucket.isPublic ? 'Público' : 'Privado'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs font-medium text-blue-800 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2"><Clock3 size={14} /> Última leitura: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dashboard.generatedAt))}</span>
            <span>Atualização manual ou automática a cada 5 minutos.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArmazenamentoConfig;
