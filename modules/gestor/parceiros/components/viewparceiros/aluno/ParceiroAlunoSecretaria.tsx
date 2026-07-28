import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, FileText, ScrollText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import { secretariaService, type Solicitacao } from '../../../../secretaria/secretaria.service';
import { alunoSecretariaService } from '../../../../../aluno/secretaria/secretaria-aluno.service';
import { declaracaoService } from '../../../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { irpfService } from '../../../../cadastros/modelos-documentos/irpf/irpf.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { academicosService } from '../../../../configuracoes/academicos/academicos.service';
import {
  useDocumentValidationCode,
  useDocumentValidationReissue,
} from '../../../../../shared/document-validation/use-document-validation-code';
import { formatIrpfReleaseDate, getDefaultIrpfCalendarYear, getIrpfCalendarYearOptions, isIrpfYearReleased } from '../../../../../../lib/irpfYearUtils';
import AcademicResultsModal from '../../../../../shared/secretaria/AcademicResultsModal';
import TemplateDocumentModal from '../../../../../shared/secretaria/TemplateDocumentModal';
import { secretariaAcademicResultsService } from '../../../../../shared/secretaria/academic-results.service';
import { buildDocumentVariableReplacer, buildFallbackValidationCode, buildValidationUrl } from '../../../../../shared/secretaria/document-template.helpers';
import { waitForQrCodeAssets } from '../../../../../shared/qrcode/qr-code-assets';
import ParceiroSolicitacoesPanel from './ParceiroSolicitacoesPanel';

interface ParceiroAlunoSecretariaProps { alunoId: string }

const printStyles = `@media print {
  body * { visibility:hidden; }
  #print-area, #print-area *, #print-area-irpf, #print-area-irpf * { visibility:visible; }
  #print-area, #print-area-irpf { position:absolute;left:0;top:0;width:794px!important;height:1123px!important;padding:60px 80px!important;box-shadow:none!important;border:none!important;background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact; }
}`;

const ParceiroAlunoSecretaria: React.FC<ParceiroAlunoSecretariaProps> = ({ alunoId }) => {
  const [requests, setRequests] = useState<Solicitacao[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<Solicitacao | null>(null);
  const [action, setAction] = useState<'deferir' | 'indeferir' | null>(null);
  const [justification, setJustification] = useState('');
  const [documentResponse, setDocumentResponse] = useState('');
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const [irpfOpen, setIrpfOpen] = useState(false);
  const [selectedIrpfYear, setSelectedIrpfYear] = useState(getDefaultIrpfCalendarYear);

  const { data: aluno, isLoading: loadingAluno } = useQuery({
    queryKey: ['secretaria-aluno-profile', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase.from('parceiros').select('*').eq('id', alunoId).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-matriculas', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase.from('matriculas').select('*, turmas(*, cursos(*), polos(nome))').eq('aluno_id', alunoId);
      if (error) throw error;
      return data || [];
    },
  });
  const activeEnrollment = enrollments.find((item) => item.status?.toUpperCase() === 'ATIVO') || enrollments[0];
  const activeTechnicalEnrollment = enrollments.find((item) => item.status?.toUpperCase() === 'ATIVO' && item.turmas?.status?.toUpperCase() === 'EM_ANDAMENTO' && item.turmas?.cursos?.modalidade === 'TECNICO');
  const irpfEnrollment = activeTechnicalEnrollment || null;
  const activePoloId = activeEnrollment?.turmas?.polo_id || activeEnrollment?.polo_id;
  const irpfPoloId = irpfEnrollment?.turmas?.polo_id || irpfEnrollment?.polo_id;
  const documentPoloId = irpfOpen ? irpfPoloId : activePoloId;
  const technicalIrpfAvailable = Boolean(activeTechnicalEnrollment);
  const formattedEnrollment = activeEnrollment ? formatMatricula(activeEnrollment.id, activeEnrollment.data_matricula, activeEnrollment.turmas?.polo_id || activeEnrollment.polo_id) : 'PENDENTE';
  const formattedIrpfEnrollment = irpfEnrollment ? formatMatricula(irpfEnrollment.id, irpfEnrollment.data_matricula, irpfEnrollment.turmas?.polo_id || irpfEnrollment.polo_id) : 'PENDENTE';
  const declarationValidation = useDocumentValidationCode(activeEnrollment ? { type: 'declaracao_matricula', enrollmentId: activeEnrollment.id } : null, declarationOpen);

  const { data: academicResults = [] } = useQuery({
    queryKey: ['secretaria', 'academic-results', 'managed', alunoId, activeEnrollment?.turma_id],
    queryFn: () => activeEnrollment?.turma_id
      ? secretariaAcademicResultsService.getForManagedStudent(activeEnrollment.turma_id, alunoId)
      : Promise.resolve([]),
    enabled: !!activeEnrollment?.turma_id,
  });
  const { data: declarationTemplate } = useQuery({ queryKey: ['print-declaracao-template', activePoloId], queryFn: () => activePoloId ? declaracaoService.getTemplate(activePoloId) : null, enabled: !!activePoloId });
  const { data: irpfTemplate } = useQuery({ queryKey: ['print-irpf-template', irpfPoloId], queryFn: () => irpfPoloId ? irpfService.getTemplate(irpfPoloId) : null, enabled: !!irpfPoloId });
  const irpfReleaseDate = irpfTemplate?.liberacaoDate || '03-01';
  const irpfYearOptions = getIrpfCalendarYearOptions(irpfReleaseDate);
  const irpfReleaseLabel = formatIrpfReleaseDate(selectedIrpfYear, irpfReleaseDate);
  const irpfReleased = isIrpfYearReleased(selectedIrpfYear, irpfReleaseDate);
  const irpfValidationInput = irpfEnrollment ? {
    type: 'declaracao_irpf' as const,
    enrollmentId: irpfEnrollment.id,
    referencePeriod: String(selectedIrpfYear),
  } : null;
  const irpfValidation = useDocumentValidationCode(
    irpfValidationInput,
    irpfOpen && irpfReleased,
  );
  const irpfReissue = useDocumentValidationReissue(irpfValidationInput);
  const { data: irpfPayments = [] } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-irpf-payments', alunoId, selectedIrpfYear, irpfEnrollment?.turma_id || null],
    queryFn: () => alunoSecretariaService.getPagamentosIrpf(alunoId, String(selectedIrpfYear), irpfEnrollment?.turma_id),
    enabled: irpfReleased && !!irpfEnrollment,
  });
  const { data: polo } = useQuery({ queryKey: ['print-polo-details', documentPoloId], queryFn: async () => {
    if (!documentPoloId) return null;
    const { data, error } = await supabase.from('polos').select('*').eq('id', documentPoloId).single();
    if (error) throw error;
    return data;
  }, enabled: !!documentPoloId });
  const { data: watermarks } = useQuery({ queryKey: ['print-watermarks'], queryFn: marcaDaguaService.getCompaniesWithWatermark });
  const { data: declarationQr } = useQuery({ queryKey: ['print-declaracao-qr-config'], queryFn: declaracaoService.getQrConfig });
  const { data: academicConfigs } = useQuery({ queryKey: ['print-academic-configs'], queryFn: academicosService.getConfigs });
  const { data: irpfQr } = useQuery({ queryKey: ['print-irpf-qr-config'], queryFn: irpfService.getQrConfig });
  const watermark = watermarks?.find((item: any) => item.id === documentPoloId);

  useEffect(() => {
    const defaultYear = getDefaultIrpfCalendarYear(irpfReleaseDate);
    setSelectedIrpfYear((year) => isIrpfYearReleased(year, irpfReleaseDate) ? year : defaultYear);
  }, [irpfReleaseDate]);
  const loadRequests = async () => setRequests(await secretariaService.getSolicitacoesByAluno(alunoId));
  useEffect(() => { void loadRequests(); }, [alunoId]);

  const onRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest || !action) return;
    await secretariaService.updateSolicitacao(selectedRequest.id, {
      status: action === 'deferir' ? 'Deferido' : 'Indeferido',
      resposta: action === 'deferir' ? (documentResponse.trim() || 'Solicitação atendida. O documento foi homologado pela secretaria.') : justification.trim(),
      respostaData: new Date().toISOString().split('T')[0],
    });
    await loadRequests();
    setSelectedRequest(null);
    setAction(null);
    setJustification('');
    setDocumentResponse('');
    window.alert(`Solicitação ${action === 'deferir' ? 'deferida' : 'indeferida'} com sucesso!`);
  };
  const printRegistered = (code: string | undefined, label: string) => code ? window.print() : window.alert(`Aguarde o registro do código da ${label}.`);
  const printRegisteredIrpf = async () => {
    if (!irpfValidationInput) {
      window.alert('Nenhuma matrícula técnica elegível para a declaração de IRPF.');
      return;
    }
    try {
      await irpfReissue.reissue();
      // Aguarda o cache atualizar o QR renderizado com o resultado canônico.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      const printArea = document.getElementById('print-area-irpf');
      if (!printArea) return;
      await waitForQrCodeAssets(printArea);
      window.print();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a reemissão da declaração de IRPF.',
      );
    }
  };

  const alunoCpf = aluno?.cpf_cnpj || aluno?.cpf || '';
  const variableEnrollment = irpfOpen ? irpfEnrollment : activeEnrollment;
  const variableEnrollmentNumber = irpfOpen ? formattedIrpfEnrollment : formattedEnrollment;
  const variableTemplate = irpfOpen ? irpfTemplate : declarationTemplate;
  const replaceVariables = useMemo(() => buildDocumentVariableReplacer({ aluno, enrollment: variableEnrollment, polo, formattedEnrollment: variableEnrollmentNumber, template: variableTemplate, selectedYear: selectedIrpfYear, irpfPayments }), [aluno, variableEnrollment, polo, variableEnrollmentNumber, variableTemplate, selectedIrpfYear, irpfPayments]);
  const declarationCode = buildFallbackValidationCode({ prefix: 'DEC', registeredCode: declarationValidation.data?.code, pattern: declarationQr?.pattern, separator: declarationQr?.separator, enrollment: activeEnrollment, alunoCpf, formattedEnrollment });
  const irpfCode = buildFallbackValidationCode({ prefix: 'IRPF', registeredCode: irpfValidation.data?.code, pattern: irpfQr?.pattern, separator: irpfQr?.separator, enrollment: irpfEnrollment, alunoCpf, formattedEnrollment: formattedIrpfEnrollment });
  const declarationUrl = buildValidationUrl(declarationValidation.data?.code, declarationCode, academicConfigs?.validacaoUrl);
  const irpfUrl = buildValidationUrl(irpfValidation.data?.code, irpfCode, academicConfigs?.validacaoUrl);

  if (loadingAluno || loadingEnrollments) return <div className="flex items-center justify-center py-12"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Carregando dados da secretaria...</span></div>;
  return (
    <div className="space-y-8 text-xs font-sans">
      <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center"><div><h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Secretaria do Aluno</h3><p className="font-medium text-slate-500">Ações acadêmicas e acompanhamento de solicitações para este cadastro.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setBulletinOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-[10px] font-bold uppercase text-slate-700 shadow-sm hover:bg-slate-50"><ScrollText size={14} /> Emitir Boletim</button><button onClick={() => setDeclarationOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase text-white shadow-md hover:bg-blue-900"><FileText size={14} /> Emitir Declaração</button>{technicalIrpfAvailable && irpfPayments.length ? <button onClick={() => setIrpfOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-[10px] font-bold uppercase text-white shadow-md hover:bg-teal-700"><DollarSign size={14} /> Emitir IRPF</button> : <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-700">IRPF indisponível enquanto não houver matrícula técnica ativa e pagamentos confirmados.</p>}</div></header>
      <ParceiroSolicitacoesPanel solicitacoes={requests} selected={selectedRequest} action={action} response={documentResponse} justification={justification} onSelect={setSelectedRequest} onActionChange={setAction} onResponseChange={setDocumentResponse} onJustificationChange={setJustification} onSubmit={(event) => void onRequestSubmit(event)} />
      <AcademicResultsModal open={bulletinOpen} onClose={() => setBulletinOpen(false)} results={academicResults} courseName={activeEnrollment?.turmas?.cursos?.nome} classCode={activeEnrollment?.turmas?.codigo} poloName={activeEnrollment?.turmas?.polos?.nome} onPrint={() => window.print()} />
      <TemplateDocumentModal open={declarationOpen} onClose={() => setDeclarationOpen(false)} title="Declaração de Cursando Digital" documentTitle="Declaração de Matrícula" printAreaId="print-area" code={declarationValidation.data?.code || declarationCode} validationUrl={declarationUrl} template={declarationTemplate} polo={polo} watermark={watermark} replaceVariables={replaceVariables} onPrint={() => printRegistered(declarationValidation.data?.code, 'declaração')} showFooter />
      <TemplateDocumentModal open={irpfOpen} onClose={() => setIrpfOpen(false)} title="Declaração de Rendimentos (IRPF)" documentTitle="Declaração de Anuidade / Rendimentos Escolares" printAreaId="print-area-irpf" code={irpfValidation.data?.code || irpfCode} validationUrl={irpfUrl} template={irpfTemplate} polo={polo} watermark={watermark} replaceVariables={replaceVariables} accent="emerald" printDisabled={!irpfReleased || !irpfPayments.length || irpfReissue.isPending} onPrint={() => void printRegisteredIrpf()} showFooter beforeDocument={<div className="w-[794px] max-w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg print:hidden"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ano-calendário</p><select value={selectedIrpfYear} onChange={(event) => setSelectedIrpfYear(Number(event.target.value))} className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-[#001a33]">{irpfYearOptions.map((option) => <option key={option.year} value={option.year}>{option.year}{option.released ? '' : ` - libera em ${option.releaseLabel}`}</option>)}</select><p className="mt-2 text-[10px] font-semibold text-slate-500">{irpfReleased ? `Pode emitir a declaração referente aos pagamentos de ${selectedIrpfYear}.` : `Disponível a partir de ${irpfReleaseLabel}.`}</p></div>} />
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
    </div>
  );
};

export default ParceiroAlunoSecretaria;
