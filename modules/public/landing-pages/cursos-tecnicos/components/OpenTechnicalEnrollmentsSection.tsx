import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Clock3, GraduationCap, MapPin, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildTechnicalLandingPath } from '../technicalLanding.routes';
import { technicalLandingService } from '../technicalLanding.service';
import { technicalLandingKeys } from '../technicalLanding.keys';

const formatDate = (value?: string | null) => {
  if (!value) return 'A definir';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
};

const titleCase = (value: string) =>
  value.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (char) => char.toLocaleUpperCase('pt-BR'));

const OpenTechnicalEnrollmentsSection: React.FC = () => {
  const query = useQuery({
    queryKey: technicalLandingKeys.list(3),
    queryFn: () => technicalLandingService.listPublishedClasses(3),
    staleTime: 60_000,
  });

  if (!query.isLoading && !query.data?.length) return null;

  return (
    <section id="matriculas-tecnicas-abertas" className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-blue-50/30 to-slate-50 py-16 md:py-24">
      {/* Background ambient light effects */}
      <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-emerald-300/20 blur-3xl" />

      <div className="container relative mx-auto px-5 md:px-8">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-blue-700 shadow-sm backdrop-blur-md">
              <GraduationCap size={16} className="text-blue-600" />
              <span>Formação Profissional Técnica</span>
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-[#001a33] md:text-5xl">
              Turmas técnicas <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">em destaque</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-slate-600 md:text-base">
              Conheça as próximas turmas com qualificação técnica reconhecida e escolha a modalidade ideal para o seu futuro.
            </p>
          </div>
          <Link
            to="/cursos-tecnicos"
            className="group inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-xs font-black uppercase tracking-widest text-[#001a33] shadow-sm transition-all duration-300 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 hover:shadow-md"
          >
            <span>Ver catálogo completo</span>
            <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>

        {query.isLoading ? (
          <div className="grid gap-6 md:grid-cols-3" aria-label="Carregando turmas abertas">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-[26rem] animate-pulse rounded-[2.5rem] bg-white shadow-sm border border-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {(query.data || []).map((item) => {
              const onlineEnrollmentAvailable = item.turma.onlineEnrollmentAvailable;
              const hasSeatsInfo = item.turma.availableSeats > 0;

              return (
                <article
                  key={item.turma.id}
                  className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-slate-200/80 bg-white shadow-[0_12px_35px_-10px_rgba(0,26,51,0.07)] transition-all duration-300 hover:-translate-y-1.5 hover:border-blue-300/60 hover:shadow-[0_22px_55px_-12px_rgba(0,60,120,0.18)]"
                >
                  {/* Top Image Banner Header */}
                  <div className="relative h-44 overflow-hidden bg-[#001c3d]">
                    {item.course.imageUrl ? (
                      <img
                        src={item.course.imageUrl}
                        alt={item.course.name}
                        className="h-full w-full object-cover opacity-80 transition duration-700 ease-out group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-[#001a33] via-[#003366] to-blue-700 opacity-90" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001428] via-[#001428]/60 to-transparent" />

                    {/* Status Badge */}
                    <div className="absolute left-4 top-4 right-4 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-lg backdrop-blur-md ${
                          onlineEnrollmentAvailable
                            ? 'bg-emerald-500/90 text-white border border-emerald-400/30'
                            : 'bg-blue-900/80 text-blue-100 border border-white/15'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            onlineEnrollmentAvailable ? 'bg-white animate-pulse' : 'bg-blue-300'
                          }`}
                        />
                        {item.turma.availabilityLabel}
                      </span>

                      {hasSeatsInfo && onlineEnrollmentAvailable ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-950 shadow-md backdrop-blur-md">
                          <Sparkles size={11} /> {item.turma.availableSeats} vaga{item.turma.availableSeats > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </div>

                    {/* Course Title inside Banner overlay */}
                    <h3 className="absolute bottom-4 left-5 right-5 text-xl font-black text-white leading-tight transition-colors duration-300 group-hover:text-blue-200">
                      {item.course.name}
                    </h3>
                  </div>

                  {/* Body Info Grid */}
                  <div className="flex flex-1 flex-col justify-between p-6">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition-colors group-hover:border-blue-100/60 group-hover:bg-blue-50/30">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600">
                          <MapPin size={17} />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Polo</span>
                          <span className="block truncate text-xs font-black text-slate-800">{titleCase(item.polo.name)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition-colors group-hover:border-blue-100/60 group-hover:bg-blue-50/30">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600">
                          <Clock3 size={17} />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Turno</span>
                          <span className="block truncate text-xs font-black text-slate-800">{titleCase(item.turma.shift)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition-colors group-hover:border-blue-100/60 group-hover:bg-blue-50/30">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600">
                          <CalendarDays size={17} />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Início</span>
                          <span className="block truncate text-xs font-black text-slate-800">{formatDate(item.turma.startDate)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 transition-colors group-hover:border-blue-100/60 group-hover:bg-blue-50/30">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100/70 text-blue-600">
                          <Users size={17} />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Inscrição até</span>
                          <span className="block truncate text-xs font-black text-slate-800">{formatDate(item.turma.enrollmentEndDate)}</span>
                        </div>
                      </div>
                    </div>

                    {/* CTA Button */}
                    <Link
                      to={buildTechnicalLandingPath(item.course.name, item.turma.id)}
                      className={`mt-6 flex items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-xs font-black uppercase tracking-widest text-white shadow-md transition-all duration-300 ${
                        onlineEnrollmentAvailable
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-blue-600/30'
                          : 'bg-[#001a33] hover:bg-blue-900'
                      }`}
                    >
                      <span>{onlineEnrollmentAvailable ? 'Inscrever-se Online' : 'Ver Detalhes da Turma'}</span>
                      <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default OpenTechnicalEnrollmentsSection;
