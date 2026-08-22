import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MonitorPlay,
  ShieldCheck,
} from 'lucide-react';
import {
  ONLINE_CLASS_MODALITIES,
  getCourseImageSrc,
  getCourseProgressPercent,
  getPoloLabel,
  hasEadAccess,
  hasLinkedLiveEnrollment,
  hasPendingEadPayment,
} from '../cursosPage.utils';
import { formatEadCheckoutMoney } from '../eadCheckoutOptions';

interface CourseCatalogGridProps {
  groupedCourses: [string, any[]][];
  coursePage: number;
  totalCoursePages: number;
  progressByCourseId: Map<string, any>;
  selectedTurmaByCourse: Record<string, string>;
  checkoutMutation: any;
  onSelectTurma: (courseId: string, turmaId: string) => void;
  onSelectCourse: (course: any) => void;
  onOpenEadCheckout: (course: any) => void;
  onOpenOnlineCheckout: (course: any, turma: any) => void;
  onOpenEnrollment?: (courseId: string, turmaId: string) => void;
  onPageChange: React.Dispatch<React.SetStateAction<number>>;
}

const COURSE_PAGE_SIZE = 9;

const CourseCatalogGrid: React.FC<CourseCatalogGridProps> = ({
  groupedCourses,
  coursePage,
  totalCoursePages,
  progressByCourseId,
  selectedTurmaByCourse,
  checkoutMutation,
  onSelectTurma,
  onSelectCourse,
  onOpenEadCheckout,
  onOpenOnlineCheckout,
  onOpenEnrollment,
  onPageChange,
}) => (
  <div className="space-y-6">
    {groupedCourses.map(([category, categoryCourses]) => (
      <section key={category} className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-[#001a33]">{category}</h3>
          <span className="h-px flex-1 bg-slate-100" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{categoryCourses.length}</span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categoryCourses.map((course, index) => {
            const globalIndex = (coursePage - 1) * COURSE_PAGE_SIZE + index;
            const eadConfig = course.ead_config || {};
            const modality = String(course.modalidade || '').toUpperCase();
            const isEad = modality === 'EAD';
            const isLive = modality === 'LIVRE';
            const isOnlineClassModality = ONLINE_CLASS_MODALITIES.has(modality);
            const canAccess = isEad && hasEadAccess(course);
            const pendingPayment = isEad && hasPendingEadPayment(course);
            const onlineAvailability = course.onlineAvailability;
            const onlineClassAvailable = Boolean(onlineAvailability?.isAvailable);
            const availableTurmas = onlineAvailability?.availableTurmas || [];
            const selectedTurmaId = selectedTurmaByCourse[course.id]
              || onlineAvailability?.turma?.id
              || availableTurmas[0]?.id
              || null;
            const selectedTurma = availableTurmas.find((turma: any) => turma.id === selectedTurmaId)
              || onlineAvailability?.turma
              || null;
            const courseProgress = progressByCourseId.get(course.id);
            const courseProgressPercent = getCourseProgressPercent(courseProgress, course.alunoMatricula?.status);
            const showCourseProgress = Boolean(course.alunoMatricula);
            const enrolledLiveTurmaId = isLive && hasLinkedLiveEnrollment(course)
              ? String(course.alunoMatricula.turmaId)
              : '';
            const isCheckoutLoading = checkoutMutation.isPending
              && checkoutMutation.variables?.course?.id === course.id;

            return (
              <div
                key={course.id}
                className="bg-white rounded-[2rem] border border-slate-100 hover:border-blue-500 shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="h-36 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
                    {course.imagem_url ? (
                      <img
                        src={getCourseImageSrc(course.imagem_url)}
                        alt={course.nome}
                        loading={globalIndex < 3 ? 'eager' : 'lazy'}
                        fetchPriority={globalIndex < 3 ? 'high' : 'auto'}
                        decoding="async"
                        width={1200}
                        height={675}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <MonitorPlay className="text-blue-300" size={34} />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                        {course.area || 'Saúde'}
                      </span>
                      {isEad && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <ShieldCheck size={11} /> Guiado
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#001a33] leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {course.nome}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium line-clamp-3 mt-2 leading-relaxed">
                      {eadConfig.pagina?.subtitulo || course.descricao || 'Curso com trilha de aprendizagem, atividades e certificado.'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4 space-y-4">
                  {isEad && (
                    <div className="flex items-end justify-between gap-3 rounded-2xl bg-emerald-50/70 px-3 py-2.5">
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
                        Valor do curso
                      </span>
                      <strong className="text-base font-black text-[#001a33]">
                        {formatEadCheckoutMoney(Number(course.valor) || 0)}
                      </strong>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                      <Clock size={14} />
                      <span>{course.carga_horaria || 80}h</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                      <BookOpen size={14} />
                      <span>{eadConfig.conteudos?.length || 0} etapas</span>
                    </div>
                  </div>

                  {showCourseProgress && (
                    <div className="rounded-2xl border border-blue-50 bg-blue-50/35 p-3">
                      <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-400">Progresso</span>
                        <span className="text-blue-600">{courseProgressPercent}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${courseProgressPercent}%` }} />
                      </div>
                    </div>
                  )}

                  {isOnlineClassModality && onlineClassAvailable && selectedTurma && (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
                      <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                        <MapPin size={12} />
                        Polo da turma
                      </p>
                      <p className="mt-1 text-xs font-black text-[#001a33]">{getPoloLabel(selectedTurma)}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-slate-500">{selectedTurma.nome || 'Turma aberta'}</p>
                      {availableTurmas.length > 1 && (
                        <select
                          value={selectedTurmaId || ''}
                          onChange={(event) => onSelectTurma(course.id, event.target.value)}
                          className="mt-3 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-emerald-400"
                        >
                          {availableTurmas.map((turma: any) => (
                            <option key={turma.id} value={turma.id}>
                              {turma.nome || 'Turma aberta'} - {getPoloLabel(turma)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {isEad ? (
                    canAccess ? (
                      <button
                        onClick={() => onSelectCourse(course)}
                        className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-3 transition-all"
                      >
                        <MonitorPlay size={14} />
                        Acessar curso
                      </button>
                    ) : (
                      <button
                        onClick={() => onOpenEadCheckout(course)}
                        disabled={isCheckoutLoading}
                        className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl py-3 transition-all"
                      >
                        {isCheckoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        {isCheckoutLoading ? 'Preparando pagamento' : pendingPayment ? 'Continuar pagamento' : 'Comprar curso'}
                      </button>
                    )
                  ) : enrolledLiveTurmaId ? (
                    onOpenEnrollment ? (
                      <button
                        type="button"
                        onClick={() => onOpenEnrollment(course.id, enrolledLiveTurmaId)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-blue-700"
                      >
                        <MonitorPlay size={14} />
                        {String(course.alunoMatricula?.status || '').toUpperCase() === 'PENDENTE' ? 'Acompanhar matrícula' : 'Abrir turma'}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-blue-700">
                        Matrícula já vinculada. Abra a turma em Meus Cursos.
                      </div>
                    )
                  ) : isOnlineClassModality ? (
                    onlineClassAvailable ? (
                      <button
                        onClick={() => onOpenOnlineCheckout(course, selectedTurma)}
                        disabled={isCheckoutLoading}
                        className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-xl py-3 transition-all"
                      >
                        {isCheckoutLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        {isCheckoutLoading ? 'Preparando pagamento' : 'Matricular e pagar'}
                      </button>
                    ) : (
                      <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3 text-[10px] font-bold leading-relaxed text-rose-700">
                        {onlineAvailability?.reason || 'Inscrições encerradas. Aguarde uma nova turma.'}
                      </div>
                    )
                  ) : (
                    <a
                      href="https://universocursos.com.br"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      <span>Matricular-se</span>
                      <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    ))}

    {totalCoursePages > 1 && (
      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Pagina {coursePage} de {totalCoursePages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page => Math.max(1, page - 1))}
            disabled={coursePage === 1}
            className="rounded-xl bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page => Math.min(totalCoursePages, page + 1))}
            disabled={coursePage === totalCoursePages}
            className="rounded-xl bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Proxima
          </button>
        </div>
      </div>
    )}
  </div>
);

export default CourseCatalogGrid;
