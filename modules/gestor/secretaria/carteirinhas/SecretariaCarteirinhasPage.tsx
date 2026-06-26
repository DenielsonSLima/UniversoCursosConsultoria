// File: modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx

import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Users, Search, Printer, Image, ArrowLeft, CheckCircle, Loader2, Download, Trash2, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import CarteirinhaPreview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import { carteirinhaService } from '../../cadastros/modelos-documentos/carteirinha/carteirinha.service';
import { parceirosService } from '../../parceiros/parceiros.service';
import { formatMatricula } from '../../../../lib/academicUtils';
import { academicosService } from '../../configuracoes/academicos/academicos.service';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import { poloInstitutionalService } from '../../../shared/polo-institutional/polo-institutional.service';
import { Aluno } from './secretaria-carteirinhas.types';
import { TEMPLATE_DEFAULT, getTechnicalActiveMatricula } from './secretaria-carteirinhas.helpers';

const SecretariaCarteirinhasPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote' | 'custom'>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCustom, setSearchQueryCustom] = useState('');
  const [customSelectedAlunos, setCustomSelectedAlunos] = useState<Aluno[]>([]);
  
  // Real Database Data
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [templateConfig, setTemplateConfig] = useState<any>(TEMPLATE_DEFAULT);
  
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('todos');
  const [validadeGeral, setValidadeGeral] = useState(() => {
    // Valor inicial padrão — será atualizado do Supabase no useEffect
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().split('T')[0];
  });
  
  // Opção de Layout: 'dobra' (5 por folha) ou 'espelhado' (10 por folha duplex)
  const [layoutType, setLayoutType] = useState<'dobra' | 'espelhado'>('dobra');
  
  // Controle do Visualizador de Impressão A4
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingValidation, setIsPreparingValidation] = useState(false);
  const [validationCodes, setValidationCodes] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState(false);
  const printContentRef = useRef<HTMLDivElement>(null);

  // Carrega os alunos e turmas reais do banco de dados (Supabase)
  const loadAcademicoData = async () => {
    try {
      setLoading(true);
      const allAlunos = await parceirosService.getAll('alunos');
      const allTurmas = await parceirosService.getTurmasDisponiveis();
      setTurmas(allTurmas);
      const institutionalPromises = new Map<string, ReturnType<typeof poloInstitutionalService.getByPoloId>>();
      const getInstitutionalData = (poloId?: string) => {
        if (!poloId) return Promise.resolve(null);
        if (!institutionalPromises.has(poloId)) {
          institutionalPromises.set(poloId, poloInstitutionalService.getByPoloId(poloId));
        }
        return institutionalPromises.get(poloId)!;
      };

      const mapped = await Promise.all(
        allAlunos.map(async (p) => {
          const matriculas = await parceirosService.getMatriculas(p.id);
          const technicalActiveMatriculas = getTechnicalActiveMatricula(matriculas);
          const technicalActiveMatricula = technicalActiveMatriculas[0];
          if (!technicalActiveMatricula) return null;

          const turmaIds = technicalActiveMatriculas
            .map((matricula) => matricula.turma_id)
            .filter(Boolean);
          const poloId = technicalActiveMatricula?.turmas?.polo_id || technicalActiveMatricula?.polo_id;
          const institutionalData = await getInstitutionalData(poloId);
          
          return {
            id: p.id,
            enrollmentId: technicalActiveMatricula.id,
            nome: p.nome.toUpperCase(),
            cpf: p.cpf || '',
            rg: p.rg || '',
            nascimento: p.dataNascimento || '',
            matricula: formatMatricula(
              technicalActiveMatricula.id,
              technicalActiveMatricula.data_matricula,
              technicalActiveMatricula.polo_id
            ),
            curso: technicalActiveMatricula.turmas?.cursos?.nome || 'Curso Geral',
            instituicao: 'Universo Cursos e Consultoria',
            validade: (() => {
              // Validade calculada com base nos meses do config — configs já carregados via Supabase no useEffect
              const months = 12; // fallback — será recalculado quando academicosService carregar
              const d = technicalActiveMatricula?.data_matricula
                ? new Date(technicalActiveMatricula.data_matricula)
                : new Date();
              d.setMonth(d.getMonth() + months);
              return d.toLocaleDateString('pt-BR');
            })(),
            fotoUrl: p.foto || null,
            tipoDocumento: p.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
            turmaIds,
            poloRazaoSocial: institutionalData?.razaoSocial,
            poloCnpj: institutionalData?.cnpj,
            poloTelefone: institutionalData?.telefone,
          };
        })
      );

      setAlunos(mapped.filter(Boolean) as Aluno[]);
    } catch (err) {
      console.error('Erro ao carregar dados acadêmicos do banco:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
      try {
        // Carrega configs do Supabase — NUNCA localStorage
        const configs = await academicosService.getConfigs();

        // Atualiza data de validade com base nas configs do Supabase
        const months = configs.validityMonths ?? 12;
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        setValidadeGeral(d.toISOString().split('T')[0]);
      } catch (err) {
        console.error('[SecretariaCarteirinhas] Erro ao carregar config acadêmica:', err);
      } finally {
        setSynced(true);
        loadAcademicoData();
      }
    };
    initData();
  }, []);

  // Carrega o template configurado ativamente no editor
  useEffect(() => {
    if (!synced) return;
    const loadTemplate = async () => {
      try {
        const savedTemplate = await carteirinhaService.getTemplate();
        // Busca cores do Supabase — NUNCA localStorage
        const academicConfigs = await academicosService.getConfigs();

        const mergedTemplate = {
          ...TEMPLATE_DEFAULT,
          ...savedTemplate,
          startNumber: savedTemplate?.startNumber || TEMPLATE_DEFAULT.startNumber,
          bgFrenteUrl: savedTemplate?.bgFrenteUrl || '',
          bgVersoUrl: savedTemplate?.bgVersoUrl || '',
          ocultarDesignPadrao: !!savedTemplate?.ocultarDesignPadrao
        };

        if (academicConfigs.carteirinhaPrimaryColor) mergedTemplate.corPrimaria = academicConfigs.carteirinhaPrimaryColor;
        if (academicConfigs.carteirinhaSecondaryColor) mergedTemplate.corSecundaria = academicConfigs.carteirinhaSecondaryColor;

        setTemplateConfig(mergedTemplate);
      } catch (err) {
        console.error('Erro ao carregar template do serviço:', err);
      }
    };
    loadTemplate();
  }, [synced, isPrinting]); // Recarrega ao abrir o visualizador de impressão

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.toUpperCase();
    const result = alunos.find(a => a.nome.includes(query) || a.cpf.includes(query) || a.rg.includes(query));
    if (result) {
      setSelectedAluno(result);
    } else {
      alert('Nenhum aluno encontrado com essa busca.');
    }
  };

  const handlePrintAction = async () => {
    const targets = mode === 'individual'
      ? (selectedAluno ? [selectedAluno] : [])
      : mode === 'lote'
        ? (selectedTurmaId === 'todos'
            ? alunos
            : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
        : customSelectedAlunos;

    const eligibleTargets = targets.filter((aluno) => aluno.enrollmentId);
    if (!eligibleTargets.length) {
      alert('Nenhuma matrícula válida foi encontrada para gerar os códigos de consulta.');
      return;
    }

    setIsPreparingValidation(true);
    try {
      const expiresAt = new Date(`${validadeGeral}T23:59:59`).toISOString();
      const issues = await Promise.all(
        eligibleTargets.map(async (aluno) => ({
          alunoId: aluno.id,
          issue: await documentValidationService.issue({
            type: 'carteirinha',
            enrollmentId: aluno.enrollmentId!,
            expiresAt,
            registerReissue: true,
          }),
        }))
      );

      setValidationCodes((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.code])),
      }));
      setIsPrinting(true);
    } catch (error) {
      console.error('[SecretariaCarteirinhas] Falha ao registrar emissão:', error);
      alert('Não foi possível registrar os códigos de validação das carteirinhas.');
    } finally {
      setIsPreparingValidation(false);
    }
  };

  const waitForPrintAssets = async () => {
    const container = printContentRef.current;
    if (!container) return;

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

  const triggerBrowserPrint = async () => {
    await waitForPrintAssets();
    window.print();
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
          image.alt === 'Assinatura Diretor';

        if (needsMultiply) {
          dataUrl = await removeWhiteBackground(dataUrl);
        }

        image.src = dataUrl;
        await image.decode().catch(() => undefined);
      } catch (error) {
        console.warn('[SecretariaCarteirinhas] Imagem mantida pela URL original:', source, error);
      }
    }));

    return () => {
      originals.forEach(({ image, src }) => {
        image.src = src;
      });
    };
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
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      pdf.setLineHeightFactor(1.4);

      type PdfTextRun = {
        text: string;
        x: number;
        y: number;
        fontSize: number;
        color?: string;
        fontWeight?: string;
        maxWidth?: number;
        align?: 'left' | 'center' | 'right';
      };

      const parseColorToRgb = (colorStr: string): { r: number; g: number; b: number } | null => {
        if (!colorStr) return null;
        const s = colorStr.trim().toLowerCase();
        
        // Match rgb(r, g, b) or rgba(r, g, b, a)
        const rgbMatch = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
        if (rgbMatch) {
          return {
            r: parseInt(rgbMatch[1], 10),
            g: parseInt(rgbMatch[2], 10),
            b: parseInt(rgbMatch[3], 10)
          };
        }
        
        // Match hex #fff or #ffffff
        if (s.startsWith('#')) {
          const hex = s.substring(1);
          if (hex.length === 3) {
            return {
              r: parseInt(hex[0] + hex[0], 16),
              g: parseInt(hex[1] + hex[1], 16),
              b: parseInt(hex[2] + hex[2], 16)
            };
          }
          if (hex.length === 6 || hex.length === 8) {
            return {
              r: parseInt(hex.substring(0, 2), 16),
              g: parseInt(hex.substring(2, 4), 16),
              b: parseInt(hex.substring(4, 6), 16)
            };
          }
        }
        
        return null;
      };

      const collectPdfTextRuns = (page: HTMLElement): PdfTextRun[] => {
        const pageRect = page.getBoundingClientRect();
        if (!pageRect.width || !pageRect.height) return [];

        const pxToMmX = 210 / pageRect.width;
        const pxToMmY = 297 / pageRect.height;
        const runs: PdfTextRun[] = [];
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);

        while (walker.nextNode()) {
          const textNode = walker.currentNode as Text;
          // Collapse multiple horizontal spaces but preserve newlines (\r and \n)
          const text = textNode.textContent?.replace(/[^\S\r\n]+/g, ' ').trim();
          const parent = textNode.parentElement;
          if (!text || !parent || parent.closest('.print\\:hidden')) continue;

          const computed = window.getComputedStyle(parent);
          if (
            computed.display === 'none' ||
            computed.visibility === 'hidden' ||
            Number.parseFloat(computed.opacity || '1') === 0
          ) continue;

          const range = document.createRange();
          range.selectNodeContents(textNode);
          const rect = range.getBoundingClientRect();
          range.detach();
          if (!rect.width || !rect.height) continue;

          let align: 'left' | 'center' | 'right' = 'left';
          if (computed.textAlign === 'center') align = 'center';
          if (computed.textAlign === 'right') align = 'right';

          let xCo = rect.left;
          if (align === 'center') {
            xCo = rect.left + rect.width / 2;
          } else if (align === 'right') {
            xCo = rect.left + rect.width;
          }

          const textTransform = computed.textTransform || computed.getPropertyValue('text-transform');
          let finalTex = text;
          if (textTransform === 'uppercase') {
            finalTex = finalTex.toUpperCase();
          } else if (textTransform === 'lowercase') {
            finalTex = finalTex.toLowerCase();
          } else if (textTransform === 'capitalize') {
            finalTex = finalTex.replace(/\b\w/g, c => c.toUpperCase());
          }

          runs.push({
            text: finalTex,
            x: Math.max(0, (xCo - pageRect.left) * pxToMmX),
            y: Math.max(0, (rect.top - pageRect.top) * pxToMmY), // Align precisely to the top of the characters block
            fontSize: Math.max(2, Number.parseFloat(computed.fontSize) * 0.75),
            color: computed.color,
            fontWeight: computed.fontWeight,
            maxWidth: rect.width * pxToMmX,
            align: align,
          });
        }

        return runs;
      };

      const addSelectableTextLayer = (runs: PdfTextRun[]) => {
        runs.forEach((run) => {
          pdf.setFontSize(run.fontSize);
          
          let fontStyle = 'normal';
          if (
            run.fontWeight === 'bold' ||
            run.fontWeight === '700' ||
            run.fontWeight === '900' ||
            run.fontWeight === 'black'
          ) {
            fontStyle = 'bold';
          }
          pdf.setFont('helvetica', fontStyle);

          if (run.color) {
            const rgb = parseColorToRgb(run.color);
            if (rgb) {
              pdf.setTextColor(rgb.r, rgb.g, rgb.b);
            } else {
              pdf.setTextColor(30, 41, 59);
            }
          } else {
            pdf.setTextColor(30, 41, 59);
          }

          // Split the text into lines in JavaScript to bypass buggy internal multi-line wrapping of jsPDF in non-pt units
          const maxW = run.maxWidth || 210;
          const lines = pdf.splitTextToSize(run.text, maxW);
          const lineSpacing = run.fontSize * 0.352778 * 1.4; // Convert pt to mm, then apply 1.4 line-height factor

          lines.forEach((line, index) => {
            pdf.text(line, run.x, run.y + index * lineSpacing, {
              align: run.align,
              maxWidth: run.maxWidth,
              baseline: 'top',
            });
          });
        });
      };

      const preparePdfClone = (clonedDocument: Document) => {
        clonedDocument.querySelectorAll<HTMLElement>('.print\\:hidden').forEach((element) => {
          element.style.display = 'none';
        });
        clonedDocument.querySelectorAll<HTMLElement>('.print-page').forEach((page) => {
          page.style.margin = '0';
          page.style.boxShadow = 'none';
          page.style.border = 'none';
        });
        clonedDocument.querySelectorAll<HTMLElement>('.carteirinha-render-root').forEach((card) => {
          card.style.fontFamily = 'Arial, Helvetica, sans-serif';
          card.style.fontKerning = 'none';
          card.style.fontVariantLigatures = 'none';
          card.style.textRendering = 'geometricPrecision';
          card.style.setProperty('-webkit-font-smoothing', 'antialiased');
          card.style.transition = 'none';
          card.style.animation = 'none';

          card.querySelectorAll<HTMLElement>('*').forEach((element) => {
            element.style.fontFamily = 'Arial, Helvetica, sans-serif';
            element.style.fontKerning = 'none';
            element.style.fontVariantLigatures = 'none';
            element.style.animation = 'none';
            element.style.transition = 'none';

            const computed = clonedDocument.defaultView?.getComputedStyle(element);
            if (
              computed &&
              computed.lineHeight === 'normal' &&
              Number.parseFloat(computed.fontSize) > 0
            ) {
              element.style.lineHeight = '1.05';
            }

            // Hide text visually in html2canvas capture to avoid double rendering
            let hasTextNode = false;
            for (let i = 0; i < element.childNodes.length; i++) {
              if (
                element.childNodes[i].nodeType === Node.TEXT_NODE &&
                element.childNodes[i].textContent?.trim()
              ) {
                hasTextNode = true;
                break;
              }
            }
            if (hasTextNode && element.tagName !== 'IMG') {
              element.style.color = 'transparent';
            }
          });
        });
      };

      const capturePage = async (page: HTMLElement) => {
        const rect = page.getBoundingClientRect();
        const options = {
          backgroundColor: '#ffffff',
          scale: 3,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 20000,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          windowWidth: Math.round(rect.width),
          windowHeight: Math.round(rect.height),
          scrollX: 0,
          scrollY: 0,
          onclone: preparePdfClone,
        };

        return html2canvas(page, options);
      };

      for (let index = 0; index < pages.length; index += 1) {
        const textRuns = collectPdfTextRuns(pages[index]);
        const canvas = await capturePage(pages[index]);
        const dataUrl = canvas.toDataURL('image/png');

        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        addSelectableTextLayer(textRuns);
      }

      pdf.save(`carteirinhas-${layoutType}.pdf`);
    } catch (error) {
      console.error('[SecretariaCarteirinhas] Erro ao gerar download:', error);
      alert('Não foi possível gerar o PDF. Verifique se todos os arquivos do modelo estão acessíveis.');
    } finally {
      restoreImages();
      setIsDownloading(false);
    }
  };

  // Divide um array de alunos em páginas contendo no máximo N elementos
  const chunkArray = (array: any[], size: number) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  };

  const rawAlunosParaImprimir = mode === 'individual' 
    ? (selectedAluno ? [selectedAluno] : [])
    : mode === 'lote'
      ? (selectedTurmaId === 'todos' 
          ? alunos 
          : alunos.filter(a => a.turmaIds && a.turmaIds.includes(selectedTurmaId)))
      : customSelectedAlunos;

  // Processa os alunos adicionando o número sequencial inicial e a validade geral
  const startNum = templateConfig.startNumber || 1000;
  const alunosParaImprimir = rawAlunosParaImprimir.map((aluno, index) => {
    const parts = validadeGeral.split('-');
    const validadeFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : aluno.validade;
    return {
      ...aluno,
      // Se o aluno tiver matrícula cadastrada (não PENDENTE), usa ela, senão gera a sequencial
      matricula: aluno.matricula && aluno.matricula !== 'PENDENTE' && aluno.matricula !== 'CIE-PENDENTE'
        ? aluno.matricula 
        : `CIE-${startNum + index}`,
      validade: validadeFormatada,
      validationCode: validationCodes[aluno.id]
    };
  });

  // Lógica de Renderização do Lote 10 por Folha Espelhado
  const renderEspelhadoPages = () => {
    const lotes = chunkArray(alunosParaImprimir, 10);

    return lotes.map((loteAlunos, indexLote) => {
      const gridAlunos = [...loteAlunos];
      while (gridAlunos.length < 10) {
        gridAlunos.push(null as any);
      }

      const linhasFrentes = [];
      for (let l = 0; l < 5; l++) {
        linhasFrentes.push([gridAlunos[l * 2], gridAlunos[l * 2 + 1]]);
      }

      const linhasVersos = [];
      for (let l = 0; l < 5; l++) {
        linhasVersos.push([gridAlunos[l * 2 + 1], gridAlunos[l * 2]]);
      }

      return (
        <React.Fragment key={indexLote}>
          {/* PÁGINA DE FRENTES */}
          <div className="print-page w-[210mm] h-[297mm] bg-white text-black p-[5mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 relative overflow-hidden">
            <div className="print-card-grid grid grid-cols-2 grid-rows-5 gap-y-[1.5mm] gap-x-[3mm] justify-items-center items-center">
              {gridAlunos.map((aluno, i) => (
                <div 
                  key={`frente-${i}`} 
                  className="w-[85.6mm] h-[54mm] relative overflow-hidden border border-slate-200 rounded-[2.5mm] shadow-sm flex items-center justify-center bg-slate-50"
                >
                  {aluno ? (
                    <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                  ) : (
                    <div className="text-[10px] text-slate-350 font-bold uppercase tracking-widest">Espaço Vazio</div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Lote de Impressão #{indexLote + 1} — FRENTES (Começando em {startNum})</span>
              <span>Padrão CR80 (2 colunas x 5 linhas)</span>
            </div>
          </div>

          {/* PÁGINA DE VERSOS (ESPELHADO) */}
          <div className="print-page w-[210mm] h-[297mm] bg-white text-black p-[5mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 relative overflow-hidden">
            <div className="print-card-grid grid grid-cols-2 grid-rows-5 gap-y-[1.5mm] gap-x-[3mm] justify-items-center items-center">
              {linhasVersos.flatMap((par) => par).map((aluno, i) => (
                <div 
                  key={`verso-${i}`} 
                  className="w-[85.6mm] h-[54mm] relative overflow-hidden border border-slate-200 rounded-[2.5mm] shadow-sm flex items-center justify-center bg-slate-50"
                >
                  {aluno ? (
                    <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                  ) : (
                    <div className="text-[10px] text-slate-350 font-bold uppercase tracking-widest">Espaço Vazio</div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Lote de Impão #{indexLote + 1} — VERSOS ESPELHADOS</span>
              <span>Posicionamento invertido horizontalmente para alinhamento duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  // Lógica de Renderização do Lote Dobra Manual
  const renderDobraPages = () => {
    const lotes = chunkArray(alunosParaImprimir, 5);

    return lotes.map((loteAlunos, indexLote) => {
      return (
        <div key={indexLote} className="print-page w-[210mm] h-[297mm] bg-white text-black p-[5mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
            {loteAlunos.map((aluno, i) => (
              <div 
                key={`dobra-${i}`} 
                className="flex items-center justify-center w-full relative"
              >
                {/* Par Frente e Verso conectado */}
                <div className="flex border border-slate-300 rounded-[2.5mm] overflow-hidden shadow-sm relative">
                  {/* Frente */}
                  <div className="w-[85.6mm] h-[54mm] relative border-r border-dashed border-slate-455">
                    <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                    {/* Guia de Dobra vertical */}
                    <div className="absolute top-0 bottom-0 right-0 w-px border-r border-dashed border-slate-400 z-20 pointer-events-none"></div>
                  </div>
                  {/* Verso */}
                  <div className="w-[85.6mm] h-[54mm] relative">
                    <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                  </div>
                </div>

                <div className="absolute left-4 text-[7px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none print:hidden flex items-center gap-1">
                  <span># {i + 1} (CIE-{startNum + (indexLote * 5) + i})</span>
                  <span className="text-[5px] bg-slate-100 text-slate-500 rounded px-1">Dobra</span>
                </div>
              </div>
            ))}

            {/* Espaços vazios complementares se o lote tiver menos de 5 */}
            {loteAlunos.length < 5 && Array.from({ length: 5 - loteAlunos.length }).map((_, emptyIndex) => (
              <div 
                key={`empty-${emptyIndex}`}
                className="flex items-center justify-center w-[171.2mm] h-[54mm] border-2 border-dashed border-slate-150 rounded-[2.5mm] mx-auto bg-slate-50/50 text-[10px] text-slate-300 font-bold uppercase tracking-widest animate-fadeIn"
              >
                Espaço Disponível
              </div>
            ))}
          </div>

          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Lote de Impressão #{indexLote + 1} — DOBRA MANUAL (Início: {startNum})</span>
            <span>Rendimento: 5 conjuntos Frente + Verso por folha A4</span>
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-purple-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando alunos e turmas...</p>
      </div>
    );
  }

  if (isPrinting) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[9999] overflow-y-auto custom-scrollbar flex flex-col" id="print-layout">
        
        {/* Barra superior de Ações (Oculta na Impressão Física) */}
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Visualizador de Impressão A4</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Layout: {layoutType === 'dobra' ? 'Dobra Lateral (5 por Folha)' : 'Frente e Verso Espelhado (10 por Folha)'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all border border-white/15 disabled:opacity-60"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {isDownloading ? 'Gerando...' : 'Fazer Download'}
            </button>
            <button 
              onClick={triggerBrowserPrint}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-purple-900/30"
            >
              <Printer size={16} /> Confirmar Impressão
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div className="bg-purple-950/70 border border-purple-800 p-4 rounded-2xl max-w-[210mm] w-full text-white mb-8 flex items-center justify-between gap-4 print:hidden animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-900 text-purple-300 rounded-lg">
                <Printer size={20} />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">Dica de Configuração de Impressão</h4>
                <p className="text-[10px] text-purple-300 leading-normal font-medium mt-1">
                  A folha já está configurada em A4 sem margens. O PNG do modelo agora é impresso como imagem real, sem depender da opção “Imprimir fundos” do navegador.
                </p>
              </div>
            </div>
          </div>

          <div ref={printContentRef} className="print-content flex flex-col items-center">
            {layoutType === 'dobra' ? renderDobraPages() : renderEspelhadoPages()}
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
              padding: 5mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .print-card-grid {
              display: grid !important;
              grid-template-columns: repeat(2, 85.6mm) !important;
              grid-template-rows: repeat(5, 54mm) !important;
              column-gap: 3mm !important;
              row-gap: 1.5mm !important;
              justify-content: center !important;
              align-content: start !important;
            }
            .print-fold-grid {
              display: grid !important;
              grid-template-rows: repeat(5, 54mm) !important;
              row-gap: 1.5mm !important;
              align-content: start !important;
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
      </div>
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
                  <p className="mt-0.5 text-[11px] font-medium leading-snug">Busque um aluno e gere uma carteirinha.</p>
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
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Carteirinha Individual</h3>
                
                <div className="relative mb-8">
                    <div className="flex gap-4">
                        <input 
                            type="text" 
                            placeholder="Buscar aluno por nome, CPF ou RG..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 text-slate-750 font-medium"
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
                          className="bg-purple-600 text-white px-8 rounded-2xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-900/20"
                        >
                            <Search size={20} />
                        </button>
                    </div>

                    {searchQuery.trim().length > 0 && (
                      <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                        {alunos
                          .filter(a => 
                            a.nome.toUpperCase().includes(searchQuery.toUpperCase()) || 
                            (a.cpf && a.cpf.includes(searchQuery)) || 
                            (a.rg && a.rg.includes(searchQuery))
                          )
                          .slice(0, 15)
                          .map((aluno) => (
                            <button
                              key={aluno.id}
                              onClick={() => {
                                setSelectedAluno(aluno);
                                setSearchQuery('');
                              }}
                              className="w-full text-left px-6 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                            >
                              <div>
                                <span className="block font-black text-slate-800 text-xs uppercase">{aluno.nome}</span>
                                <span className="block text-[10px] text-slate-450 font-semibold uppercase mt-0.5">
                                  CPF: {aluno.cpf} | RG: {aluno.rg} | Curso: {aluno.curso}
                                </span>
                              </div>
                              <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                                Selecionar
                              </span>
                            </button>
                          ))}
                        {alunos.filter(a => 
                          a.nome.toUpperCase().includes(searchQuery.toUpperCase()) || 
                          (a.cpf && a.cpf.includes(searchQuery)) || 
                          (a.rg && a.rg.includes(searchQuery))
                        ).length === 0 && (
                          <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                            Nenhum aluno encontrado
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* Exibição do Aluno Encontrado */}
                {selectedAluno ? (
                  <div className="border border-slate-150 rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/40 animate-fadeIn">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-black text-xl overflow-hidden border border-purple-200">
                        {selectedAluno.fotoUrl ? (
                          <img src={selectedAluno.fotoUrl} alt="Foto do Aluno" className="w-full h-full object-cover" />
                        ) : (
                          selectedAluno.nome[0]
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-sm uppercase">{selectedAluno.nome}</h4>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">
                          Matrícula: {selectedAluno.matricula && selectedAluno.matricula !== 'PENDENTE' && selectedAluno.matricula !== 'CIE-PENDENTE' 
                            ? selectedAluno.matricula 
                            : `CIE-${startNum}`}
                        </p>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{selectedAluno.curso}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black ${selectedAluno.fotoUrl ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} px-3 py-1 rounded-md uppercase tracking-wider flex items-center gap-1`}>
                      {selectedAluno.fotoUrl ? (
                        <>
                          <CheckCircle size={12} /> Foto Cadastrada
                        </>
                      ) : (
                        'Sem Foto Cadastrada'
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-3xl p-6 mb-8 text-center text-slate-450 font-bold uppercase text-xs">
                    Busque um aluno acima para visualizar seus dados e emitir a carteirinha.
                  </div>
                )}

                {/* Seleção do Layout de Impressão */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Escolha o Layout de Impressão</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'dobra' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('dobra')}
                    >
                      <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Dobra Lateral (5 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Imprime frentes e versos colados na mesma página A4. Excelente para recorte e dobra ao meio.</span>
                      </div>
                    </label>

                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'espelhado' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('espelhado')}
                    >
                      <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Frente / Verso Real (10 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Gera uma folha de Frentes e outra de Versos espelhados. Ideal para impressora frente/verso (duplex).</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center bg-slate-50/50">
                    <div className="w-[85.6mm] h-[54mm] bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg mb-6 relative overflow-hidden flex items-center justify-center text-white shrink-0">
                      <CreditCard size={48} className="opacity-20 absolute -right-4 -bottom-4 rotate-12 scale-150" />
                      <div className="text-center z-10 p-4">
                        <p className="text-[7px] font-black uppercase tracking-widest opacity-80">Visualização do Modelo</p>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mt-1">{selectedAluno?.nome || 'SELECIONE UM ALUNO'}</h4>
                        <p className="text-[8px] font-bold opacity-90 mt-0.5">{selectedAluno ? `CIE-${startNum}` : '-'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handlePrintAction}
                      disabled={!selectedAluno || isPreparingValidation}
                      className="px-8 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPreparingValidation ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                        {isPreparingValidation ? 'Registrando códigos...' : 'Abrir Visualização de Impressão A4'}
                    </button>
                </div>
            </div>
        )}

        {mode === 'lote' && (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                        <select 
                          value={selectedTurmaId}
                          onChange={(e) => setSelectedTurmaId(e.target.value)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 cursor-pointer font-bold text-slate-700"
                        >
                            <option value="todos">Todos os Alunos Cadastrados</option>
                            {turmas.map(t => (
                              <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Validade Geral</label>
                        <input 
                          type="date" 
                          value={validadeGeral}
                          onChange={(e) => setValidadeGeral(e.target.value)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-slate-700" 
                        />
                    </div>
                </div>

                {/* Seleção do Layout de Impressão */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Escolha o Layout de Impressão</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'dobra' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('dobra')}
                    >
                      <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Dobra Lateral (5 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Imprime frentes e versos colados na mesma página. Ideal para corte e dobra.</span>
                      </div>
                    </label>

                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'espelhado' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('espelhado')}
                    >
                      <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Frente / Verso Real (10 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Gera páginas separadas de Frentes e Versos com espelhamento. Perfeito para impressoras duplex.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 mb-8 flex items-start gap-4">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0 mt-0.5">
                      <Image size={20} />
                    </div>
                    <div>
                        <h4 className="font-black text-purple-900 text-sm uppercase">Verificação de Fotos da Turma</h4>
                        <p className="text-xs text-purple-700 leading-relaxed font-semibold mt-1">
                            O lote selecionado possui {alunosParaImprimir.length} alunos cadastrados ativos. Destes, {alunosParaImprimir.filter(a => a.fotoUrl).length} possuem foto de perfil cadastrada e validada no sistema.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={() => {
                        const nomes = alunosParaImprimir.map(a => `${a.nome} (${a.fotoUrl ? 'COM FOTO' : 'SEM FOTO'})`).join('\n');
                        alert(`Alunos no lote para impressão:\n\n${nomes}`);
                      }}
                      className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors"
                    >
                        Ver Lista de Alunos ({alunosParaImprimir.length})
                    </button>
                    <button 
                      onClick={handlePrintAction}
                      disabled={alunosParaImprimir.length === 0 || isPreparingValidation}
                      className="flex-1 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                        {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Completo'}
                    </button>
                </div>
            </div>
        )}

        {mode === 'custom' && (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Carteirinhas Personalizadas (Misto)</h3>
                
                <div className="relative mb-8">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Buscar e Adicionar Alunos</label>
                    <div className="flex gap-4">
                        <input 
                            type="text" 
                            placeholder="Buscar aluno por nome, CPF ou RG..."
                            value={searchQueryCustom}
                            onChange={(e) => setSearchQueryCustom(e.target.value)}
                            className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 text-slate-750 font-medium"
                        />
                        {searchQueryCustom && (
                          <button
                            onClick={() => setSearchQueryCustom('')}
                            className="text-slate-450 hover:text-slate-650 text-xs font-bold uppercase tracking-wider px-3 transition-colors"
                          >
                            Limpar
                          </button>
                        )}
                    </div>

                    {searchQueryCustom.trim().length > 0 && (
                      <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                        {alunos
                          .filter(a => 
                            a.nome.toUpperCase().includes(searchQueryCustom.toUpperCase()) || 
                            (a.cpf && a.cpf.includes(searchQueryCustom)) || 
                            (a.rg && a.rg.includes(searchQueryCustom))
                          )
                          .slice(0, 15)
                          .map((aluno) => {
                            const isAdded = customSelectedAlunos.some(x => x.id === aluno.id);
                            return (
                              <button
                                key={aluno.id}
                                disabled={isAdded}
                                onClick={() => {
                                  setCustomSelectedAlunos(prev => [...prev, aluno]);
                                  setSearchQueryCustom('');
                                }}
                                className={`w-full text-left px-6 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0 ${isAdded ? 'opacity-50 cursor-not-allowed bg-slate-50/30' : ''}`}
                              >
                                <div>
                                  <span className="block font-black text-slate-800 text-xs uppercase">{aluno.nome}</span>
                                  <span className="block text-[10px] text-slate-450 font-semibold uppercase mt-0.5">
                                    CPF: {aluno.cpf} | RG: {aluno.rg} | Curso: {aluno.curso}
                                  </span>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${isAdded ? 'bg-slate-150 text-slate-400' : 'bg-purple-50 text-purple-600'}`}>
                                  {isAdded ? 'Adicionado' : 'Adicionar'}
                                </span>
                              </button>
                            );
                          })}
                        {alunos.filter(a => 
                          a.nome.toUpperCase().includes(searchQueryCustom.toUpperCase()) || 
                          (a.cpf && a.cpf.includes(searchQueryCustom)) || 
                          (a.rg && a.rg.includes(searchQueryCustom))
                        ).length === 0 && (
                          <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                            Nenhum aluno encontrado
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* Validade Geral input */}
                <div className="mb-8">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Validade Geral</label>
                    <input 
                      type="date" 
                      value={validadeGeral}
                      onChange={(e) => setValidadeGeral(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-slate-700" 
                    />
                </div>

                {/* List of selected students */}
                <div className="border border-slate-200 rounded-3xl p-6 mb-8 bg-slate-50/20">
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
                      {customSelectedAlunos.map((aluno, index) => (
                        <div 
                          key={aluno.id}
                          className="flex items-center justify-between p-4 bg-white border border-slate-150 rounded-2xl shadow-sm hover:shadow-md transition-all animate-fadeIn"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center font-black text-sm overflow-hidden border border-purple-100">
                              {aluno.fotoUrl ? (
                                <img src={aluno.fotoUrl} alt="Foto do Aluno" className="w-full h-full object-cover" />
                              ) : (
                                aluno.nome[0]
                              )}
                            </div>
                            <div>
                              <span className="block font-black text-slate-800 text-xs uppercase leading-tight">{aluno.nome}</span>
                              <span className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">
                                Matrícula: {aluno.matricula && aluno.matricula !== 'PENDENTE' && aluno.matricula !== 'CIE-PENDENTE' 
                                  ? aluno.matricula 
                                  : `CIE-${startNum + index}`} | {aluno.curso}
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

                {/* Seleção do Layout de Impressão */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Escolha o Layout de Impressão</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'dobra' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('dobra')}
                    >
                      <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Dobra Lateral (5 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Imprime frentes e versos colados na mesma página. Ideal para corte e dobra.</span>
                      </div>
                    </label>

                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'espelhado' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('espelhado')}
                    >
                      <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Frente / Verso Real (10 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Gera páginas separadas de Frentes e Versos com espelhamento. Perfeito para impressoras duplex.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={handlePrintAction}
                      disabled={customSelectedAlunos.length === 0 || isPreparingValidation}
                      className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

export default SecretariaCarteirinhasPage;
