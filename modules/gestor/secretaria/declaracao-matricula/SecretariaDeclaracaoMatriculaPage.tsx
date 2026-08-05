// File: modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, Users, Search, Printer, ArrowLeft, Loader2, Download, Trash2, X } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { declaracaoService } from '../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { marcaDaguaService } from '../../configuracoes/marca-dagua/marca-dagua.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import {
  createDocumentReissueKey,
  documentValidationService,
} from '../../../shared/document-validation/document-validation.service';
import { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';
import { getDocumentValidationUrl } from '../../../shared/document-validation/document-validation.url';
import { formatMatricula } from '../../../../lib/academicUtils';
import { onlyDigits } from '../../../../lib/documentFormatters';
import { matchesSecretariaSearch } from '../secretaria-search';
import { sanitizedHtml } from '../../../../lib/htmlSanitizer';
import DocumentHeader from '../../components/DocumentHeader';
import SecretariaAlunoSearchCard from '../shared/SecretariaAlunoSearchCard';
import { documentValidationPoliciesService } from '../../cadastros/modelos-documentos/validacao-documental/document-validation-policies.service';
import { LocalQrCodeImage } from '../../../shared/qrcode/LocalQrCodeImage';
import { waitForQrCodeAssets } from '../../../shared/qrcode/qr-code-assets';
import {
  buildSelectablePdfBlobFromElements,
  downloadPdfBlob,
} from '../../../shared/pdf/dom-to-selectable-pdf';

interface Aluno {
  id: string;
  enrollmentId?: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  matricula: string;
  curso: string;
  turmaNome: string;
  turmaCodigo?: string;
  instituicao: string;
  fotoUrl?: string | null;
  tipoDocumento?: string;
  turmaIds?: string[];
  poloNome: string;
  poloCnpj: string;
  cidadePolo: string;
}

const TEMPLATE_DEFAULT = {
  textContent: `<p>Declaramos para os devidos fins que o(a) aluno(a) <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, nascido(a) em <b>{{ALUNO_NASCIMENTO}}</b>, registrado(a) sob a matrícula nº <b>{{ALUNO_MATRICULA}}</b>, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, na turma <b>{{TURMA_NOME}}</b>, nesta instituição de ensino, no polo de <b>{{POLO_NOME}}</b>.</p>`,
  absoluteFields: [],
  validityDays: 30,
  v: 2
};

type DeclaracaoDocumentType = Extract<ValidatableDocumentType, 'declaracao_matricula' | 'declaracao_frequencia'>;
const DEFAULT_DOCUMENT_TYPE: DeclaracaoDocumentType = 'declaracao_matricula';

interface SecretariaDeclaracaoMatriculaPageProps {
  documentService?: {
    getTemplate: (poloId: string) => Promise<any>;
    getQrConfig: () => Promise<any>;
  };
  defaultTemplate?: any;
  documentTitle?: string;
  documentType?: DeclaracaoDocumentType;
  fileSlug?: string;
}

const SecretariaDeclaracaoMatriculaPage = ({
  documentService = declaracaoService,
  defaultTemplate = TEMPLATE_DEFAULT,
  documentTitle = 'Declaração de Matrícula',
  documentType = DEFAULT_DOCUMENT_TYPE,
  fileSlug = 'declaracoes-matricula',
}: SecretariaDeclaracaoMatriculaPageProps) => {
  const [mode, setMode] = useState<'individual' | 'lote' | 'custom'>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCustom, setSearchQueryCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [poloInfo, setPoloInfo] = useState<any>(null);
  
  // Real Database Data
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [customSelectedAlunos, setCustomSelectedAlunos] = useState<Aluno[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('todos');
  
  // Model Configs
  const [templateConfig, setTemplateConfig] = useState<any>(defaultTemplate);
  const [watermark, setWatermark] = useState<any>(null);

  // States for printing visualizer
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingValidation, setIsPreparingValidation] = useState(false);
  const [validationCodes, setValidationCodes] = useState<Record<string, string>>({});
  const [validationExpirations, setValidationExpirations] = useState<Record<string, string | null>>({});
  const [validationPublicByStudent, setValidationPublicByStudent] = useState<Record<string, boolean>>({});
  const [validationPublic, setValidationPublic] = useState(true);
  const [validationValidityDays, setValidationValidityDays] = useState<number | null>(null);
  const [frequenciesByStudent, setFrequenciesByStudent] = useState<Record<string, number>>({});
  const printContentRef = useRef<HTMLDivElement>(null);
  const validationRequestRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const validationRequestInFlightRef = useRef(false);

  useEffect(() => {
    if (!isPrinting) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDownloading) {
        setIsPrinting(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isDownloading, isPrinting]);

  const matchesAlunoSearch = (aluno: Aluno, term: string) => {
    const digits = onlyDigits(term);
    return matchesSecretariaSearch(term, [aluno.nome, aluno.curso, aluno.turmaNome])
      || Boolean(aluno.cpf && (aluno.cpf.includes(term) || (digits && onlyDigits(aluno.cpf).includes(digits))))
      || Boolean(aluno.rg && aluno.rg.includes(term));
  };

  const loadAcademicoData = async (activePoloId: string) => {
    try {
      setLoading(true);

      const [poloData, enrollmentsResult] = await Promise.all([
        polosService.getById(activePoloId),
        supabase
          .from('matriculas')
          .select(`
            id, aluno_id, turma_id, status, data_matricula,
            parceiros!inner(
              id, nome, cpf_cnpj, rg, data_nascimento, foto_url, tipo_documento
            ),
            turmas!inner(
              id, nome, codigo, status, polo_id,
              cursos!inner(nome),
              polos(nome, cnpj, cidade, estado)
            )
          `)
          .eq('status', 'ATIVO')
          .eq('turmas.status', 'EM_ANDAMENTO')
          .or(`polo_id.eq.${activePoloId},polo_id.is.null`, { foreignTable: 'turmas' })
          .order('data_matricula', { ascending: false }),
      ]);
      setPoloInfo(poloData);
      if (enrollmentsResult.error) throw enrollmentsResult.error;

      const rows = (enrollmentsResult.data || []) as any[];
      const enrollmentsByStudent = new Map<string, any[]>();
      const classesById = new Map<string, { id: string; nome: string; codigo: string }>();
      rows.forEach((enrollment) => {
        const current = enrollmentsByStudent.get(enrollment.aluno_id) || [];
        current.push(enrollment);
        enrollmentsByStudent.set(enrollment.aluno_id, current);
        if (enrollment.turmas?.id && !classesById.has(enrollment.turmas.id)) {
          classesById.set(enrollment.turmas.id, {
            id: enrollment.turmas.id,
            nome: enrollment.turmas.nome || 'Turma',
            codigo: enrollment.turmas.codigo || '',
          });
        }
      });

      const mapped = [...enrollmentsByStudent.values()].map((studentEnrollments): Aluno => {
        const activeMat = studentEnrollments[0];
        const student = activeMat.parceiros || {};
        const turma = activeMat.turmas || {};
        const turmaPolo = turma.polos || {};
        const rawCidade = turmaPolo.cidade || poloData?.cidade || 'Aracaju';
        const rawUf = turmaPolo.estado || poloData?.estado || 'SE';
        return {
          id: student.id || activeMat.aluno_id,
          enrollmentId: activeMat.id,
          nome: String(student.nome || '').toUpperCase(),
          cpf: student.cpf_cnpj || '',
          rg: student.rg || '',
          nascimento: student.data_nascimento || '',
          matricula: formatMatricula(
            activeMat.id,
            activeMat.data_matricula,
            turma.polo_id || activePoloId
          ),
          curso: turma.cursos?.nome || 'Curso Geral',
          turmaNome: turma.nome || '',
          turmaCodigo: turma.codigo || '',
          instituicao: 'Universo Cursos e Consultoria',
          fotoUrl: student.foto_url || null,
          tipoDocumento: student.tipo_documento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
          turmaIds: studentEnrollments.map((enrollment) => enrollment.turma_id),
          poloNome: turmaPolo.nome || poloData?.nome || 'Universo Cursos e Consultoria',
          poloCnpj: turmaPolo.cnpj || poloData?.cnpj || '',
          cidadePolo: rawCidade.includes('/') ? rawCidade : `${rawCidade}/${rawUf}`,
        };
      });

      setTurmas(
        [...classesById.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
      setAlunos(mapped.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    } catch (err) {
      console.error('Erro ao carregar dados acadêmicos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initConfigs = async () => {
      try {
        const activePoloId = sessionStorage.getItem('current_polo_id') || '44444444-4444-4444-4444-444444444444';

        const [template, watermarks, , validationPolicy] = await Promise.all([
          documentService.getTemplate(activePoloId),
          marcaDaguaService.getCompaniesWithWatermark(),
          loadAcademicoData(activePoloId),
          documentValidationPoliciesService.getByDocument(documentType),
        ]);
        setTemplateConfig(template);
        const wm = watermarks.find(w => w.id === activePoloId);
        setWatermark(wm);
        setValidationPublic(validationPolicy?.validacao_publica !== false);
        setValidationValidityDays(validationPolicy?.validade_dias ?? null);
      } catch (err) {
        console.error('Erro ao carregar configurações de declaração:', err);
      }
    };
    initConfigs();
  }, []);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const result = alunos.find((aluno) => matchesSecretariaSearch(
      searchQuery,
      [aluno.nome, aluno.cpf, aluno.rg, aluno.curso, aluno.turmaNome],
    ));
    if (result) {
      setSelectedAluno(result);
      setSearchQuery('');
    } else {
      alert('Nenhum aluno encontrado.');
    }
  };

  const handlePrintAction = async () => {
    if (validationRequestInFlightRef.current) return;
    const targets = mode === 'individual'
      ? (selectedAluno ? [selectedAluno] : [])
      : mode === 'lote'
        ? (selectedTurmaId === 'todos'
            ? alunos
            : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
        : customSelectedAlunos;

    const eligibleTargets = targets.filter((aluno) => aluno.enrollmentId);
    if (!eligibleTargets.length) {
      alert('Nenhuma matrícula válida foi encontrada para gerar os códigos de autenticação.');
      return;
    }

    const requestFingerprint = JSON.stringify([
      documentType,
      eligibleTargets.map((aluno) => aluno.enrollmentId),
    ]);
    if (validationRequestRef.current?.fingerprint !== requestFingerprint) {
      validationRequestRef.current = {
        fingerprint: requestFingerprint,
        idempotencyKey: createDocumentReissueKey(),
      };
    }

    validationRequestInFlightRef.current = true;
    setIsPreparingValidation(true);
    try {
      if (documentType === 'declaracao_frequencia') {
        const frequencyEntries = await Promise.all(eligibleTargets.map(async (aluno) => {
          const { data, error } = await (supabase.rpc as any)('get_secretaria_documento_academico', {
            p_matricula_id: aluno.enrollmentId,
            p_documento: 'declaracao_frequencia',
          });
          if (error) throw error;
          const frequency = data?.frequenciaGeral;
          if (frequency === null || frequency === undefined) {
            throw new Error(`A frequência de ${aluno.nome} ainda não está consolidada.`);
          }
          return [aluno.id, Number(frequency)] as const;
        }));
        setFrequenciesByStudent((current) => ({
          ...current,
          ...Object.fromEntries(frequencyEntries),
        }));
      }

      const issues = await Promise.all(
        eligibleTargets.map(async (aluno) => ({
          alunoId: aluno.id,
          issue: await documentValidationService.reissue({
            type: documentType,
            enrollmentId: aluno.enrollmentId!,
            idempotencyKey:
              `${validationRequestRef.current!.idempotencyKey}:${aluno.enrollmentId}`,
          }),
        }))
      );

      setValidationCodes((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.code])),
      }));
      setValidationExpirations((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.expiresAt])),
      }));
      setValidationPublicByStudent((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [
          alunoId,
          issue.validationPublic,
        ])),
      }));
      setIsPrinting(true);
      validationRequestRef.current = null;
    } catch (error) {
      console.error('Erro ao registrar emissão de declaração:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar as declarações.'
      );
    } finally {
      validationRequestInFlightRef.current = false;
      setIsPreparingValidation(false);
    }
  };

  const removeWhiteBackground = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        // key out white pixels (R, G, B > 200) with a smooth alpha transition
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const whiteness = Math.min(r, g, b);
          if (whiteness > 200) {
            // Smoothly fade out pixels close to white
            const alphaFactor = (255 - whiteness) / (255 - 200);
            data[i + 3] = Math.round(data[i + 3] * alphaFactor);
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const inlinePrintImages = async () => {
    const container = printContentRef.current;
    if (!container) return () => {};

    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('img')
    ) as HTMLImageElement[];
    const originals = images.map((image) => ({ image, src: image.src }));
    const dataUrlCache = new Map<string, string>();

    const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    await Promise.all(images.map(async (image) => {
      const source = image.currentSrc || image.src;
      if (!source || source.startsWith('data:') || source.startsWith('blob:')) return;

      try {
        let dataUrl = dataUrlCache.get(source);
        if (!dataUrl) {
          const response = await fetch(source, { cache: 'force-cache', mode: 'cors' });
          if (!response.ok) throw new Error(`Falha ao carregar imagem: ${response.status}`);
          dataUrl = await blobToDataUrl(await response.blob());
          dataUrlCache.set(source, dataUrl);
        }

        const computedStyle = window.getComputedStyle(image);
        const parentStyle = image.parentElement ? window.getComputedStyle(image.parentElement) : null;
        const needsMultiply = 
          computedStyle.mixBlendMode === 'multiply' || 
          (parentStyle && parentStyle.mixBlendMode === 'multiply') ||
          image.style.mixBlendMode === 'multiply' ||
          (image.parentElement && image.parentElement.style.mixBlendMode === 'multiply') ||
          image.alt === 'Assinatura Diretor' ||
          image.alt === 'Assinatura' ||
          image.src.includes('signature');

        if (needsMultiply) {
          dataUrl = await removeWhiteBackground(dataUrl);
        }

        image.src = dataUrl;
        await image.decode().catch(() => undefined);
      } catch (error) {
        console.warn('[SecretariaDeclaracao] Imagem mantida pela URL original:', source, error);
      }
    }));

    return () => {
      originals.forEach(({ image, src }) => {
        image.src = src;
      });
    };
  };

  const waitForPrintAssets = async () => {
    const container = printContentRef.current;
    if (!container) return;

    await waitForQrCodeAssets(container);
    const images = Array.from(
      container.querySelectorAll<HTMLImageElement>('img')
    ) as HTMLImageElement[];
    await Promise.all(images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));

    if (document.fonts?.ready) await document.fonts.ready;
  };

  const handleDownload = async () => {
    const pages = Array.from(
      printContentRef.current?.querySelectorAll<HTMLElement>('.print-page') || []
    ) as HTMLElement[];
    if (!pages.length) return;

    setIsDownloading(true);
    let restoreImages = () => {};
    try {
      await waitForPrintAssets();
      restoreImages = await inlinePrintImages();

      const pdfBlob = await buildSelectablePdfBlobFromElements(pages, {
        orientation: 'portrait',
        artworkFormat: 'PNG',
        artworkScale: 2,
        title: documentTitle,
        subject: 'Declaração institucional emitida pela Secretaria',
      });
      downloadPdfBlob(
        pdfBlob,
        `${fileSlug}-${new Date().toISOString().split('T')[0]}.pdf`,
      );
    } catch (error) {
      console.error('Erro ao baixar declaração:', error);
      alert('Não foi possível gerar o PDF da declaração.');
    } finally {
      restoreImages();
      setIsDownloading(false);
    }
  };

  const triggerBrowserPrint = async () => {
    try {
      await waitForPrintAssets();
      window.print();
    } catch (error) {
      console.error('Erro ao preparar declaração para impressão:', error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o QR Code para impressão.',
      );
    }
  };

  const rawAlunosParaImprimir = mode === 'individual'
    ? (selectedAluno ? [selectedAluno] : [])
    : mode === 'lote'
      ? (selectedTurmaId === 'todos'
          ? alunos
          : alunos.filter(a => a.turmaIds && a.turmaIds.includes(selectedTurmaId)))
      : customSelectedAlunos;

  const parseTemplate = (
    htmlText: string,
    aluno: Aluno,
    validationCode: string,
    validationExpiresAt?: string | null,
  ) => {
    if (!htmlText) return '';
    let parsed = htmlText;

    const today = new Date();
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const dataExtenso = `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;
    const horaAtual = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    const expiresAt = validationExpiresAt ? new Date(validationExpiresAt) : null;
    const validityDays = expiresAt
      ? Math.max(1, Math.ceil((expiresAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
      : null;
    const validadeFormatada = expiresAt
      ? `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`
      : 'Sem vencimento';

    const formatarData = (dataStr?: string) => {
      if (!dataStr) return 'Não informada';
      const dateOnly = dataStr.split('T')[0];
      const parts = dateOnly.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dataStr;
    };

    const getDocumentLabel = (tipoDocumento?: string) => {
      const docType = tipoDocumento || 'RG';
      const upper = docType.toUpperCase();
      if (upper.includes('CNH')) return 'CNH';
      if (upper.includes('CNI') || upper.includes('IDENTIFICAÇÃO') || upper.includes('IDENTIFICACAO') || upper.includes('CIN')) {
        return 'Documento Nacional de Identificação';
      }
      if (upper.includes('PASSAPORTE')) return 'Passaporte';
      if (upper.includes('PROFISSIONAL')) return 'Cart. Profissional';
      return 'RG';
    };

    parsed = parsed.replace(/{{ALUNO_NOME}}/g, aluno.nome.toUpperCase());
    parsed = parsed.replace(/{{ALUNO_CPF}}/g, aluno.cpf || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_DOCUMENTO_TIPO}}/g, getDocumentLabel(aluno.tipoDocumento));
    parsed = parsed.replace(/{{ALUNO_RG}}/g, aluno.rg || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_NASCIMENTO}}/g, formatarData(aluno.nascimento));
    parsed = parsed.replace(/{{ALUNO_MATRICULA}}/g, aluno.matricula || 'Não gerada');
    parsed = parsed.replace(/{{CURSO_NOME}}/g, aluno.curso || '');
    parsed = parsed.replace(/{{TURMA_NOME}}/g, aluno.turmaNome || '');
    parsed = parsed.replace(/{{POLO_NOME}}/g, aluno.poloNome || 'Universo Cursos e Consultoria');
    parsed = parsed.replace(/{{POLO_CNPJ}}/g, aluno.poloCnpj || '');
    parsed = parsed.replace(/{{CIDADE_POLO}}/g, aluno.cidadePolo || 'Aracaju');
    parsed = parsed.replace(/{{DATA_ATUAL}}/g, dataExtenso);
    parsed = parsed.replace(/{{HORA_ATUAL}}/g, horaAtual);
    parsed = parsed.replace(/{{DATA_GERACAO}}/g, `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${horaAtual}`);
    parsed = parsed.replace(
      /{{VALIDADE_DIAS}}/g,
      validityDays === null ? 'Sem vencimento' : String(validityDays),
    );
    parsed = parsed.replace(/{{VALIDADE_DATA}}/g, validadeFormatada);
    parsed = parsed.replace(
      /{{FREQUENCIA_GERAL}}/g,
      frequenciesByStudent[aluno.id] === undefined
        ? 'Não consolidada'
        : `${frequenciesByStudent[aluno.id].toFixed(2).replace('.', ',')}%`
    );

    return parsed;
  };

  const renderA4Pages = () => {
    return rawAlunosParaImprimir.map((aluno, index) => {
      const code = validationCodes[aluno.id] || 'VALIDACAO-PENDENTE';
      const expiresAt = validationExpirations[aluno.id];
      const issuedValidationPublic = validationPublicByStudent[aluno.id] === true;
      const parsedText = parseTemplate(templateConfig.textContent, aluno, code, expiresAt);

      return (
        <div
          key={aluno.id}
          className="print-page w-[210mm] min-h-[297mm] bg-white text-black p-[20mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 relative overflow-hidden text-left"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {/* 1. Marca D'água */}
          {watermark?.watermarkUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <img
                src={watermark.watermarkUrl}
                alt="Watermark"
                style={{
                  opacity: watermark.watermarkOpacity || 0.1,
                  width: `${watermark.watermarkScale || 50}%`,
                  transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
                }}
              />
            </div>
          )}

          {/* 2. Cabeçalho */}
          <DocumentHeader polo={poloInfo} orientation="portrait" />

          {/* Título */}
          <div className="text-center mb-12 relative z-10 mt-6">
            <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
              {documentTitle}
            </h2>
          </div>

          {/* 3. Corpo do Texto */}
          <div className="relative z-20 mb-20 text-justify leading-loose text-lg text-black" dangerouslySetInnerHTML={sanitizedHtml(parsedText)} />

          {/* 4. Campos Absolutos */}
          {templateConfig.absoluteFields?.map((field: any) => {
            const parsedVal = parseTemplate(field.value, aluno, code, expiresAt);
            return (
              <div
                key={field.id}
                className="absolute z-30"
                style={{
                  left: field.x,
                  top: field.y,
                  color: '#000',
                  width: field.width ? `${field.width}px` : 'auto',
                  height: 'auto',
                  ...field.style
                }}
              >
                {field.type === 'qrcode' && issuedValidationPublic && (
                  <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-full aspect-square bg-white flex items-center justify-center mb-1" style={{ width: field.width ? `${field.width}px` : '100px' }}>
                      <LocalQrCodeImage
                        value={getDocumentValidationUrl(code)}
                        size={150}
                        alt="QR Code"
                        className="pointer-events-none h-full w-full"
                      />
                    </div>
                    <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5 select-all">
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
                      <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
                        {code}
                      </p>
                    </div>
                  </div>
                )}

                {field.type === 'image' && (
                  <img
                    src={field.value}
                    alt="Assinatura"
                    className="w-full pointer-events-none"
                    style={{
                      width: field.width ? `${field.width}px` : '200px',
                      height: field.height ? `${field.height}px` : 'auto',
                      objectFit: field.style?.objectFit || 'contain',
                      objectPosition: field.style?.objectPosition || 'center',
                    }}
                  />
                )}

                {field.type === 'text' && (
                  <span dangerouslySetInnerHTML={sanitizedHtml(parsedVal)} className="w-full break-words" />
                )}
              </div>
            );
          })}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando dados acadêmicos...</p>
      </div>
    );
  }

  if (isPrinting && typeof document !== 'undefined') {
    return createPortal(
      <div
        className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950"
        id="print-layout"
        role="dialog"
        aria-modal="true"
        aria-label={`Visualizador: ${documentTitle}`}
      >
        {/* Barra superior de Ações */}
        <div className="z-10 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsPrinting(false)}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              aria-label="Fechar visualizador"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black uppercase tracking-widest text-white">Visualizador de Documentos</h3>
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Emissão: {documentTitle} ({rawAlunosParaImprimir.length} pág.)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-xs"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span>{isDownloading ? 'Gerando...' : 'Download PDF'}</span>
            </button>
            <button
              onClick={() => void triggerBrowserPrint()}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-blue-700 sm:px-6 sm:py-3 sm:text-xs"
            >
              <Printer size={16} /> <span>Imprimir</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-slate-900 p-3 custom-scrollbar sm:p-8">
          <div ref={printContentRef} className="print-content flex min-w-max flex-col items-center">
            {renderA4Pages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #print-layout, #print-layout * {
              visibility: visible;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-layout {
              position: absolute;
              left: 0;
              top: 0;
              width: 210mm !important;
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
            }
            .print-page {
              width: 210mm !important;
              height: 297mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 20mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .print-page img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        `}} />
      </div>,
      document.body,
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-2 md:grid-cols-3">
          <button
            onClick={() => setMode('individual')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'individual' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Search size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Individual</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">Busque um aluno e emita o documento.</p>
            </div>
          </button>
          <button
            onClick={() => setMode('lote')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'lote' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <Users size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Em lote</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">Gere para uma turma ou todos os alunos.</p>
            </div>
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${mode === 'custom' ? 'border-cyan-200 bg-cyan-50 text-cyan-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
          >
            <CreditCard size={20} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Personalizado</p>
              <p className="mt-0.5 text-[11px] font-medium leading-snug">Monte uma lista mista de alunos.</p>
            </div>
          </button>
          </div>
        </div>

      <div className="p-5 md:p-7">
        {mode === 'individual' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declaração Individual</h3>

            <div className="relative mb-8">
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Buscar aluno por nome, CPF ou RG..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-slate-450 hover:text-slate-650 text-xs font-bold uppercase tracking-wider px-3 transition-colors"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={handleSearch}
                  className="bg-[#001a33] text-white px-8 rounded-2xl hover:bg-blue-900 transition-colors shadow-lg"
                >
                  <Search size={20} />
                </button>
              </div>

              {searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                  {alunos
                    .filter((aluno) => matchesAlunoSearch(aluno, searchQuery))
                    .slice(0, 15)
                    .map((aluno) => (
                      <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0">
                        <SecretariaAlunoSearchCard
                          nome={aluno.nome}
                          cpf={aluno.cpf}
                          rg={aluno.rg}
                          cursoNome={aluno.curso}
                          turmaNome={aluno.turmaNome}
                          turmaCodigo={aluno.turmaCodigo}
                          matricula={aluno.matricula}
                          fotoUrl={aluno.fotoUrl}
                          tone="blue"
                          onClick={() => {
                            setSelectedAluno(aluno);
                            setSearchQuery('');
                          }}
                        />
                      </div>
                    ))}
                  {alunos.filter((aluno) => matchesAlunoSearch(aluno, searchQuery)).length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                      Nenhum aluno encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedAluno ? (
              <div className="mb-8 animate-fadeIn animate-duration-300">
                <SecretariaAlunoSearchCard
                  nome={selectedAluno.nome}
                  cpf={selectedAluno.cpf}
                  rg={selectedAluno.rg}
                  cursoNome={selectedAluno.curso}
                  turmaNome={selectedAluno.turmaNome}
                  turmaCodigo={selectedAluno.turmaCodigo}
                  matricula={selectedAluno.matricula}
                  fotoUrl={selectedAluno.fotoUrl}
                  tone="blue"
                  selected
                  statusLabel="Ativo"
                  actionLabel="Trocar"
                  onClick={() => setSelectedAluno(null)}
                />
              </div>
            ) : (
              <div className="border border-slate-150 rounded-3xl p-6 mb-8 text-center text-slate-450 font-bold uppercase text-xs">
                Busque um aluno acima para visualizar seus dados e emitir a declaração.
              </div>
            )}

            <div className="flex flex-col items-center">
              <button
                onClick={handlePrintAction}
                disabled={!selectedAluno || isPreparingValidation}
                className="px-8 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                {isPreparingValidation ? 'Registrando código...' : `Visualizar ${documentTitle}`}
              </button>
            </div>
          </div>
        )}

        {mode === 'lote' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote (Turma)</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                <select
                  value={selectedTurmaId}
                  onChange={(e) => setSelectedTurmaId(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 cursor-pointer font-bold text-slate-700 text-sm"
                >
                  <option value="todos">Todos os Alunos Cadastrados</option>
                  {turmas.map(t => (
                    <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Política do Validador</label>
                <input
                  type="text"
                  value={
                    !validationPublic
                      ? 'Sem validador público'
                      : validationValidityDays === null
                        ? 'Sem vencimento'
                        : `${validationValidityDays} dias`
                  }
                  disabled
                  className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  const nomes = rawAlunosParaImprimir.map(a => `${a.nome} (${a.curso})`).join('\n');
                  alert(`Alunos no lote para impressão:\n\n${nomes}`);
                }}
                className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors"
              >
                Ver Lista de Alunos ({rawAlunosParaImprimir.length})
              </button>
              <button
                onClick={handlePrintAction}
                disabled={rawAlunosParaImprimir.length === 0 || isPreparingValidation}
                className="flex-1 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Completo'}
              </button>
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declarações Personalizadas (Misto)</h3>

            <div className="relative mb-8">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Buscar e Adicionar Alunos</label>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Buscar aluno por nome, CPF ou RG..."
                  value={searchQueryCustom}
                  onChange={(e) => setSearchQueryCustom(e.target.value)}
                  className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                />
                {searchQueryCustom && (
                  <button
                    onClick={() => setSearchQueryCustom('')}
                    className="text-slate-450 hover:text-slate-655 text-xs font-bold uppercase tracking-wider px-3 transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {searchQueryCustom.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                  {alunos
                    .filter((aluno) => matchesAlunoSearch(aluno, searchQueryCustom))
                    .slice(0, 15)
                    .map((aluno) => {
                      const isAdded = customSelectedAlunos.some(x => x.id === aluno.id);
                      return (
                        <div key={aluno.id} className="border-b border-slate-100 p-2 last:border-0">
                          <SecretariaAlunoSearchCard
                            nome={aluno.nome}
                            cpf={aluno.cpf}
                            rg={aluno.rg}
                            cursoNome={aluno.curso}
                            turmaNome={aluno.turmaNome}
                            turmaCodigo={aluno.turmaCodigo}
                            matricula={aluno.matricula}
                            fotoUrl={aluno.fotoUrl}
                            tone="blue"
                            disabled={isAdded}
                            actionLabel={isAdded ? 'Adicionado' : 'Adicionar'}
                            statusLabel={isAdded ? 'Na lista' : undefined}
                            statusTone="neutral"
                            onClick={() => {
                              setCustomSelectedAlunos(prev => [...prev, aluno]);
                              setSearchQueryCustom('');
                            }}
                          />
                        </div>
                      );
                    })}
                  {alunos.filter((aluno) => matchesAlunoSearch(aluno, searchQueryCustom)).length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                      Nenhum aluno encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected students list */}
            <div className="border border-slate-200 rounded-3xl p-6 mb-8 bg-slate-50/20 animate-fadeIn">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Alunos Selecionados ({customSelectedAlunos.length})
                </h4>
                {customSelectedAlunos.length > 0 && (
                  <button
                    onClick={() => setCustomSelectedAlunos([])}
                    className="text-red-500 hover:text-red-700 font-black uppercase text-[10px] tracking-wider transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Esvaziar Lista
                  </button>
                )}
              </div>

              {customSelectedAlunos.length > 0 ? (
                <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {customSelectedAlunos.map((aluno) => (
                    <div
                      key={aluno.id}
                      className="flex items-center justify-between p-4 bg-white border border-slate-150 rounded-2xl shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm overflow-hidden border border-blue-100">
                          {aluno.fotoUrl ? (
                            <img src={aluno.fotoUrl} alt="Foto" className="w-full h-full object-cover" />
                          ) : (
                            aluno.nome[0]
                          )}
                        </div>
                        <div>
                          <span className="block font-black text-slate-800 text-xs uppercase leading-tight">{aluno.nome}</span>
                          <span className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">
                            Matrícula: {aluno.matricula} | {aluno.curso}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setCustomSelectedAlunos(prev => prev.filter(x => x.id !== aluno.id))}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Remover aluno"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-slate-200 border-dashed rounded-2xl p-8 text-center text-slate-450 font-bold uppercase text-xs">
                  Nenhum aluno adicionado à lista. Busque alunos acima para começar a montar o lote de impressão personalizado.
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handlePrintAction}
                disabled={customSelectedAlunos.length === 0 || isPreparingValidation}
                className="w-full py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Personalizado'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default SecretariaDeclaracaoMatriculaPage;
