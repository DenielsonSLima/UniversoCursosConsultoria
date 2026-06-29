import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  Loader2,
  Printer,
  Search,
  Users,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import {
  getDefaultIrpfCalendarYear,
  getIrpfCalendarYearOptions,
} from '../../../../lib/irpfYearUtils';
import { secretariaDocumentosKeys } from './secretaria-documentos.keys';
import {
  getSecretariaContext,
  secretariaDocumentosService,
} from './secretaria-documentos.service';
import {
  SecretariaAlunoResumo,
  SecretariaDocumentoDefinition,
} from './secretaria-documentos.types';
import SecretariaAcademicDocumentPreview from './SecretariaAcademicDocumentPreview';
import CrachaPreview from '../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { crachaService } from '../../cadastros/modelos-documentos/cracha/cracha.service';

interface SecretariaDocumentoEmissionPageProps {
  definition: SecretariaDocumentoDefinition;
}

const SecretariaDocumentoEmissionPage: React.FC<SecretariaDocumentoEmissionPageProps> = ({ definition }) => {
  const queryClient = useQueryClient();
  const activeUserId = window.sessionStorage.getItem('logged_user_id');
  const activePoloId =
    window.sessionStorage.getItem('current_polo_id') ||
    window.sessionStorage.getItem('active_polo_id');
  const context = useMemo(
    () => getSecretariaContext(),
    [activeUserId, activePoloId]
  );
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaAlunoResumo | null>(null);
  const [selectedMatriculaId, setSelectedMatriculaId] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedReferenceYear, setSelectedReferenceYear] = useState(() => getDefaultIrpfCalendarYear());
  const [crachaPrintLayout, setCrachaPrintLayout] = useState<'dobra' | 'duplex'>('dobra');
  const [isCrachaPrinting, setIsCrachaPrinting] = useState(false);
  const printContentRef = useRef<HTMLDivElement>(null);

  const isIrpfAnnual = definition.referenceMode === 'irpf_annual';
  const isCrachaEstagio = definition.id === 'cracha_estagio';
  const activeEnrollmentOnly = !!(definition.activeOnly || definition.activeEnrollmentOnly);
  const activeTurmaOnly = !!(definition.activeOnly || definition.activeTurmaOnly);
  const enrollmentStatuses = definition.enrollmentStatuses || [];
  const irpfYearOptions = useMemo(
    () => getIrpfCalendarYearOptions(undefined, new Date(), 10),
    []
  );
  const selectedIrpfYear = irpfYearOptions.find((option) => option.year === selectedReferenceYear);

  const normalizedTerm = searchTerm.trim();
  const { data: alunos = [], isFetching: isSearching } = useQuery({
    queryKey: secretariaDocumentosKeys.search(context, definition.id, normalizedTerm),
    queryFn: () => secretariaDocumentosService.searchAlunos(context.poloId, normalizedTerm),
    enabled: mode === 'individual' && normalizedTerm.length >= 2,
    staleTime: 30_000,
  });

  const { data: matriculas = [], isLoading: isLoadingMatriculas } = useQuery({
    queryKey: secretariaDocumentosKeys.matriculas(
      context,
      definition.id,
      selectedAluno?.id || 'nenhum',
      activeEnrollmentOnly,
      activeTurmaOnly,
      definition.completedOnly,
      enrollmentStatuses
    ),
    queryFn: () =>
      secretariaDocumentosService.getMatriculas(
        selectedAluno!.id,
        context.poloId,
        !!definition.technicalOnly,
        !!definition.completedOnly,
        activeEnrollmentOnly,
        activeTurmaOnly,
        enrollmentStatuses
      ),
    enabled: !!selectedAluno,
    staleTime: 60_000,
  });

  const { data: turmas = [], isLoading: isLoadingTurmas } = useQuery({
    queryKey: secretariaDocumentosKeys.turmas(
      context,
      definition.id,
      !!definition.technicalOnly,
      activeTurmaOnly
    ),
    queryFn: () =>
      secretariaDocumentosService.getTurmas(
        context.poloId,
        !!definition.technicalOnly,
        activeTurmaOnly
      ),
    enabled: mode === 'lote',
    staleTime: 60_000,
  });

  const { data: crachaTemplate } = useQuery({
    queryKey: ['secretaria-cracha-template'],
    queryFn: () => crachaService.getTemplate(),
    enabled: isCrachaEstagio,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (matriculas.length && !selectedMatriculaId) setSelectedMatriculaId(matriculas[0].id);
  }, [matriculas, selectedMatriculaId]);

  useEffect(() => {
    if (turmas.length && !selectedTurmaId) setSelectedTurmaId(turmas[0].id);
  }, [turmas, selectedTurmaId]);

  useEffect(() => {
    const channel = supabase
      .channel(`secretaria_emissoes_${context.userId}_${context.poloId}_${definition.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'secretaria_emissoes',
          filter: `polo_id=eq.${context.poloId}`,
        },
        () => queryClient.invalidateQueries({
          queryKey: secretariaDocumentosKeys.emissions(context, definition.id),
        })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [context, definition.id, queryClient]);

  const emissionMutation = useMutation({
    mutationFn: () =>
      secretariaDocumentosService.registrarEmissao({
        context,
        documento: definition.id,
        modo: mode,
        alunoId: mode === 'individual' ? selectedAluno?.id : undefined,
        matriculaId: mode === 'individual' ? selectedMatriculaId : undefined,
        turmaId: mode === 'lote' ? selectedTurmaId : undefined,
        technicalOnly: !!definition.technicalOnly,
        activeEnrollmentOnly,
        activeTurmaOnly,
        completedOnly: !!definition.completedOnly,
        enrollmentStatuses,
        referencePeriod: isIrpfAnnual ? String(selectedReferenceYear) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: secretariaDocumentosKeys.emissions(context, definition.id),
      });
      setStep(3);
    },
  });

  const selectedMatricula = matriculas.find((item) => item.id === selectedMatriculaId);
  const selectedTurma = turmas.find((item) => item.id === selectedTurmaId);
  const canContinue =
    mode === 'individual'
      ? !!selectedAluno && !!selectedMatriculaId && (!isIrpfAnnual || !!selectedIrpfYear?.released)
      : !!selectedTurmaId;

  const resetFlow = (nextMode = mode) => {
    setMode(nextMode);
    setStep(1);
    setSearchTerm('');
    setSelectedAluno(null);
    setSelectedMatriculaId('');
    setSelectedTurmaId('');
    setSelectedReferenceYear(getDefaultIrpfCalendarYear());
  };

  const crachaPrintItems = ((emissionMutation.data as any)?.items || []) as any[];
  const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  };

  const renderCrachaEmptySlot = () => (
    <div className="w-[54mm] h-[85.6mm] border-2 border-dashed border-slate-150 rounded-[2.5mm] bg-slate-50/50 text-[8px] text-slate-300 font-black uppercase tracking-widest flex items-center justify-center print:hidden">
      Espaço vazio
    </div>
  );

  const renderCrachaDobraPages = () => {
    const lotes = chunkArray(crachaPrintItems, 5);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 5) slots.push(null as any);

      return (
        <div key={`cracha-dobra-${loteIndex}`} className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="cracha-fold-grid grid grid-cols-5 gap-x-[1.5mm] justify-items-center items-start">
            {slots.map((aluno, index) => (
              <div key={`cracha-dobra-slot-${index}`} className="w-[54mm] h-[171.2mm] flex flex-col rounded-[2.5mm] overflow-hidden border border-slate-250 bg-white">
                {aluno ? (
                  <>
                    <div className="w-[54mm] h-[85.6mm] relative border-b border-dashed border-slate-300">
                      <CrachaPreview formData={crachaTemplate || {}} page="frente" zoomLevel={100} aluno={aluno} />
                    </div>
                    <div className="w-[54mm] h-[85.6mm] relative">
                      <CrachaPreview formData={crachaTemplate || {}} page="verso" zoomLevel={100} aluno={aluno} />
                    </div>
                  </>
                ) : renderCrachaEmptySlot()}
              </div>
            ))}
          </div>
          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Crachás de Estágio #{loteIndex + 1} — 5 conjuntos frente + verso</span>
            <span>A4 paisagem</span>
          </div>
        </div>
      );
    });
  };

  const renderCrachaDuplexPages = () => {
    const lotes = chunkArray(crachaPrintItems, 10);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 10) slots.push(null as any);
      const versoSlots = slots
        .slice(0, 5).reverse()
        .concat(slots.slice(5, 10).reverse());

      return (
        <React.Fragment key={`cracha-duplex-${loteIndex}`}>
          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {slots.map((aluno, index) => (
                <div key={`cracha-frente-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={crachaTemplate || {}} page="frente" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — frentes</span>
              <span>10 por página</span>
            </div>
          </div>

          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {versoSlots.map((aluno, index) => (
                <div key={`cracha-verso-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={crachaTemplate || {}} page="verso" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — versos espelhados</span>
              <span>Virar no lado curto para duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  if (isCrachaPrinting) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[9999] overflow-y-auto custom-scrollbar flex flex-col" id="cracha-print-layout">
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCrachaPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Impressão A4 do Crachá</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {crachaPrintLayout === 'dobra' ? '5 conjuntos frente + verso por folha' : '10 por página frente e verso'}
              </p>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-rose-900/30"
          >
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div className="bg-rose-950/70 border border-rose-800 p-4 rounded-2xl max-w-[297mm] w-full text-white mb-8 flex items-center gap-3 print:hidden">
            <Printer size={20} className="text-rose-300" />
            <p className="text-[10px] text-rose-100 leading-normal font-medium">
              Use papel A4 em paisagem. Para o modo 10 por página, imprima frente e verso virando no lado curto.
            </p>
          </div>

          <div ref={printContentRef} className="print-content flex flex-col items-center">
            {crachaPrintLayout === 'dobra' ? renderCrachaDobraPages() : renderCrachaDuplexPages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            #cracha-print-layout, #cracha-print-layout * {
              visibility: visible;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #cracha-print-layout {
              position: absolute;
              left: 0;
              top: 0;
              width: 297mm !important;
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
            }
            .cracha-print-page {
              width: 297mm !important;
              height: 210mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 8mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .cracha-card-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              grid-template-rows: repeat(2, 85.6mm) !important;
              column-gap: 1.5mm !important;
              row-gap: 3mm !important;
              justify-content: center !important;
              align-content: center !important;
            }
            .cracha-fold-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              column-gap: 1.5mm !important;
              justify-content: center !important;
              align-content: start !important;
            }
            .cracha-print-page img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @page { size: A4 landscape; margin: 0; }
        `}} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className={`grid gap-2 ${definition.allowBatch !== false ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
          <button
            onClick={() => resetFlow('individual')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'individual' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Search size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Individual</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">Localize um aluno e confira a matrícula.</p>
            </div>
          </button>
          {definition.allowBatch !== false && (
            <button
              onClick={() => resetFlow('lote')}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'lote' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
            >
              <Users size={20} />
              <div>
                <p className="text-xs font-black uppercase tracking-wider">Em lote</p>
                <p className="mt-0.5 text-[11px] font-medium leading-snug">Prepare a emissão para uma turma.</p>
              </div>
            </button>
          )}
          </div>
        </div>

      <div className="border-t border-slate-100">
        <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/70">
          {['Selecionar', 'Conferir', 'Concluído'].map((label, index) => {
            const itemStep = (index + 1) as 1 | 2 | 3;
            return (
              <div key={label} className={`px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest ${step >= itemStep ? definition.accent : 'text-slate-350'}`}>
                {index + 1}. {label}
              </div>
            );
          })}
        </div>

        <div className="p-6 md:p-9 min-h-[390px]">
          {step === 1 && mode === 'individual' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Localizar aluno</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">Pesquise dentro da unidade ativa por nome ou CPF.</p>

              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSelectedAluno(null);
                    setSelectedMatriculaId('');
                  }}
                  placeholder="Digite pelo menos 2 caracteres..."
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-medium"
                />
              </div>

              {normalizedTerm.length >= 2 && !selectedAluno && (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {isSearching ? (
                    <div className="py-8 flex justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
                  ) : alunos.length ? (
                    alunos.map((aluno) => (
                      <button
                        key={aluno.id}
                        onClick={() => setSelectedAluno(aluno)}
                        className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 text-left flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="font-black text-sm text-[#001a33]">{aluno.nome}</p>
                          <p className="text-xs text-slate-500 mt-0.5">CPF: {aluno.cpf || 'Não informado'}</p>
                        </div>
                        <ChevronRight size={17} className="text-slate-350" />
                      </button>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-400">Nenhum aluno encontrado nesta unidade.</p>
                  )}
                </div>
              )}

              {selectedAluno && (
                <div className="mt-5">
                  <div className={`p-4 rounded-2xl ${definition.softAccent} border border-slate-100`}>
                    <p className="font-black text-[#001a33]">{selectedAluno.nome}</p>
                    <p className="text-xs text-slate-500 mt-1">{selectedAluno.cpf || 'CPF não informado'}</p>
                  </div>

                  <label className="block mt-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Matrícula / turma</label>
                  {isLoadingMatriculas ? (
                    <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
                  ) : (
                    <select
                      value={selectedMatriculaId}
                      onChange={(event) => setSelectedMatriculaId(event.target.value)}
                      className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                    >
                      {!matriculas.length && <option value="">Nenhuma matrícula compatível</option>}
                      {matriculas.map((matricula) => (
                        <option key={matricula.id} value={matricula.id}>
                          {matricula.cursoNome} — {matricula.turmaNome} ({matricula.status})
                        </option>
                      ))}
                    </select>
                  )}

                  {isIrpfAnnual && (
                    <div className="mt-5">
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">Ano-calendário</label>
                      <select
                        value={selectedReferenceYear}
                        onChange={(event) => setSelectedReferenceYear(Number(event.target.value))}
                        className="w-full mt-2 p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-sm font-bold text-slate-700"
                      >
                        {irpfYearOptions.map((option) => (
                          <option key={option.year} value={option.year} disabled={!option.released}>
                            {option.year} {option.released ? '' : `(libera em ${option.releaseLabel})`}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-[11px] font-semibold text-slate-500">
                        O registro fica separado pelo ano de referência e pode ser localizado no histórico mesmo depois do encerramento da turma.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 1 && mode === 'lote' && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Selecionar turma</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">
                A emissão será preparada conforme a regra acadêmica deste documento.
              </p>
              {isLoadingTurmas ? (
                <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
              ) : (
                <div className="space-y-3">
                  {turmas.map((turma) => (
                    <button
                      key={turma.id}
                      onClick={() => setSelectedTurmaId(turma.id)}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${selectedTurmaId === turma.id ? `${definition.softAccent} border-current ${definition.accent}` : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    >
                      <div>
                        <p className="font-black text-sm text-[#001a33]">{turma.cursoNome}</p>
                        <p className="text-xs text-slate-500 mt-1">{turma.nome} · {turma.turno}</p>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider">{turma.totalAlunos} alunos</span>
                    </button>
                  ))}
                  {!turmas.length && <p className="py-12 text-center text-sm text-slate-400">Nenhuma turma compatível na unidade ativa.</p>}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase">Conferência da emissão</h4>
              <p className="text-sm text-slate-500 mt-1 mb-6">Os dados acadêmicos serão consolidados pelo serviço de emissão.</p>
              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Documento</span>
                  <span className="text-sm font-black text-[#001a33] text-right">{definition.singularLabel}</span>
                </div>
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">Modo</span>
                  <span className="text-sm font-black text-[#001a33]">{mode === 'individual' ? 'Individual' : 'Lote por turma'}</span>
                </div>
                <div className="p-4 flex justify-between gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase">{mode === 'individual' ? 'Aluno' : 'Turma'}</span>
                  <span className="text-sm font-black text-[#001a33] text-right">
                    {mode === 'individual'
                      ? `${selectedAluno?.nome} · ${selectedMatricula?.cursoNome || ''}`
                      : `${selectedTurma?.cursoNome || ''} · ${selectedTurma?.nome || ''}`}
                  </span>
                </div>
                {isIrpfAnnual && (
                  <div className="p-4 flex justify-between gap-4">
                    <span className="text-xs font-bold text-slate-400 uppercase">Ano-calendário</span>
                    <span className="text-sm font-black text-[#001a33]">{selectedReferenceYear}</span>
                  </div>
                )}
              </div>
              {isCrachaEstagio && (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCrachaPrintLayout('dobra')}
                    className={`rounded-2xl border p-4 text-left transition-all ${crachaPrintLayout === 'dobra' ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    <input type="radio" checked={crachaPrintLayout === 'dobra'} readOnly className="accent-rose-600" />
                    <span className="ml-2 text-xs font-black uppercase tracking-wider">5 por folha</span>
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">
                      Frente e verso juntos na mesma folha para corte/dobra manual.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrachaPrintLayout('duplex')}
                    className={`rounded-2xl border p-4 text-left transition-all ${crachaPrintLayout === 'duplex' ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                  >
                    <input type="radio" checked={crachaPrintLayout === 'duplex'} readOnly className="accent-rose-600" />
                    <span className="ml-2 text-xs font-black uppercase tracking-wider">10 por página</span>
                    <p className="mt-2 text-[11px] font-semibold leading-snug text-slate-500">
                      Uma página com frentes e outra com versos espelhados para impressão duplex.
                    </p>
                  </button>
                </div>
              )}
              {emissionMutation.isError && (
                <p className="mt-4 text-sm font-bold text-red-600">Não foi possível preparar a emissão. Verifique a conexão e tente novamente.</p>
              )}
              {mode === 'individual' && selectedMatriculaId && definition.academicPreview && (
                <div className="mt-6">
                  <SecretariaAcademicDocumentPreview
                    matriculaId={selectedMatriculaId}
                    type={definition.academicPreview}
                  />
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="py-10 text-center">
              <div className={`w-20 h-20 rounded-full ${definition.softAccent} ${definition.accent} flex items-center justify-center mx-auto`}>
                <CheckCircle2 size={38} />
              </div>
              <h4 className="text-2xl font-black text-[#001a33] mt-6">Emissão preparada</h4>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                A solicitação foi registrada para esta unidade e já pode seguir para a composição do documento.
              </p>
              {!!emissionMutation.data?.codes?.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    {emissionMutation.data.codes.length === 1 ? 'Código de validação' : 'Códigos de validação'}
                  </p>
                  <div className="max-h-36 overflow-y-auto space-y-2">
                    {emissionMutation.data.codes.map((code: string) => (
                      <code key={code} className="block px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-blue-700 select-all">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              )}
              {isCrachaEstagio && !!crachaPrintItems.length && (
                <div className="mt-6 max-w-xl mx-auto p-4 bg-rose-50 border border-rose-100 rounded-2xl text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Exportação do crachá</p>
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        Layout selecionado: {crachaPrintLayout === 'dobra' ? '5 por folha, frente e verso juntos' : '10 por página, frente e verso'}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCrachaPrinting(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700"
                    >
                      <Printer size={15} /> Imprimir / PDF
                    </button>
                  </div>
                </div>
              )}
              <button onClick={() => resetFlow(mode)} className="mt-7 px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-widest">
                Nova emissão
              </button>
            </div>
          )}
        </div>

        {step < 3 && (
          <div className="px-6 md:px-9 py-5 border-t border-slate-100 bg-slate-50/70 flex justify-between gap-3">
            <button
              onClick={() => step === 2 ? setStep(1) : resetFlow(mode)}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-black uppercase tracking-wider"
            >
              {step === 2 ? 'Voltar' : 'Limpar'}
            </button>
            <button
              disabled={!canContinue || emissionMutation.isPending}
              onClick={() => step === 1 ? setStep(2) : emissionMutation.mutate()}
              className="px-6 py-3 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-2"
            >
              {emissionMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : step === 1 ? <ChevronRight size={15} /> : <FileCheck2 size={15} />}
              {step === 1 ? 'Continuar' : definition.actionLabel}
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default SecretariaDocumentoEmissionPage;
