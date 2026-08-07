import React from 'react';
import { Award } from 'lucide-react';
import { sanitizedHtml } from '../../../../../../lib/htmlSanitizer';
import { DocumentValidationQrCodeImage } from '../../../../../shared/document-validation/DocumentValidationQrCodeImage';
import { parseProgrammaticRows, replacePreviewVariables } from './diploma-preview.text';

interface DiplomaBlockContentProps {
  block: any;
  corTexto: string;
  isEditable: boolean;
  previewData: Record<string, string>;
  signatureTemplateVars: Record<string, string>;
  validationUrl: string;
  visibleBlocks: any[];
  getSignatureUrl: (block: any) => string;
}

const DiplomaBlockContent: React.FC<DiplomaBlockContentProps> = ({
  block,
  corTexto,
  isEditable,
  previewData,
  signatureTemplateVars,
  validationUrl,
  visibleBlocks,
  getSignatureUrl,
}) => {
  const parseText = (text: string, extraVars: Record<string, string> = {}) =>
    replacePreviewVariables(text, previewData, extraVars, true);
  const resolvePlainText = (text: string, extraVars: Record<string, string> = {}) =>
    replacePreviewVariables(text, previewData, extraVars);

  switch (block.type) {
    case 'logo': {
      const logoW = `${block.width || 96}px`;
      return (
        <div
          style={{ width: logoW, height: logoW }}
          className="flex items-center justify-center bg-[#001a33] rounded-full border-4 border-slate-200 shadow-sm"
        >
          <Award size={36} className="text-white" />
        </div>
      );
    }

    case 'text': {
      const textStyle: React.CSSProperties = {
        fontSize: `${block.fontSize || 14}px`,
        color: block.color || corTexto,
        width: `${block.width || 650}px`,
        fontFamily: block.fontFamily || (block.id === 'titulo' ? 'Playfair Display, serif' : block.id === 'texto' ? 'serif' : 'sans-serif'),
        textAlign: block.textAlign || (['titulo', 'subtitulo', 'cidadeData', 'texto'].includes(block.id) ? 'center' : 'left'),
        fontWeight: block.fontWeight || (block.id === 'titulo' ? '900' : ['subtitulo', 'cidadeData'].includes(block.id) ? 'bold' : 'normal'),
        textTransform: ['titulo', 'subtitulo', 'cidadeData'].includes(block.id) ? 'uppercase' : 'none',
        lineHeight: block.lineHeight ?? (block.id === 'texto' ? '1.8' : 'normal'),
        letterSpacing: block.id === 'subtitulo' ? '0.3em' : 'normal',
      };
      return (
        <div style={textStyle}>
          <div dangerouslySetInnerHTML={sanitizedHtml(parseText(block.content || '', signatureTemplateVars))} />
        </div>
      );
    }

    case 'signature': {
      const signatureW = `${block.width || 256}px`;
      const signatureLabelFontSize = Number(block.signatureLabelFontSize || 10);
      const signatureNameFontSize = Number(block.signatureNameFontSize || signatureLabelFontSize + 1);
      const signatureUrl = getSignatureUrl(block);
      const signatureBlend = block.signatureBlend !== false ? 'multiply' : 'normal';
      const signatureImageOffsetY = Number(block.signatureImageOffsetY || 0);
      const hasSeparateSignatureImage = visibleBlocks.some(
        (item: any) => item.type === 'signatureImage' && item.signatureBlockId === block.id,
      );
      const signerNameHtml = block.signerNameContent ? parseText(block.signerNameContent, signatureTemplateVars) : '';
      const signerTitleHtml = parseText(block.title || 'Visto', signatureTemplateVars);
      return (
        <div style={{ width: signatureW }} className="text-center flex flex-col items-center justify-end">
          {!hasSeparateSignatureImage ? (
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
          ) : null}
          <div className="w-full border-t border-slate-400 pt-[1px]" style={{ borderColor: block.color || corTexto }}>
            {signerNameHtml ? (
              <p
                className="font-black uppercase text-slate-800 leading-tight"
                style={{ fontSize: `${signatureNameFontSize}px` }}
                dangerouslySetInnerHTML={sanitizedHtml(signerNameHtml)}
              />
            ) : null}
            <p
              className="font-black uppercase tracking-widest text-slate-800 leading-tight"
              style={{ fontSize: `${signatureLabelFontSize}px` }}
              dangerouslySetInnerHTML={sanitizedHtml(signerTitleHtml)}
            />
          </div>
        </div>
      );
    }

    case 'signatureImage': {
      const signatureImageUrl = getSignatureUrl(block);
      const signatureImageBlend = block.signatureBlend !== false ? 'multiply' : undefined;
      if (!signatureImageUrl) {
        return isEditable ? (
          <div
            className="flex items-center justify-center rounded border border-dashed border-purple-300 bg-purple-50/50 text-center text-[8px] font-black uppercase tracking-widest text-purple-500"
            style={{ width: `${block.width || 220}px`, height: '58px' }}
          >
            Imagem da assinatura
          </div>
        ) : null;
      }
      return (
        <img
          src={signatureImageUrl}
          alt={block.label || 'Assinatura'}
          draggable={false}
          className="block select-none object-contain pointer-events-none"
          style={{ width: `${block.width || 220}px`, maxHeight: '90px', mixBlendMode: signatureImageBlend }}
        />
      );
    }

    case 'line':
      return (
        <div style={{ width: `${block.width || 260}px`, borderTop: `${block.borderWidth || 1}px solid ${block.color || corTexto}` }} />
      );

    case 'qrcode': {
      const qrW = `${block.width || 120}px`;
      const qrSize = block.width || 120;
      if (block.id === 'qrcode') {
        return (
          <div style={{ width: qrW }} className="bg-white/90 p-2 rounded border border-slate-200 text-center shadow-sm">
            <p className="text-[7px] font-black uppercase tracking-widest text-slate-500">Código de Autenticidade</p>
            <p className="mt-1 break-all font-mono text-[9px] font-black text-[#001a33]">{previewData.codigo_validacao}</p>
          </div>
        );
      }
      return (
        <div style={{ width: qrW }} className="bg-white p-1 rounded border border-slate-200 flex flex-col items-center shadow-sm">
          <DocumentValidationQrCodeImage
            code={previewData.codigo_validacao}
            size={qrSize * 2}
            alt="QR de validação"
            className="pointer-events-none h-auto w-full"
          />
          <span className="text-[6px] font-black text-slate-400 mt-1 uppercase tracking-widest">Código: {previewData.codigo_validacao}</span>
        </div>
      );
    }

    case 'table': {
      const tableText = resolvePlainText(block.content || '');
      const programmaticRows = parseProgrammaticRows(tableText);
      const compactTable = programmaticRows.length > 6;
      const denseTable = programmaticRows.length > 10;
      const tableFontSize = Math.min(Number(block.fontSize || 11), denseTable ? 8 : compactTable ? 9 : 11);
      const tableCellClass = denseTable ? 'px-1.5 py-0.5' : compactTable ? 'px-1.5 py-1' : 'px-2 py-1.5';
      const tableTextStyle: React.CSSProperties = {
        color: block.color || corTexto,
        fontFamily: block.fontFamily || 'monospace',
        fontSize: `${tableFontSize}px`,
        textAlign: block.textAlign || 'left',
      };
      return (
        <div
          className="flex flex-col border border-slate-200 bg-white/90 rounded-xl"
          style={{ width: `${block.width || 550}px`, padding: denseTable ? '8px' : compactTable ? '10px' : '16px' }}
        >
          {block.tableTitleVisible !== false ? (
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">
              Histórico Escolar
            </h2>
          ) : null}
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
                      ) : row.status.replace(/^Nota:\s*/i, 'Nota: ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="leading-relaxed whitespace-pre-wrap" style={tableTextStyle}>
              <div dangerouslySetInnerHTML={sanitizedHtml(parseText(block.content || ''))} />
            </div>
          )}
        </div>
      );
    }

    case 'image':
      return block.imageUrl ? (
        <img
          src={block.imageUrl}
          alt=""
          draggable={false}
          style={{ width: `${block.width || 180}px`, opacity: block.opacity ?? 1 }}
          className="block select-none object-contain"
        />
      ) : null;

    case 'registry':
      return (
        <div className="flex flex-col border border-slate-250 p-4 bg-white/95 rounded-xl w-[300px] shadow-sm">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">Registro do Certificado</h2>
          <p className="text-[9px] font-bold text-slate-600 leading-relaxed">
            Certificado Expedido N° <b>{previewData.certificado_numero}</b>, lavrado à Página <b>{previewData.pagina_livro}</b> do Livro <b>{previewData.livro}</b>.
          </p>
          <p className="text-[9px] font-bold text-slate-600 mt-2">Validação do SISTEC: <b>{previewData.validacao_sistec}</b></p>
        </div>
      );

    case 'stamp':
      return (
        <div className="text-center flex flex-col items-center justify-center border border-slate-200 p-4 bg-white/90 rounded-xl w-[250px] shadow-sm">
          <div className="w-full border-b border-dotted border-slate-400 h-10 mb-1 flex items-center justify-center">
            <span className="text-[8px] text-slate-400 uppercase font-black opacity-30">Visto / Carimbo</span>
          </div>
        </div>
      );

    case 'validationLink':
      return (
        <div style={{ width: `${block.width || 560}px` }} className="p-1">
          <div
            className="font-black uppercase tracking-widest text-slate-700 leading-tight break-words"
            style={{
              fontSize: `${block.fontSize || 10}px`,
              color: block.color || corTexto,
              textAlign: block.textAlign || 'left',
              width: `${block.width || 560}px`,
            }}
            dangerouslySetInnerHTML={sanitizedHtml(parseText(block.content || '{{url_validacao}}', {
              ...signatureTemplateVars,
              url_validacao: validationUrl,
            }))}
          />
        </div>
      );

    default:
      return null;
  }
};

export default DiplomaBlockContent;
