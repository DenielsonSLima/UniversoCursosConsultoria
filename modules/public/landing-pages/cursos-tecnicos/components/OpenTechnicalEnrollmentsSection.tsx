import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  AlertCircle,
  CalendarDays,
  Clock3,
  GraduationCap,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TechnicalLandingData } from '../technicalLanding.types';
import { buildTechnicalLandingPath } from '../technicalLanding.routes';
import { technicalLandingService } from '../technicalLanding.service';
import { technicalLandingKeys } from '../technicalLanding.keys';

const formatDate = (value?: string | null) => {
  if (!value) return 'A definir';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
};

const titleCase = (value: string) =>
  value.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (char) => char.toLocaleUpperCase('pt-BR'));

interface TechnicalClassCardProps {
  item: TechnicalLandingData;
  featured: boolean;
}

interface ClassDetailProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}

const ClassDetail: React.FC<ClassDetailProps> = ({ icon: Icon, label, value }) => (
  <div className="flex min-w-0 items-start gap-3 border-t border-slate-200 py-4 first:border-t-0 sm:first:border-t">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
      <Icon size={18} />
    </span>
    <div className="min-w-0">
      <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-extrabold leading-snug text-[#001a33]">{value}</dd>
    </div>
  </div>
);

const TechnicalClassCard: React.FC<TechnicalClassCardProps> = ({ item, featured }) => {
  const onlineEnrollmentAvailable = item.turma.onlineEnrollmentAvailable;
  const showAvailableSeats = onlineEnrollmentAvailable && item.turma.availableSeats > 0;
  const landingPath = buildTechnicalLandingPath(item.course.name, item.turma.id);
  const ctaLabel = onlineEnrollmentAvailable ? 'Inscrever-se online' : 'Conhecer esta turma';

  return (
    <article
      className={`group overflow-hidden border border-slate-200 bg-white shadow-[0_24px_70px_-38px_rgba(0,26,51,0.5)] transition duration-300 hover:border-blue-300 hover:shadow-[0_28px_80px_-36px_rgba(0,72,180,0.45)] motion-reduce:transform-none ${
        featured
          ? 'grid rounded-[1.75rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(26rem,0.95fr)]'
          : 'flex h-full flex-col rounded-[1.5rem]'
      }`}
    >
      <div
        className={`relative isolate overflow-hidden bg-[#001a33] ${
          featured ? 'min-h-[22rem] lg:min-h-[34rem]' : 'h-60'
        }`}
      >
        {item.course.imageUrl ? (
          <img
            src={item.course.imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.025] motion-reduce:transform-none"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#001a33_0%,#003c79_58%,#0f766e_130%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#001426] via-[#001a33]/30 to-[#001a33]/5" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:56px_56px]" />

        <div className="absolute inset-x-5 top-5 flex flex-wrap items-center gap-2 sm:inset-x-7 sm:top-7">
          <span
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] shadow-lg backdrop-blur-md ${
              onlineEnrollmentAvailable
                ? 'border-emerald-300/40 bg-emerald-400 text-emerald-950'
                : 'border-white/20 bg-[#001a33]/80 text-blue-100'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${onlineEnrollmentAvailable ? 'bg-emerald-950' : 'bg-blue-300'}`} />
            {item.turma.availabilityLabel}
          </span>
          {showAvailableSeats ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/90 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-[#001a33] shadow-lg backdrop-blur-md">
              <Sparkles size={12} className="text-amber-500" />
              {item.turma.availableSeats} vaga{item.turma.availableSeats > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>

        <div className="absolute inset-x-6 bottom-6 text-white sm:inset-x-8 sm:bottom-8">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">
            {item.course.area || 'Formação técnica'}
          </p>
          <p className={`mt-2 max-w-xl font-black leading-tight ${featured ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>
            {item.course.name}
          </p>
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${featured ? 'p-6 sm:p-8 lg:p-10' : 'p-6'}`}>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Turma em destaque</p>
          <h3 className={`mt-3 font-black leading-tight tracking-tight text-[#001a33] ${featured ? 'text-3xl' : 'text-2xl'}`}>
            {item.course.name}
          </h3>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
            Formação presencial com informações da turma, disponibilidade e inscrição reunidas em um só lugar.
          </p>
        </div>

        <dl className={`mt-6 grid gap-x-6 ${featured ? 'sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
          <ClassDetail icon={MapPin} label="Polo" value={titleCase(item.polo.name)} />
          <ClassDetail icon={Clock3} label="Turno" value={titleCase(item.turma.shift)} />
          <ClassDetail icon={CalendarDays} label="Início previsto" value={formatDate(item.turma.startDate)} />
          <ClassDetail icon={Users} label="Inscrições até" value={formatDate(item.turma.enrollmentEndDate)} />
        </dl>

        <div className="mt-auto border-t border-slate-200 pt-6">
          <Link
            to={landingPath}
            aria-label={`${ctaLabel} em ${item.course.name}`}
            className={`group/cta flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-xs font-black uppercase tracking-[0.14em] shadow-lg transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 motion-reduce:transform-none ${
              onlineEnrollmentAvailable
                ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-600/25'
                : 'bg-[#001a33] text-white hover:bg-[#00305d]'
            }`}
          >
            <span>{ctaLabel}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.12]">
              <ArrowRight size={18} className="transition-transform group-hover/cta:translate-x-1 motion-reduce:transform-none" />
            </span>
          </Link>
          <p className="mt-3 text-center text-[10px] font-bold text-slate-400">
            Consulte valores, documentos e condições cadastradas para esta turma.
          </p>
        </div>
      </div>
    </article>
  );
};

const OpenTechnicalEnrollmentsSection: React.FC = () => {
  const query = useQuery({
    queryKey: technicalLandingKeys.list(3),
    queryFn: () => technicalLandingService.listPublishedClasses(3),
    staleTime: 60_000,
  });

  if (!query.isLoading && !query.isError && !query.data?.length) return null;

  const classes = query.data || [];
  const hasSingleClass = classes.length === 1;
  const classesGrid = classes.length === 2
    ? 'grid gap-7 md:grid-cols-2'
    : 'grid gap-7 md:grid-cols-2 xl:grid-cols-3';

  return (
    <section id="matriculas-tecnicas-abertas" className="relative isolate overflow-hidden bg-[#f5f8fc] py-16 md:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
      <div className="pointer-events-none absolute -right-44 top-8 h-[28rem] w-[28rem] rounded-full bg-blue-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-52 -left-40 h-[30rem] w-[30rem] rounded-full bg-emerald-100/50 blur-3xl" />

      <div className="container relative mx-auto px-5 md:px-8">
        <div className="mb-10 grid items-end gap-7 border-b border-slate-200 pb-9 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/20">
                <GraduationCap size={18} />
              </span>
              Formação profissional técnica
            </div>
            <h2 className="mt-5 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.035em] text-[#001a33] sm:text-5xl">
              Turmas técnicas <span className="text-blue-600">em destaque</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base font-medium leading-relaxed text-slate-600">
              Conheça as próximas turmas, confira as condições cadastradas e escolha a formação ideal para o seu futuro.
            </p>
          </div>

          <Link
            to="/cursos-tecnicos"
            className="group inline-flex min-h-12 w-fit items-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#001a33] shadow-sm transition hover:border-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            Ver catálogo completo
            <ArrowRight size={17} className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
          </Link>
        </div>

        {query.isError ? (
          <div role="alert" className="flex flex-col items-start justify-between gap-5 rounded-[1.5rem] border border-amber-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertCircle size={21} />
              </span>
              <div>
                <p className="font-black text-[#001a33]">As turmas em destaque não puderam ser carregadas.</p>
                <p className="mt-1 text-sm font-medium text-slate-600">Você ainda pode consultar o catálogo técnico completo.</p>
              </div>
            </div>
            <Link to="/cursos-tecnicos" className="text-xs font-black uppercase tracking-wider text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">
              Abrir catálogo
            </Link>
          </div>
        ) : query.isLoading ? (
          <div role="status" className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
            <span className="sr-only">Carregando turmas técnicas em destaque</span>
            <div aria-hidden="true" className="grid min-h-[30rem] animate-pulse bg-white motion-reduce:animate-none lg:grid-cols-2">
              <div className="bg-slate-200" />
              <div className="space-y-5 p-8">
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="h-10 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-full rounded bg-slate-100" />
                <div className="h-4 w-5/6 rounded bg-slate-100" />
                <div className="mt-10 h-28 rounded-xl bg-slate-100" />
              </div>
            </div>
          </div>
        ) : (
          <div className={hasSingleClass ? 'grid' : classesGrid}>
            {classes.map((item) => (
              <TechnicalClassCard key={item.turma.id} item={item} featured={hasSingleClass} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default OpenTechnicalEnrollmentsSection;
