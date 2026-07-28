import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatMatricula } from '../../../lib/academicUtils';
import { declaracaoService } from '../../gestor/cadastros/modelos-documentos/declaracao/declaracao.service';
import { irpfService } from '../../gestor/cadastros/modelos-documentos/irpf/irpf.service';
import { marcaDaguaService } from '../../gestor/configuracoes/marca-dagua/marca-dagua.service';
import { academicosService } from '../../gestor/configuracoes/academicos/academicos.service';
import { carteirinhaService } from '../../gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service';
import { crachaService } from '../../gestor/cadastros/modelos-documentos/cracha/cracha.service';
import { crachaPeriodoEleitoralService, isCrachaEleitoralTemplateAvailable } from '../../gestor/cadastros/modelos-documentos/cracha-periodo-eleitoral/cracha-periodo-eleitoral.service';
import { formatIrpfReleaseDate, getDefaultIrpfCalendarYear, getIrpfCalendarYearOptions, isIrpfYearReleased } from '../../../lib/irpfYearUtils';
import { useDocumentValidationCode } from '../../shared/document-validation/use-document-validation-code';
import { usePoloInstitutionalData } from '../../shared/polo-institutional/use-polo-institutional-data';
import AcademicResultsModal from '../../shared/secretaria/AcademicResultsModal';
import TemplateDocumentModal from '../../shared/secretaria/TemplateDocumentModal';
import { secretariaAcademicResultsService } from '../../shared/secretaria/academic-results.service';
import { selectDefaultAcademicModule } from '../../shared/secretaria/academic-results.modules';
import { buildDocumentVariableReplacer, buildFallbackValidationCode, buildValidationUrl } from '../../shared/secretaria/document-template.helpers';
import AlunoIdentityDocuments, { AlunoIdentityTab } from './components/AlunoIdentityDocuments';
import AlunoSecretariaServicesPanel from './components/AlunoSecretariaServicesPanel';
import { alunoSecretariaKeys, alunoSecretariaService } from './secretaria-aluno.service';
import { useAlunoSecretariaData } from './useAlunoSecretariaData';
import { AlunoSecretariaSolicitacaoTipo } from './secretaria-aluno.types';
import { useIRPFFiscalData } from './useIRPFFiscalData';
import { downloadStudentCardPdf } from './student-card-pdf';
import { waitForQrCodeAssets } from '../../shared/qrcode/qr-code-assets';

interface SecretariaPageProps { alunoId: string }
type Toast = { message: string; type: 'success' | 'error' | 'warning' };

const printStyles = `@media print {
  body * { visibility: hidden; }
  #print-area, #print-area *, #print-area-cracha, #print-area-cracha *, #print-area-cracha-eleitoral, #print-area-cracha-eleitoral *, #print-area-declaracao, #print-area-declaracao *, #print-area-irpf, #print-area-irpf * { visibility: visible; }
  #print-area, #print-area-cracha { position:absolute;left:0;top:0;width:100%;padding:20mm!important;box-shadow:none!important;border:none!important; }
  #print-area-cracha-eleitoral { position:absolute;left:0;top:0;width:100%;padding:8mm!important;box-shadow:none!important;border:none!important;background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact; }
  #print-area-declaracao, #print-area-irpf { position:absolute;left:0;top:0;width:794px!important;height:1123px!important;padding:60px 80px!important;box-shadow:none!important;border:none!important;background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact; }
}`;

const SecretariaPage: React.FC<SecretariaPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [selectedRequestType, setSelectedRequestType] = useState<AlunoSecretariaSolicitacaoTipo>('Histórico Escolar');
  const [tab, setTab] = useState<AlunoIdentityTab>('servicos');
  const [studentCardTemplate, setStudentCardTemplate] = useState<any>(null);
  const [internshipBadgeTemplate, setInternshipBadgeTemplate] = useState<any>(null);
  const [electionBadgeTemplate, setElectionBadgeTemplate] = useState<any>(null);
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [selectedBulletinPeriodId, setSelectedBulletinPeriodId] = useState('');
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const [irpfOpen, setIrpfOpen] = useState(false);
  const [selectedIrpfYear, setSelectedIrpfYear] = useState(getDefaultIrpfCalendarYear);
  const [availabilityNow, setAvailabilityNow] = useState(() => new Date());
  const [toast, setToast] = useState<Toast | null>(null);
  const [downloadingCard, setDownloadingCard] = useState(false);
  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  };

  const { aluno, solicitacoes, prazos, eligibility, isLoading } = useAlunoSecretariaData(alunoId);
  const activeEnrollment = eligibility.primaryEnrollment;
  const identityEnrollment = eligibility.technicalIdentityEnrollment;
  const electionEnrollment = eligibility.electionBadgeEnrollment;
  const bulletinEnrollment = eligibility.bulletinEnrollment;
  const declarationEnrollment = eligibility.declarationEnrollment;
  const irpfEnrollment = eligibility.irpfEnrollment;
  const activePoloId = activeEnrollment?.turmas?.polo_id || activeEnrollment?.polo_id;
  const declarationPoloId = declarationEnrollment?.turmas?.polo_id || declarationEnrollment?.polo_id || activePoloId;
  const irpfPoloId = irpfEnrollment?.turmas?.polo_id || irpfEnrollment?.polo_id || activePoloId;
  const documentPoloId = irpfOpen ? irpfPoloId : declarationPoloId;
  const alunoCpf = aluno?.cpf || aluno?.cpf_cnpj || '';
  const formattedEnrollment = activeEnrollment
    ? formatMatricula(activeEnrollment.id, activeEnrollment.data_matricula, activeEnrollment.turmas?.polo_id || activeEnrollment.polo_id)
    : 'PENDENTE';
  const formattedIrpfEnrollment = irpfEnrollment
    ? formatMatricula(irpfEnrollment.id, irpfEnrollment.data_matricula, irpfEnrollment.turmas?.polo_id || irpfEnrollment.polo_id)
    : 'PENDENTE';
  const { data: institutionalData } = usePoloInstitutionalData(activePoloId);

  const cardValidation = useDocumentValidationCode(identityEnrollment ? { type: 'carteirinha', enrollmentId: identityEnrollment.id } : null, tab === 'carteirinha' && eligibility.canEmitStudentCard);
  const badgeValidation = useDocumentValidationCode(identityEnrollment ? { type: 'cracha_estagio', enrollmentId: identityEnrollment.id } : null, tab === 'cracha' && eligibility.canEmitInternshipBadge);
  const declarationValidation = useDocumentValidationCode(declarationEnrollment ? { type: 'declaracao_matricula', enrollmentId: declarationEnrollment.id } : null, declarationOpen && eligibility.canEmitEnrollmentDeclaration);

  const bulletinTurmaId = bulletinEnrollment?.turma_id;
  const bulletinModulesQuery = useQuery({
    queryKey: ['secretaria', 'academic-modules', 'self', alunoId, bulletinTurmaId],
    queryFn: () => bulletinTurmaId
      ? secretariaAcademicResultsService.getAvailableModulesForAuthenticatedStudent(bulletinTurmaId)
      : Promise.resolve([]),
    enabled: bulletinOpen && eligibility.canEmitBulletin && !!bulletinTurmaId,
    staleTime: 60_000,
  });
  const bulletinModules = bulletinModulesQuery.data || [];
  const selectedBulletinModule = bulletinModules.find(
    (module) => module.periodId === selectedBulletinPeriodId,
  );
  const selectedBulletinDisciplineIds = selectedBulletinModule?.disciplines.map(
    (discipline) => discipline.id,
  ) || [];
  const academicResultsQuery = useQuery({
    queryKey: [
      'secretaria',
      'academic-results',
      'self',
      alunoId,
      bulletinTurmaId,
      selectedBulletinPeriodId,
      selectedBulletinDisciplineIds,
    ],
    queryFn: () => bulletinTurmaId && selectedBulletinModule
      ? secretariaAcademicResultsService.getForAuthenticatedStudent(
        bulletinTurmaId,
        selectedBulletinModule,
      )
      : Promise.resolve([]),
    enabled: (
      bulletinOpen
      && eligibility.canEmitBulletin
      && !!bulletinTurmaId
      && !!selectedBulletinModule
    ),
    staleTime: 60_000,
  });
  const academicResults = academicResultsQuery.data || [];
  const { data: declarationTemplate } = useQuery({
    queryKey: ['print-declaracao-template', declarationPoloId],
    queryFn: () => declarationPoloId ? declaracaoService.getTemplate(declarationPoloId) : null,
    enabled: !!declarationPoloId,
  });
  const { data: irpfTemplate } = useQuery({
    queryKey: ['print-irpf-template', irpfPoloId],
    queryFn: () => irpfPoloId ? irpfService.getTemplate(irpfPoloId) : null,
    enabled: !!irpfPoloId,
  });
  const irpfReleaseDate = irpfTemplate?.liberacaoDate || '03-01';
  const irpfYearOptions = getIrpfCalendarYearOptions(irpfReleaseDate);
  const irpfReleaseLabel = formatIrpfReleaseDate(selectedIrpfYear, irpfReleaseDate);
  const irpfReleased = isIrpfYearReleased(selectedIrpfYear, irpfReleaseDate);
  const irpfValidation = useDocumentValidationCode(irpfEnrollment ? { type: 'declaracao_irpf', enrollmentId: irpfEnrollment.id, referencePeriod: String(selectedIrpfYear) } : null, irpfOpen && eligibility.canEmitIrpf && irpfReleased);
  const { data: irpfPayments = [] } = useIRPFFiscalData(alunoId, selectedIrpfYear, irpfEnrollment?.turma_id, eligibility.canEmitIrpf && irpfReleased);
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
    const timer = window.setInterval(() => setAvailabilityNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const defaultYear = getDefaultIrpfCalendarYear(irpfReleaseDate);
    setSelectedIrpfYear((year) => isIrpfYearReleased(year, irpfReleaseDate) ? year : defaultYear);
  }, [irpfReleaseDate]);
  useEffect(() => {
    if (!bulletinOpen || bulletinModulesQuery.isLoading) return;
    const nextModule = selectDefaultAcademicModule(
      bulletinModules,
      selectedBulletinPeriodId,
    );
    setSelectedBulletinPeriodId(nextModule?.periodId || '');
  }, [
    bulletinModules,
    bulletinModulesQuery.isLoading,
    bulletinOpen,
    selectedBulletinPeriodId,
  ]);
  useEffect(() => {
    setSelectedBulletinPeriodId('');
  }, [bulletinTurmaId]);
  useEffect(() => {
    void Promise.all([carteirinhaService.getTemplate(), crachaService.getTemplate(), crachaPeriodoEleitoralService.getTemplate()]).then(([card, badge, election]) => {
      setStudentCardTemplate(card || { corPrimaria: '#001a33', corSecundaria: '#3b82f6', textoFrente: 'CIE - Documento do Estudante', textoVerso: 'Uso pessoal e intransferível.', tipoCurso: 'Técnico', exibirRotulos: true });
      setInternshipBadgeTemplate(badge || { corPrimaria: '#001a33', corSecundaria: '#3b82f6', textoFrente: 'ALUNO', cargoPadrao: 'ALUNO(A)', exibirRotulos: true });
      setElectionBadgeTemplate(election);
    });
  }, []);
  const electionAvailable = eligibility.canEmitElectionBadge && isCrachaEleitoralTemplateAvailable(electionBadgeTemplate, availabilityNow);
  useEffect(() => {
    if ((tab === 'carteirinha' && !eligibility.canEmitStudentCard) || (tab === 'cracha' && !eligibility.canEmitInternshipBadge) || (tab === 'cracha-eleitoral' && !electionAvailable)) setTab('servicos');
  }, [tab, electionAvailable, eligibility.canEmitInternshipBadge, eligibility.canEmitStudentCard]);
  useEffect(() => {
    if (!eligibility.allowedRequests.includes(selectedRequestType) && eligibility.allowedRequests[0]) setSelectedRequestType(eligibility.allowedRequests[0]);
  }, [eligibility.allowedRequests, selectedRequestType]);

  const createRequest = useMutation({
    mutationFn: async (type: AlunoSecretariaSolicitacaoTipo) => {
      if (!aluno || !eligibility.requestEnrollment) throw new Error('Nenhum vínculo elegível para solicitação.');
      const created = await alunoSecretariaService.createSolicitacao({ alunoId, alunoNome: aluno.nome.toUpperCase(), alunoMatricula: formattedEnrollment, curso: eligibility.requestEnrollment.turmas?.cursos?.nome || 'CURSO GERAL', tipo: type, dataSolicitacao: new Date().toISOString().split('T')[0], prazo: prazos[type]?.prazo || (type === 'Transferência' ? '3 dias úteis' : '48 horas'), status: 'Pendente' });
      if (!created) throw new Error('Erro ao registrar solicitação.');
      return created;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: alunoSecretariaKeys.solicitacoes(alunoId) }); showToast('Sua solicitação foi registrada.'); },
    onError: (error: any) => showToast(error?.message || 'Erro ao registrar solicitação.', 'error'),
  });

  const printRegistered = async (code: string | undefined, label: string) => {
    if (!code) {
      showToast(`Aguarde o registro do código da ${label}.`, 'warning');
      return;
    }
    const printAreaId = label === 'carteirinha'
      ? 'print-area'
      : label === 'crachá'
        ? 'print-area-cracha'
        : label.includes('IRPF')
          ? 'print-area-irpf'
          : 'print-area-declaracao';
    const printArea = document.getElementById(printAreaId);
    if (!printArea) return;
    try {
      await waitForQrCodeAssets(printArea);
      window.print();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o QR Code para impressão.',
        'error',
      );
    }
  };
  const onDownloadCard = async () => {
    if (!cardValidation.data?.code) return showToast('Aguarde o registro do código da carteirinha.', 'warning');
    setDownloadingCard(true);
    try { await downloadStudentCardPdf('print-area', aluno?.nome); showToast('PDF da carteirinha gerado com frente e verso.'); }
    catch { showToast('Não foi possível gerar o PDF da carteirinha agora.', 'error'); }
    finally { setDownloadingCard(false); }
  };
  const onOpenIrpf = () => {
    if (!eligibility.canEmitIrpf) return showToast('O IRPF está disponível apenas para vínculo técnico.', 'warning');
    if (!irpfReleased) return showToast(`O IRPF de ${selectedIrpfYear} estará disponível em ${irpfReleaseLabel}.`, 'warning');
    if (!irpfPayments.length) return showToast('O IRPF ficará disponível quando existirem pagamentos confirmados pelo financeiro.', 'warning');
    setIrpfOpen(true);
  };

  const variableEnrollment = irpfOpen ? irpfEnrollment : declarationEnrollment || activeEnrollment;
  const variableEnrollmentNumber = irpfOpen ? formattedIrpfEnrollment : formattedEnrollment;
  const variableTemplate = irpfOpen ? irpfTemplate : declarationTemplate;
  const replaceVariables = useMemo(() => buildDocumentVariableReplacer({ aluno, enrollment: variableEnrollment, polo, formattedEnrollment: variableEnrollmentNumber, template: variableTemplate, selectedYear: selectedIrpfYear, irpfPayments }), [aluno, variableEnrollment, polo, variableEnrollmentNumber, variableTemplate, selectedIrpfYear, irpfPayments]);
  const declarationCode = buildFallbackValidationCode({ prefix: 'DEC', registeredCode: declarationValidation.data?.code, pattern: declarationQr?.pattern, separator: declarationQr?.separator, enrollment: declarationEnrollment, alunoCpf, formattedEnrollment });
  const irpfCode = buildFallbackValidationCode({ prefix: 'IRPF', registeredCode: irpfValidation.data?.code, pattern: irpfQr?.pattern, separator: irpfQr?.separator, enrollment: irpfEnrollment, alunoCpf, formattedEnrollment: formattedIrpfEnrollment });
  const declarationUrl = buildValidationUrl(declarationValidation.data?.code, declarationCode, academicConfigs?.validacaoUrl);
  const irpfUrl = buildValidationUrl(irpfValidation.data?.code, irpfCode, academicConfigs?.validacaoUrl);
  const alunoData = { nome: aluno?.nome?.toUpperCase() || 'NOME DO ALUNO', cpf: alunoCpf || 'CPF não cadastrado', rg: aluno?.rg || 'Doc. não cadastrado', nascimento: aluno?.data_nascimento ? new Date(`${aluno.data_nascimento}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado', matricula: formattedEnrollment, curso: identityEnrollment?.turmas?.cursos?.nome || activeEnrollment?.turmas?.cursos?.nome || 'CURSO GERAL', instituicao: institutionalData?.poloNome || 'UNIVERSO CURSOS E CONSULTORIA', validade: `01/${new Date().getFullYear() + 1}`, fotoUrl: aluno?.foto_url || null, tipoDocumento: aluno?.tipo_documento || 'RG', cargo: 'ALUNO(A)', polo: identityEnrollment?.turmas?.polos?.nome || activeEnrollment?.turmas?.polos?.nome || 'Polo Principal', poloRazaoSocial: institutionalData?.razaoSocial, poloCnpj: institutionalData?.cnpj, poloTelefone: institutionalData?.telefone };
  const electionFormatted = electionEnrollment ? formatMatricula(electionEnrollment.id, electionEnrollment.data_matricula, electionEnrollment.turmas?.polo_id || electionEnrollment.polo_id) : formattedEnrollment;
  const electionAlunoData = { nome: alunoData.nome, matricula: electionFormatted, curso: electionEnrollment?.turmas?.cursos?.nome || alunoData.curso, polo: electionEnrollment?.turmas?.polos?.nome || alunoData.polo, instituicaoEnsino: electionBadgeTemplate?.instituicaoEnsinoPadrao || institutionalData?.poloNome || 'UNIVERSO CURSOS E CONSULTORIA', instrutor: electionBadgeTemplate?.instrutorPadrao, fotoUrl: aluno?.foto_url || null };

  if (isLoading) return <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-20 shadow-sm"><Loader2 className="mr-2 animate-spin text-blue-600" size={24} /><span className="text-xs font-bold uppercase tracking-widest text-slate-500">Carregando secretaria eletrônica...</span></div>;
  return (
    <div className="space-y-5 text-xs font-sans animate-fadeIn">
      <div className="flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900 to-slate-900 p-5 text-white shadow-lg sm:flex-row sm:items-center sm:p-7"><div><span className="rounded-lg border border-blue-500/20 bg-blue-600/30 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-blue-300">Secretaria Digital</span><h2 className="mt-1 text-xl font-black uppercase tracking-tight sm:text-2xl">Serviços Acadêmicos</h2><p className="text-xs font-medium text-slate-300">Emita declarações, faça solicitações e acesse seus documentos.</p></div><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 font-mono font-bold"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Minha Matrícula</p><p className="mt-1.5 text-base tracking-widest text-white">{formattedEnrollment}</p></div></div>
      <AlunoIdentityDocuments tab={tab} canStudentCard={eligibility.canEmitStudentCard} canInternshipBadge={eligibility.canEmitInternshipBadge} canElectionBadge={electionAvailable} studentCardTemplate={studentCardTemplate} internshipBadgeTemplate={internshipBadgeTemplate} electionBadgeTemplate={electionBadgeTemplate} alunoData={alunoData} electionAlunoData={electionAlunoData} studentCardCode={cardValidation.data?.code} internshipBadgeCode={badgeValidation.data?.code} downloadingStudentCard={downloadingCard} onTabChange={setTab} onDownloadStudentCard={() => void onDownloadCard()} onPrintRegistered={printRegistered} />
      {tab === 'servicos' ? <AlunoSecretariaServicesPanel eligibility={eligibility} solicitacoes={solicitacoes} prazos={prazos} selectedType={selectedRequestType} submitting={createRequest.isPending} onSelectedTypeChange={setSelectedRequestType} onSubmit={(event) => { event.preventDefault(); if (eligibility.allowedRequests.includes(selectedRequestType)) createRequest.mutate(selectedRequestType); }} onOpenBulletin={() => setBulletinOpen(true)} onOpenDeclaration={() => setDeclarationOpen(true)} onOpenIrpf={onOpenIrpf} /> : null}
      <AcademicResultsModal
        open={bulletinOpen}
        onClose={() => setBulletinOpen(false)}
        results={academicResults}
        courseName={bulletinEnrollment?.turmas?.cursos?.nome}
        classCode={bulletinEnrollment?.turmas?.codigo}
        poloName={bulletinEnrollment?.turmas?.polos?.nome}
        modules={bulletinModules}
        selectedPeriodId={selectedBulletinPeriodId}
        onModuleChange={setSelectedBulletinPeriodId}
        isLoading={bulletinModulesQuery.isLoading || academicResultsQuery.isLoading}
        isError={bulletinModulesQuery.isError || academicResultsQuery.isError}
        onRetry={() => {
          if (bulletinModulesQuery.isError) {
            void bulletinModulesQuery.refetch();
            return;
          }
          void academicResultsQuery.refetch();
        }}
      />
      <TemplateDocumentModal open={declarationOpen && eligibility.canEmitEnrollmentDeclaration} onClose={() => setDeclarationOpen(false)} title="Declaração de Cursando" documentTitle="Declaração de Matrícula" printAreaId="print-area-declaracao" code={declarationValidation.data?.code || declarationCode} validationUrl={declarationUrl} template={declarationTemplate} polo={polo} watermark={watermark} replaceVariables={replaceVariables} onPrint={() => printRegistered(declarationValidation.data?.code, 'declaração')} />
      <TemplateDocumentModal open={irpfOpen} onClose={() => setIrpfOpen(false)} title="Declaração de Rendimentos (IRPF)" documentTitle="Declaração de Anuidade / Rendimentos Escolares" printAreaId="print-area-irpf" code={irpfValidation.data?.code || irpfCode} validationUrl={irpfUrl} template={irpfTemplate} polo={polo} watermark={watermark} replaceVariables={replaceVariables} accent="emerald" printDisabled={!irpfReleased || !irpfPayments.length} onPrint={() => printRegistered(irpfValidation.data?.code, 'declaração de IRPF')} beforeDocument={<div className="w-[794px] max-w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg print:hidden"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ano-calendário</p><select value={selectedIrpfYear} onChange={(event) => setSelectedIrpfYear(Number(event.target.value))} className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-[#001a33]">{irpfYearOptions.map((option) => <option key={option.year} value={option.year}>{option.year}{option.released ? '' : ` - libera em ${option.releaseLabel}`}</option>)}</select></div>} />
      {toast ? <div className="fixed right-6 top-6 z-[9999]"><div className={`flex items-center gap-3 rounded-2xl border px-6 py-3.5 text-white shadow-2xl ${toast.type === 'success' ? 'bg-emerald-500/95' : toast.type === 'warning' ? 'bg-amber-500/95' : 'bg-red-500/95'}`}>{toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}<span className="text-xs font-black uppercase tracking-wider">{toast.message}</span></div></div> : null}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
    </div>
  );
};

export default SecretariaPage;
