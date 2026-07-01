import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { getBlocks, getTemplateBackgroundUrl } from '../../../cadastros/modelos-documentos/diploma/components/DiplomaPreview';
import { CertificadoAcademico } from '../certificados.types';
import { assinaturasService, AssinaturasData } from '../../../configuracoes/assinaturas/assinaturas.service';
import { getDocumentValidationQrUrl, getDocumentValidationUrl } from '../../../../shared/document-validation/document-validation.url';

interface CertificadoPreviewProps {
  certificado: CertificadoAcademico;
  modelo?: any;
  gradeCurricular?: string;
  pdfMode?: boolean;
}

const highlightApprovalStatus = (html: string) =>
  String(html || '').replace(
    /\s*-\s*Aprovado\b/gi,
    '<br /><br /><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#001a33;color:#ffffff;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;">APROVADO</span>'
  );

const parseProgrammaticRows = (content: string) => {
  const plain = String(content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');

  return plain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^conte[uú]do program[aá]tico:?$/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return null;

      return {
        nome: parts[0],
        carga: parts[1] || '',
        status: parts.slice(2).join(' - '),
      };
    })
    .filter(Boolean) as Array<{ nome: string; carga: string; status: string }>;
};

const getTechnicalCourseTitle = (courseName?: string | null) => {
  const normalized = String(courseName || '').trim();
  if (!normalized) return 'TÉCNICO EM __________________';
  const title = /^t[eé]cnico\s+em\s+/i.test(normalized)
    ? normalized
    : `Técnico em ${normalized}`;
  return title.toLocaleUpperCase('pt-BR');
};

const inferTechnologicalAxis = (certificado: CertificadoAcademico) => {
  const configured = certificado.curso?.ead_config?.eixo_tecnologico || certificado.curso?.ead_config?.eixoTecnologico;
  if (configured) return String(configured).toLocaleLowerCase('pt-BR');

  const courseContext = `${certificado.curso?.nome || ''} ${certificado.curso?.area || ''}`;
  if (/enfermagem|radiologia|sa[uú]de|odont|farm[aá]cia/i.test(courseContext)) {
    return 'ambiente e saúde';
  }

  return '________________';
};

const replaceVars = (text: string, certificado: CertificadoAcademico, extraVars: Record<string, string> = {}) => {
  const formatCertDate = (date?: string | null) =>
    date ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR') : '';
  const formatCertDateLong = (date?: string | null) =>
    date
      ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  const dataInicio = formatCertDate(certificado.data_inscricao);
  const dataFim = formatCertDate(certificado.data_conclusao);
  const dataFimExtenso = formatCertDateLong(certificado.data_conclusao);
  const vars: Record<string, string> = {
    nome_aluno: certificado.aluno?.nome || '',
    cpf: certificado.aluno?.cpf_cnpj || '',
    curso_nome: certificado.curso?.nome || '',
    curso_titulo: getTechnicalCourseTitle(certificado.curso?.nome),
    carga_horaria: String(certificado.curso?.carga_horaria || ''),
    rg: certificado.aluno?.rg || '________________',
    naturalidade: certificado.aluno?.naturalidade || '________________',
    data_nascimento: formatCertDate(certificado.aluno?.data_nascimento) || '________________',
    eixo_tecnologico: inferTechnologicalAxis(certificado),
    cidade: certificado.polo?.cidade || 'Não informado',
    uf: certificado.polo?.estado || 'Não informado',
    cidade_uf: `${certificado.polo?.cidade || 'Não informado'}/${certificado.polo?.estado || 'Não informado'}`,
    data_inicio: dataInicio,
    data_fim: dataFim,
    periodo: dataInicio && dataFim ? `${dataInicio} até ${dataFim}` : dataFim,
    data_conclusao: dataFim,
    data_conclusao_extenso: dataFimExtenso || dataFim,
    grade_curricular: 'Grade curricular conforme histórico acadêmico do aluno.',
    livro_registro: `Certificado Expedido N° ${certificado.certificado_numero || '____'} · Página ${certificado.pagina_livro || '____'} · Livro ${certificado.livro_registro || '____'}`,
    certificado_numero: certificado.certificado_numero || '____',
    codigo_certificado: certificado.codigo_validacao || certificado.certificado_numero || '____',
    pagina_livro: certificado.pagina_livro || '____',
    livro: certificado.livro_registro || '____',
    validacao_sistec: certificado.validacao_sistec || '________________',
    ensino_medio_estabelecimento: certificado.ensino_medio_estabelecimento || 'Não informado',
    ensino_medio_localidade_uf: certificado.ensino_medio_localidade_uf || 'Não informado',
    ensino_medio_ano_conclusao: certificado.ensino_medio_ano_conclusao || 'Não informado',
    url_validacao: getDocumentValidationUrl(certificado.codigo_validacao || ''),
  };

  const mergedVars = { ...vars, ...extraVars };

  const parsed = Object.entries(mergedVars).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), `<strong>${value}</strong>`),
    text || ''
  );

  return highlightApprovalStatus(parsed);
};

const replaceVarsPlain = (text: string, certificado: CertificadoAcademico, extraVars: Record<string, string> = {}) => {
  const formatCertDate = (date?: string | null) =>
    date ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR') : '';
  const formatCertDateLong = (date?: string | null) =>
    date
      ? new Date(date.includes('T') ? date : `${date}T12:00:00`).toLocaleDateString('pt-BR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  const dataInicio = formatCertDate(certificado.data_inscricao);
  const dataFim = formatCertDate(certificado.data_conclusao);
  const dataFimExtenso = formatCertDateLong(certificado.data_conclusao);
  const vars: Record<string, string> = {
    nome_aluno: certificado.aluno?.nome || '',
    cpf: certificado.aluno?.cpf_cnpj || '',
    curso_nome: certificado.curso?.nome || '',
    curso_titulo: getTechnicalCourseTitle(certificado.curso?.nome),
    carga_horaria: String(certificado.curso?.carga_horaria || ''),
    rg: certificado.aluno?.rg || '________________',
    naturalidade: certificado.aluno?.naturalidade || '________________',
    data_nascimento: formatCertDate(certificado.aluno?.data_nascimento) || '________________',
    eixo_tecnologico: inferTechnologicalAxis(certificado),
    cidade: certificado.polo?.cidade || 'Não informado',
    uf: certificado.polo?.estado || 'Não informado',
    cidade_uf: `${certificado.polo?.cidade || 'Não informado'}/${certificado.polo?.estado || 'Não informado'}`,
    data_inicio: dataInicio,
    data_fim: dataFim,
    periodo: dataInicio && dataFim ? `${dataInicio} até ${dataFim}` : dataFim,
    data_conclusao: dataFim,
    data_conclusao_extenso: dataFimExtenso || dataFim,
    grade_curricular: 'Grade curricular conforme histórico acadêmico do aluno.',
    certificado_numero: certificado.certificado_numero || '____',
    codigo_certificado: certificado.codigo_validacao || certificado.certificado_numero || '____',
    pagina_livro: certificado.pagina_livro || '____',
    livro: certificado.livro_registro || '____',
    validacao_sistec: certificado.validacao_sistec || '________________',
    ensino_medio_estabelecimento: certificado.ensino_medio_estabelecimento || 'Não informado',
    ensino_medio_localidade_uf: certificado.ensino_medio_localidade_uf || 'Não informado',
    ensino_medio_ano_conclusao: certificado.ensino_medio_ano_conclusao || 'Não informado',
    url_validacao: getDocumentValidationUrl(certificado.codigo_validacao || ''),
  };

  return Object.entries({ ...vars, ...extraVars }).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), value),
    text || ''
  );
};

const CertificadoPreview: React.FC<CertificadoPreviewProps> = ({ certificado, modelo, gradeCurricular, pdfMode = false }) => {
  const isTecnico = certificado.modalidade === 'TECNICO';
  const validationUrl = getDocumentValidationUrl(certificado.codigo_validacao || '');
  const [assinaturas, setAssinaturas] = useState<AssinaturasData>(() => assinaturasService.getSignaturesSync());
  const templateVars = {
    grade_curricular: gradeCurricular || 'Grade curricular conforme histórico acadêmico do aluno.',
    diretoria_geral_nome: assinaturas.diretoriaGeralNome || '________________',
    diretoria_geral_cargo: assinaturas.diretoriaGeralCargo || 'Diretora Geral',
    secretaria_nome: assinaturas.secretariaNome || '________________',
    secretaria_cargo: assinaturas.secretariaCargo || 'Secretária Escolar',
  };

  useEffect(() => {
    void assinaturasService.getSignatures().then((data) => {
      setAssinaturas(data);
    }).catch(() => {
      setAssinaturas(assinaturasService.getSignaturesSync());
    });
  }, []);

  const getSignatureUrl = (block: any) => {
    if (!block.signatureSource || block.signatureSource === 'none') {
      return block.signatureImageUrl || '';
    }
    if (block.signatureSource === 'manual') {
      return block.signatureImageUrl || '';
    }
    return assinaturas[block.signatureSource as keyof AssinaturasData] || '';
  };

  const frontText = modelo?.textoFrente
    || 'Certificamos que <strong>{{nome_aluno}}</strong>, CPF {{cpf}}, concluiu o curso <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} horas, em {{data_conclusao}}.';

  const renderBlock = (block: any) => {
    switch (block.type) {
      case 'logo':
        return (
          <div style={{ width: block.width || 96, height: block.width || 96 }} className="flex items-center justify-center rounded-full bg-[#001a33] text-white">
            <Award size={Math.max(28, Math.round((block.width || 96) * 0.38))} />
          </div>
        );
      case 'text':
        return (
          <div
            style={{
              width: block.width || 650,
              color: block.color || modelo?.corTexto || '#1e293b',
              fontSize: block.fontSize || 16,
              fontFamily: block.fontFamily || 'serif',
              fontWeight: block.fontWeight || '400',
              textAlign: block.textAlign || 'center',
              lineHeight: block.lineHeight ?? (block.id === 'texto' ? 1.8 : 1.2),
              textTransform: ['titulo', 'subtitulo', 'cidadeData'].includes(block.id) ? 'uppercase' : 'none',
              letterSpacing: block.id === 'subtitulo' ? '0.3em' : 0,
            }}
            dangerouslySetInnerHTML={{ __html: replaceVars(block.content || '', certificado, templateVars) }}
          />
        );
      case 'signature': {
        const signatureUrl = getSignatureUrl(block);
        const signatureBlend = block.signatureBlend !== false ? 'multiply' : 'normal';
        const signatureLabelFontSize = Number(block.signatureLabelFontSize || 10);
        const signatureNameFontSize = Number(block.signatureNameFontSize || signatureLabelFontSize + 1);
        const signatureImageOffsetY = Number(block.signatureImageOffsetY || 0);
        const hasSeparateSignatureImage = currentPageBlocks.some((item: any) => item.type === 'signatureImage' && item.signatureBlockId === block.id);
        const signerNameHtml = block.signerNameContent ? replaceVars(block.signerNameContent, certificado, templateVars) : '';
        const signerTitleHtml = replaceVars(block.title || 'Assinatura', certificado, templateVars);
        return (
          <div style={{ width: block.width || 256 }} className="text-center flex flex-col items-center justify-end">
            {!hasSeparateSignatureImage && (
              <div className="flex h-[58px] w-full items-end justify-center overflow-visible">
                {signatureUrl ? (
                  <img
                    src={signatureUrl}
                    alt={block.title || 'Assinatura'}
                    className="w-full object-contain pointer-events-none"
                    style={{
                      maxHeight: '58px',
                      mixBlendMode: signatureBlend,
                      transform: `translateY(${signatureImageOffsetY}px)`,
                    }}
                  />
                ) : null}
              </div>
            )}
            <div className="w-full border-t border-slate-400 pt-[1px]">
              {signerNameHtml && (
                <p
                  className="font-black uppercase leading-tight text-slate-800"
                  style={{ fontSize: `${signatureNameFontSize}px` }}
                  dangerouslySetInnerHTML={{ __html: signerNameHtml }}
                />
              )}
              <p
                className="font-black uppercase tracking-widest leading-tight text-slate-800"
                style={{ fontSize: `${signatureLabelFontSize}px` }}
                dangerouslySetInnerHTML={{ __html: signerTitleHtml }}
              />
            </div>
          </div>
        );
      }
      case 'signatureImage': {
        const signatureImageUrl = getSignatureUrl(block);
        const signatureImageBlend = block.signatureBlend !== false ? 'multiply' : undefined;
        return signatureImageUrl ? (
          <img
            src={signatureImageUrl}
            alt={block.label || 'Assinatura'}
            className="object-contain pointer-events-none"
            style={{
              width: block.width || 220,
              maxHeight: 90,
              mixBlendMode: signatureImageBlend,
            }}
          />
        ) : null;
      }
      case 'line':
        return (
          <div
            style={{
              width: block.width || 260,
              borderTop: `${block.borderWidth || 1}px solid ${block.color || modelo?.corTexto || '#1e293b'}`,
            }}
          />
        );
      case 'qrcode': {
        const size = block.width || 170;
        if (block.id === 'qrcode') {
          return (
            <div style={{ width: size }} className="rounded border border-slate-200 bg-white/90 p-2 text-center shadow-sm">
              <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Código de Autenticidade</p>
              <p className="mt-1 break-all font-mono text-[9px] font-black text-[#001a33]">{certificado.codigo_validacao || 'Gerado após a emissão'}</p>
            </div>
          );
        }
        return (
          <div style={{ width: size }} className="flex flex-col items-center rounded border border-slate-200 bg-white p-1">
            <img
              src={getDocumentValidationQrUrl(certificado.codigo_validacao || '', size * 2)}
              alt="QR de validação"
              className="w-full h-auto object-contain pointer-events-none"
            />
            <span className="mt-1 text-[6px] font-black uppercase tracking-widest text-slate-400">Código: {certificado.codigo_validacao || 'Aguardando emissão'}</span>
          </div>
        );
      }
      case 'table': {
        const tableText = replaceVarsPlain(block.content || '', certificado, templateVars);
        const programmaticRows = parseProgrammaticRows(tableText);
        const compactTable = programmaticRows.length > 6;
        const denseTable = programmaticRows.length > 10;
        const tableFontSize = Math.min(
          Number(block.fontSize || 11),
          denseTable ? 8 : compactTable ? 9 : 11
        );
        const tableCellClass = denseTable ? 'px-1.5 py-0.5' : compactTable ? 'px-1.5 py-1' : 'px-2 py-1.5';
        const tableTextStyle: React.CSSProperties = {
          color: block.color || modelo?.corTexto || '#1e293b',
          fontFamily: block.fontFamily || 'monospace',
          fontSize: tableFontSize,
          textAlign: block.textAlign || 'left',
        };

        return (
          <div style={{ width: block.width || 560, padding: denseTable ? 8 : compactTable ? 10 : 16 }} className="rounded-xl border border-slate-200 bg-white/90">
            {block.tableTitleVisible !== false && (
              <h2 className="mb-3 border-b border-slate-800 pb-1.5 text-sm font-black uppercase tracking-tight text-slate-800">Histórico Escolar</h2>
            )}
            {programmaticRows.length > 0 ? (
              <table className="w-full border-collapse overflow-hidden rounded-lg text-left" style={tableTextStyle}>
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className={`border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Componente</th>
                    <th className={`w-20 border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Carga</th>
                    <th className={`w-24 border border-slate-200 font-black uppercase tracking-widest ${tableCellClass}`}>Nota / Status</th>
                  </tr>
                </thead>
                <tbody>
                  {programmaticRows.map((row, index) => (
                    <tr key={`${row.nome}-${index}`} className={index % 2 === 0 ? 'bg-white/85' : 'bg-slate-50/85'}>
                      <td className={`border border-slate-200 font-bold ${tableCellClass}`}>{row.nome}</td>
                      <td className={`border border-slate-200 font-bold ${tableCellClass}`}>{row.carga}</td>
                      <td className={`border border-slate-200 font-black ${tableCellClass}`}>
                        {/aprovado/i.test(row.status) ? (
                          <span className="inline-block rounded-full bg-[#001a33] px-2 py-0.5 text-[0.78em] font-black uppercase tracking-widest text-white">Aprovado</span>
                        ) : (
                          row.status.replace(/^Nota:\s*/i, 'Nota: ')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div
                className="whitespace-pre-wrap leading-relaxed"
                style={tableTextStyle}
                dangerouslySetInnerHTML={{ __html: replaceVars(block.content || '', certificado, templateVars) }}
              />
            )}
          </div>
        );
      }
      case 'registry':
        return (
          <div className="w-[300px] rounded-xl border border-slate-250 bg-white/95 p-4 shadow-sm">
            <h2 className="mb-3 border-b border-slate-800 pb-1.5 text-xs font-black uppercase tracking-tight text-slate-800">Registro do Certificado</h2>
            <p className="text-[9px] font-bold leading-relaxed text-slate-600">
              Certificado Expedido N° <b>{certificado.certificado_numero || '____'}</b>, lavrado à Página <b>{certificado.pagina_livro || '____'}</b> do Livro <b>{certificado.livro_registro || '____'}</b>.
            </p>
            <p className="mt-2 text-[9px] font-bold text-slate-600">Validação do SISTEC: <b>{certificado.validacao_sistec || '________________'}</b></p>
          </div>
        );
      case 'stamp':
        return (
          <div className="w-[250px] rounded-xl border border-slate-200 bg-white/90 p-4 text-center shadow-sm">
            <div className="mb-1 flex h-10 w-full items-center justify-center border-b border-dotted border-slate-400">
              <span className="text-[8px] font-black uppercase text-slate-400 opacity-30">Visto / Carimbo</span>
            </div>
          </div>
        );
      case 'image':
        return block.imageUrl ? <img src={block.imageUrl} alt="" style={{ width: block.width || 180, opacity: block.opacity ?? 1 }} className="object-contain" /> : null;
      case 'validationLink':
        return (
          <div style={{ width: `${block.width || 560}px` }} className="p-1">
            <div
              className="font-black uppercase tracking-widest text-slate-700 leading-tight break-words"
              style={{
                fontSize: `${block.fontSize || 10}px`,
                color: block.color || modelo?.corTexto || '#1e293b',
                textAlign: block.textAlign || 'left',
                width: `${block.width || 560}px`,
              }}
              dangerouslySetInnerHTML={{ __html: replaceVars(block.content || '{{url_validacao}}', certificado, { url_validacao: validationUrl }) }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  let currentPageBlocks: any[] = [];

  const renderVisualPage = (page: 'frente' | 'verso') => {
    const blocks = getBlocks(modelo || {}).filter((block: any) => block.page === page && block.visible);
    currentPageBlocks = blocks;
    const backgroundUrl = getTemplateBackgroundUrl(modelo, page);
    const shouldRenderLandscapeWatermark =
      page === 'verso' && !backgroundUrl && Boolean(modelo?.landscapeWatermarkUrl);
    const style: React.CSSProperties = {
      backgroundColor: 'white',
      backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };

    return (
      <section
        data-certificate-pdf-page={pdfMode ? 'true' : undefined}
        className={`relative overflow-hidden bg-white ${
          pdfMode
            ? 'h-[210mm] w-[297mm] rounded-none shadow-none'
            : 'aspect-[1.414/1] rounded-xl shadow-xl'
        }`}
        style={style}
      >
        {shouldRenderLandscapeWatermark && (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
            <img
              src={modelo.landscapeWatermarkUrl}
              alt=""
              className="object-contain"
              style={{
                width: `${modelo.landscapeWatermarkScale || 55}%`,
                opacity: modelo.landscapeWatermarkOpacity ?? 0.1,
                transform: modelo.landscapeWatermarkRotate ? 'rotate(-22deg)' : 'none',
              }}
            />
          </div>
        )}
        {blocks.map((block: any) => {
          const blockStyle: React.CSSProperties = { left: `${block.x}%`, top: `${block.y}%` };

          if (block.type === 'signatureImage' && block.signatureBlend !== false) {
            blockStyle.mixBlendMode = 'multiply';
          }

          return (
            <div key={block.id} className="absolute z-10" style={blockStyle}>
              {renderBlock(block)}
            </div>
          );
        })}
      </section>
    );
  };

  const shouldRenderVisualTemplate = Boolean(
    modelo?.blocks?.length || modelo?.usePhotoshopLayout || modelo?.ocultarDesignPadrao
  );

  if (shouldRenderVisualTemplate) {
    return (
      <div className="space-y-6">
        {renderVisualPage('frente')}
        {(modelo?.hasVerso !== false || isTecnico) && renderVisualPage('verso')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
          <section
            data-certificate-pdf-page={pdfMode ? 'true' : undefined}
            className={`relative overflow-hidden border-[10px] border-double border-blue-700 bg-white p-10 ${
              pdfMode
                ? 'h-[210mm] w-[297mm] rounded-none shadow-none'
                : 'aspect-[1.414/1] rounded-xl shadow-xl'
            }`}
          >
            <div className="absolute inset-8 border border-blue-200" />
            <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
          <Award size={54} className="mb-5 text-blue-700" />
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-blue-600">Universo Cursos e Consultoria</p>
          <h2 className="my-5 font-serif text-4xl font-black uppercase text-[#001a33]">Certificado</h2>
          <div
            className="max-w-3xl font-serif text-lg leading-loose text-slate-800"
            dangerouslySetInnerHTML={{ __html: replaceVars(frontText, certificado) }}
          />
            <p className="mt-8 text-sm font-bold text-slate-600">
            {certificado.polo?.cidade || 'Não informado'}/{certificado.polo?.estado || 'Não informado'}, {new Date(`${certificado.data_conclusao}T12:00:00`).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </section>

      {(modelo?.hasVerso !== false || isTecnico) && (
        <section
          data-certificate-pdf-page={pdfMode ? 'true' : undefined}
          className={`relative overflow-hidden border-[10px] border-double border-blue-700 bg-white p-8 ${
            pdfMode
              ? 'h-[210mm] w-[297mm] rounded-none shadow-none'
              : 'aspect-[1.414/1] rounded-xl shadow-xl'
          }`}
        >
          <div className="grid h-full grid-cols-2 gap-6 text-xs text-slate-800">
            <div className="rounded-lg border border-slate-400 p-4">
              <h3 className="mb-3 font-black uppercase">Histórico / Conteúdo Programático</h3>
              <p className="whitespace-pre-wrap leading-relaxed">
                {modelo?.textoVerso
                  ? modelo.textoVerso.replace('{{grade_curricular}}', gradeCurricular || 'Grade curricular conforme histórico acadêmico.')
                  : gradeCurricular || 'Grade curricular conforme histórico acadêmico.'}
              </p>
            </div>
            <div className="space-y-4">
              {isTecnico && (
                <>
                  <div className="rounded-lg border border-slate-400 p-4">
                    <h3 className="mb-3 text-center font-black uppercase">Ensino Médio</h3>
                    <p><b>Estabelecimento:</b> {certificado.ensino_medio_estabelecimento || 'Não informado'}</p>
                    <p><b>Localidade/UF:</b> {certificado.ensino_medio_localidade_uf || 'Não informado'}</p>
                    <p><b>Ano de conclusão:</b> {certificado.ensino_medio_ano_conclusao || 'Não informado'}</p>
                  </div>
                  <div className="rounded-lg border border-slate-400 p-4 leading-loose">
                    <p>Certificado Expedido N° <b>{certificado.certificado_numero || '____'}</b></p>
                    <p>Lavrado à Página <b>{certificado.pagina_livro || '____'}</b> do Livro <b>{certificado.livro_registro || '____'}</b></p>
                    <p>Validação do SISTEC: <b>{certificado.validacao_sistec || '________________'}</b></p>
                  </div>
                </>
              )}
              <div className="flex items-center gap-3 rounded-lg border border-slate-300 p-4">
                <div>
                <img
                  src={getDocumentValidationQrUrl(certificado.codigo_validacao || '', 280)}
                  alt="QR de validação"
                  className="w-24 h-24 object-contain bg-white p-1 border border-slate-200 rounded shadow-sm"
                />
                  <p className="font-black uppercase">Código de autenticidade</p>
                  <p className="font-mono text-blue-700">{certificado.codigo_validacao || 'Gerado após a emissão'}</p>
                  <p className="mt-2 break-words text-[11px] font-black text-red-600">www.universocc.com.br/validador</p>
                  <p className="mt-2 text-[10px] text-slate-500">Aviso de autenticidade: consulte este certificado pelo QR Code ou pelo código de autenticidade.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default CertificadoPreview;
