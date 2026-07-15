import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Clock3, GraduationCap, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildTechnicalLandingPath } from '../technicalLanding.routes';
import { technicalLandingService } from '../technicalLanding.service';

const formatDate = (value?: string | null) => {
  if (!value) return 'A definir';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
};

const titleCase = (value: string) => value.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (char) => char.toLocaleUpperCase('pt-BR'));

const OpenTechnicalEnrollmentsSection: React.FC = () => {
  const query = useQuery({
    queryKey: ['public-open-technical-classes', 3],
    queryFn: () => technicalLandingService.listOpenClasses(3),
    staleTime: 60_000,
  });

  if (!query.isLoading && !query.data?.length) return null;

  return (
    <section id="matriculas-tecnicas-abertas" className="relative overflow-hidden bg-[#f4f8fc] py-16 md:py-20">
      <div className="pointer-events-none absolute -left-20 top-12 h-64 w-64 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />

      <div className="container relative mx-auto px-5 md:px-6">
        <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 shadow-sm">
              <GraduationCap size={15} /> Formação profissional
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-[#001a33] md:text-5xl">
              Matrículas técnicas <span className="text-blue-600">abertas</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm font-semibold leading-relaxed text-slate-600 md:text-base">
              Escolha uma turma, confira datas e documentos e continue a matrícula online sem perder sua seleção.
            </p>
          </div>
          <Link
            to="/cursos-tecnicos"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-[11px] font-black uppercase tracking-widest text-[#001a33] shadow-sm transition hover:border-blue-200 hover:text-blue-600"
          >
            Ver catálogo <ArrowRight size={15} />
          </Link>
        </div>

        {query.isLoading ? (
          <div className="grid gap-5 md:grid-cols-3" aria-label="Carregando turmas abertas">
            {[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-[2rem] bg-white shadow-sm" />)}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(query.data || []).map((item) => {
              const soldOut = item.turma.totalSeats > 0 && item.turma.availableSeats <= 0;
              return (
                <article key={item.turma.id} className="group flex min-h-[21rem] flex-col overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_18px_50px_rgba(15,45,80,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(15,45,80,0.14)]">
                  <div className="relative h-36 overflow-hidden bg-[#002b5c]">
                    {item.course.imageUrl ? (
                      <img src={item.course.imageUrl} alt="" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105" loading="lazy" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001a33] via-[#001a33]/25 to-transparent" />
                    <span className={`absolute right-4 top-4 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest ${soldOut ? 'bg-amber-100 text-amber-800' : 'bg-emerald-400 text-emerald-950'}`}>
                      {item.turma.availabilityLabel}
                    </span>
                    <p className="absolute bottom-4 left-5 right-5 text-lg font-black text-white">{item.course.name}</p>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4 text-xs">
                      <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-blue-600" /><span><b className="block text-[9px] uppercase tracking-wider text-slate-400">Polo</b>{titleCase(item.polo.name)}</span></div>
                      <div className="flex items-start gap-2"><Clock3 size={15} className="mt-0.5 shrink-0 text-blue-600" /><span><b className="block text-[9px] uppercase tracking-wider text-slate-400">Turno</b>{titleCase(item.turma.shift)}</span></div>
                      <div className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-blue-600" /><span><b className="block text-[9px] uppercase tracking-wider text-slate-400">Início</b>{formatDate(item.turma.startDate)}</span></div>
                      <div className="flex items-start gap-2"><Users size={15} className="mt-0.5 shrink-0 text-blue-600" /><span><b className="block text-[9px] uppercase tracking-wider text-slate-400">Inscrições até</b>{formatDate(item.turma.enrollmentEndDate)}</span></div>
                    </div>

                    <Link
                      to={buildTechnicalLandingPath(item.course.name, item.turma.id)}
                      className={`mt-6 flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[10px] font-black uppercase tracking-widest transition ${soldOut ? 'pointer-events-none bg-slate-100 text-slate-400' : 'bg-[#001a33] text-white hover:bg-blue-700'}`}
                      aria-disabled={soldOut}
                    >
                      {soldOut ? 'Turma lotada' : 'Ver turma e inscrever-se'} <ArrowRight size={15} />
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
