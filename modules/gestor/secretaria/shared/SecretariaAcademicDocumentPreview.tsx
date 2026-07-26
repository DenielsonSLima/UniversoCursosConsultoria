import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import { sanitizedHtml } from '../../../../lib/htmlSanitizer';
import DocumentHeader from '../../components/DocumentHeader';
import { boletimService } from '../../cadastros/modelos-documentos/boletim/boletim.service';
import { atestadoConclusaoService } from '../../cadastros/modelos-documentos/atestado-conclusao/atestado-conclusao.service';
import { loadAcademicPreview } from '../historico-emissoes/academic-preview';
import type { EmissionLog } from '../historico-emissoes/historico-emissoes.types';

interface Props {
  matriculaId: string;
  type: 'boletim_tecnico' | 'atestado_conclusao_tecnico';
  moduleId?: string;
  moduleName?: string;
  onClose: () => void;
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Não informada';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

const SecretariaAcademicDocumentPreview: React.FC<Props> = ({
  matriculaId,
  type,
  moduleId,
  moduleName,
  onClose,
}) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['secretaria', 'academic-document-preview', type, matriculaId, moduleId || 'todos'],
    queryFn: async () => {
      const metadataPromise = supabase
        .from('matriculas')
        .select(`
          id, aluno_id, turma_id, status, data_matricula,
          parceiros!inner(nome, cpf_cnpj, rg),
          turmas!inner(
            nome, codigo, data_previsao_termino, polo_id,
            cursos!inner(id, nome, carga_horaria, modalidade),
            polos!inner(*)
          )
        `)
        .eq('id', matriculaId)
        .single();
      const documentType = type === 'boletim_tecnico'
        ? 'boletim'
        : 'atestado_conclusao_tecnico';
      const previewPromise = loadAcademicPreview({
        matricula_id: matriculaId,
        documento: documentType,
        periodo_referencia: type === 'boletim_tecnico' ? moduleId || null : null,
      } as EmissionLog);
      const templatePromise = type === 'boletim_tecnico'
        ? boletimService.getTemplate('TECNICO')
        : atestadoConclusaoService.getTemplate('TECNICO');

      const [{ data: matricula, error: matriculaError }, academic, template] = await Promise.all([
        metadataPromise,
        previewPromise,
        templatePromise,
      ]);
      if (matriculaError) throw matriculaError;

      return {
        matricula,
        aluno: matricula.parceiros as any,
        turma: matricula.turmas as any,
        polo: (matricula.turmas as any).polos,
        academic,
        template,
      };
    },
    staleTime: 30_000,
  });

  let parsedText = '';
  if (data) {
    const modules = data.academic.moduleNames.join(', ') || moduleName || 'Sem módulo selecionado';
    const replacements: Record<string, string> = {
      '{{ALUNO_NOME}}': data.aluno.nome,
      '{{ALUNO_CPF}}': data.aluno.cpf_cnpj || 'Não informado',
      '{{ALUNO_RG}}': data.aluno.rg || 'Não informado',
      '{{ALUNO_MATRICULA}}': formatMatricula(
        data.matricula.id,
        data.matricula.data_matricula,
        data.turma.polo_id
      ),
      '{{CURSO_NOME}}': data.turma.cursos.nome,
      '{{TURMA_NOME}}': data.turma.nome,
      '{{POLO_NOME}}': data.polo.nome,
      '{{CIDADE_POLO}}': `${data.polo.cidade}/${data.polo.estado}`,
      '{{DATA_ATUAL}}': new Date().toLocaleDateString('pt-BR'),
      '{{DATA_CONCLUSAO}}': formatDate(data.academic.fimCurso || data.turma.data_previsao_termino),
      '{{CARGA_HORARIA_TOTAL}}': String(data.academic.cargaHorariaTotal),
      '{{MODULO_PERIODO}}': modules,
      '{{ANO_LETIVO}}': String(new Date().getFullYear()),
      '{{TABELA_BOLETIM_TECNICO}}': data.academic.componentesTable,
      '{{MEDIA_GERAL}}': data.academic.mediaGeral === null
        ? '—'
        : data.academic.mediaGeral.toFixed(1),
      '{{FREQUENCIA_GERAL}}': data.academic.frequenciaGeral === null
        ? '—'
        : `${data.academic.frequenciaGeral.toFixed(0)}%`,
      '{{SITUACAO_ACADEMICA}}': data.academic.situacaoAcademica,
    };

    parsedText = data.template.textContent;
    Object.entries(replacements).forEach(([token, value]) => {
      parsedText = parsedText.replaceAll(token, value);
    });
  }

  return createPortal(
    <div
      id="academic-preview-modal"
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen animate-fadeIn flex-col overflow-hidden bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="Prévia do documento acadêmico"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
          <h4 className="text-sm font-black uppercase tracking-wide text-white">
            Prévia do {type === 'boletim_tecnico' ? 'boletim escolar' : 'atestado de conclusão'}
          </h4>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">
            {moduleName || 'Documento acadêmico oficial'}
          </p>
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={isLoading || isError}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            <Printer size={13} /> Imprimir
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-slate-900 p-3 custom-scrollbar sm:p-6">
        {isLoading && (
          <div className="flex min-h-[297mm] w-[210mm] max-w-full flex-col items-center justify-center bg-white text-slate-400">
            <Loader2 className="mb-4 animate-spin text-blue-600" size={34} />
            <span className="text-[10px] font-black uppercase tracking-widest">Montando prévia oficial...</span>
          </div>
        )}
        {isError && (
          <div className="flex min-h-72 w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-2xl">
            <h5 className="text-sm font-black uppercase tracking-widest text-[#001a33]">Prévia indisponível</h5>
            <p className="mt-3 text-xs font-bold leading-relaxed text-rose-600">
              {error instanceof Error ? error.message : 'Não foi possível montar a prévia acadêmica.'}
            </p>
          </div>
        )}
        {data && !isLoading && !isError && (
          <div className="print-page relative mx-auto min-h-[297mm] w-[210mm] max-w-full overflow-hidden border border-slate-200 bg-white p-[15mm] text-black shadow-2xl box-border" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            {data.polo?.watermark_url && (
              <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                <img
                  src={data.polo.watermark_url}
                  alt=""
                  style={{
                    opacity: data.polo.watermark_opacity ?? 0.1,
                    width: `${data.polo.watermark_scale ?? 50}%`,
                    transform: data.polo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none',
                  }}
                />
              </div>
            )}
            <DocumentHeader polo={data.polo} orientation="portrait" />
            <h2 className="relative z-10 my-8 text-center text-2xl font-bold uppercase text-[#001a33] underline underline-offset-8">
              {type === 'boletim_tecnico' ? 'Boletim Escolar — Cursos Técnicos' : 'Atestado de Conclusão'}
            </h2>
            <div
              className="relative z-10 text-justify text-base leading-loose text-black"
              dangerouslySetInnerHTML={sanitizedHtml(parsedText)}
            />
          </div>
        )}
      </div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #academic-preview-modal, #academic-preview-modal * {
            visibility: visible;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #academic-preview-modal {
            position: absolute;
            inset: 0;
            width: 210mm !important;
            height: auto !important;
            background: white !important;
          }
          #academic-preview-modal > header { display: none !important; }
          #academic-preview-modal .print-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </div>,
    document.body
  );
};

export default SecretariaAcademicDocumentPreview;
