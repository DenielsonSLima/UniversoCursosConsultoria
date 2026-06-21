// File: modules/gestor/cadastros/modelos-documentos/diploma/components/DiplomaPreview.tsx

import React from 'react';
import { QrCode, Award, X } from 'lucide-react';

interface DiplomaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
  isEditable?: boolean; // True when on the active editing tabs (frente/verso)
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
  onChangeBlocks?: (blocks: any[]) => void;
}

// Coordenadas padrão iniciais em porcentagem (%) para o A4 paisagem (297mm x 210mm)
export const posicoesPadrao: Record<string, { x: number; y: number }> = {
  // Frente
  selo: { x: 46.0, y: 10.0 },
  titulo: { x: 10.0, y: 27.0 },
  subtitulo: { x: 10.0, y: 40.0 },
  texto: { x: 10.0, y: 48.0 },
  cidadeData: { x: 10.0, y: 70.0 },
  assinatura1: { x: 15.0, y: 78.0 },
  assinatura2: { x: 55.0, y: 78.0 },
  qrcode: { x: 80.0, y: 72.0 },
  // Verso
  historico: { x: 5.0, y: 10.0 },
  registro: { x: 65.0, y: 10.0 },
  carimbo: { x: 65.0, y: 70.0 },
  versoQrcode: { x: 65.0, y: 44.0 }
};

export const getBlocks = (formData: any) => {
  if (formData.blocks && formData.blocks.length > 0) return formData.blocks;
  
  // Se não existir o array de blocks, vamos construí-lo a partir dos dados do modelo e posições
  const pos = formData.posicoes || posicoesPadrao;
  
  return [
    {
      id: 'selo',
      type: 'logo',
      label: 'Selo / Logomarca',
      page: 'frente',
      x: pos.selo?.x ?? posicoesPadrao.selo.x,
      y: pos.selo?.y ?? posicoesPadrao.selo.y,
      width: formData.seloWidth || 96,
      visible: formData.exibirLogo !== false
    },
    {
      id: 'titulo',
      type: 'text',
      label: 'Título Principal',
      page: 'frente',
      x: pos.titulo?.x ?? posicoesPadrao.titulo.x,
      y: pos.titulo?.y ?? posicoesPadrao.titulo.y,
      fontSize: formData.tamanhoFonteTitulo || 45,
      content: 'Certificado',
      visible: formData.exibirTitulo !== false
    },
    {
      id: 'subtitulo',
      type: 'text',
      label: 'Subtítulo',
      page: 'frente',
      x: pos.subtitulo?.x ?? posicoesPadrao.subtitulo.x,
      y: pos.subtitulo?.y ?? posicoesPadrao.subtitulo.y,
      fontSize: formData.tamanhoFonteSubtitulo || 14,
      content: 'De Conclusão de Curso',
      visible: formData.exibirSubtitulo !== false
    },
    {
      id: 'texto',
      type: 'text',
      label: 'Texto Descritivo',
      page: 'frente',
      x: pos.texto?.x ?? posicoesPadrao.texto.x,
      y: pos.texto?.y ?? posicoesPadrao.texto.y,
      fontSize: formData.tamanhoFonteTexto || 24,
      content: formData.textoFrente || 'Certificamos que {{nome_aluno}} concluiu o curso de {{curso_nome}} com carga horária de {{carga_horaria}} horas.',
      visible: formData.exibirTexto !== false
    },
    {
      id: 'cidadeData',
      type: 'text',
      label: 'Cidade e Data',
      page: 'frente',
      x: pos.cidadeData?.x ?? posicoesPadrao.cidadeData.x,
      y: pos.cidadeData?.y ?? posicoesPadrao.cidadeData.y,
      fontSize: formData.tamanhoFonteCidadeData || 12,
      content: 'Aracaju/SE, {{data_conclusao}}',
      visible: formData.exibirCidadeData !== false
    },
    {
      id: 'assinatura1',
      type: 'signature',
      label: 'Assinatura Diretor',
      page: 'frente',
      x: pos.assinatura1?.x ?? posicoesPadrao.assinatura1.x,
      y: pos.assinatura1?.y ?? posicoesPadrao.assinatura1.y,
      width: formData.assinaturaWidth || 256,
      title: 'Diretor Geral',
      visible: formData.exibirAssinatura1 !== false
    },
    {
      id: 'assinatura2',
      type: 'signature',
      label: 'Assinatura Secretaria',
      page: 'frente',
      x: pos.assinatura2?.x ?? posicoesPadrao.assinatura2.x,
      y: pos.assinatura2?.y ?? posicoesPadrao.assinatura2.y,
      width: formData.assinaturaWidth || 256,
      title: 'Secretaria Acadêmica',
      visible: formData.exibirAssinatura2 !== false
    },
    {
      id: 'qrcode',
      type: 'qrcode',
      label: 'QR Code Autenticidade',
      page: 'frente',
      x: pos.qrcode?.x ?? posicoesPadrao.qrcode.x,
      y: pos.qrcode?.y ?? posicoesPadrao.qrcode.y,
      width: formData.qrcodeWidth || 120,
      visible: formData.hasValidationQrCode !== false
    },
    {
      id: 'historico',
      type: 'table',
      label: 'Histórico Escolar / Grade',
      page: 'verso',
      x: pos.historico?.x ?? posicoesPadrao.historico.x,
      y: pos.historico?.y ?? posicoesPadrao.historico.y,
      content: formData.textoVerso || 'Grade Curricular do Curso Técnico:\n\n{{grade_curricular}}',
      visible: formData.hasVerso !== false
    },
    {
      id: 'registro',
      type: 'registry',
      label: 'Livro de Registro',
      page: 'verso',
      x: pos.registro?.x ?? posicoesPadrao.registro.x,
      y: pos.registro?.y ?? posicoesPadrao.registro.y,
      visible: formData.exibirVersoRegistro !== false
    },
    {
      id: 'versoQrcode',
      type: 'qrcode',
      label: 'QR Code Verso',
      page: 'verso',
      x: pos.versoQrcode?.x ?? posicoesPadrao.versoQrcode.x,
      y: pos.versoQrcode?.y ?? posicoesPadrao.versoQrcode.y,
      width: formData.qrcodeWidth || 120,
      visible: formData.hasValidationQrCode !== false
    },
    {
      id: 'carimbo',
      type: 'stamp',
      label: 'Carimbo / Visto',
      page: 'verso',
      x: pos.carimbo?.x ?? posicoesPadrao.carimbo.x,
      y: pos.carimbo?.y ?? posicoesPadrao.carimbo.y,
      visible: formData.exibirVersoCarimbo !== false
    }
  ];
};

const DiplomaPreview: React.FC<DiplomaPreviewProps> = ({ 
  formData, 
  page, 
  zoomLevel,
  isEditable = false,
  selectedBlockId = null,
  onSelectBlock,
  onChangeBlocks
}) => {
  // Dados fictícios para preencher o visualizador
  const previewData = {
    nome_aluno: 'JOÃO DA SILVA SAURO',
    cpf: '123.456.789-00',
    curso_nome: formData.tipoCurso === 'Cursos Técnicos' ? 'Técnico em Enfermagem' : 'Enfermagem',
    carga_horaria: '1200',
    data_conclusao: '20 de Maio de 2026',
    grade_curricular: `Anatomia Humana - 80h - Nota: 9.0\nFisiologia - 80h - Nota: 8.5\nPrimeiros Socorros - 40h - Nota: 10.0\nFarmacologia Aplicada - 60h - Nota: 9.5\nÉtica e Deontologia - 40h - Nota: 9.0\nEstágio Supervisionado I - 200h - Aprovado`,
    livro_registro: 'Livro: 12, Folha: 45, Registro: 1024'
  };

  // Helper para substituir variáveis simples por negrito no preview
  const parseText = (text: string) => {
    if (!text) return '';
    let parsed = text;
    Object.keys(previewData).forEach(key => {
       const regex = new RegExp(`{{${key}}}`, 'g');
       // @ts-ignore
       parsed = parsed.replace(regex, `<strong>${previewData[key]}</strong>`);
    });
    return parsed;
  };

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel / 100})`, 
    marginBottom: zoomLevel < 100 ? `-${210 * (1 - zoomLevel / 100)}mm` : '0',
    backgroundColor: 'white',
    position: 'relative'
  };

  if (page === 'frente' && formData.bgFrenteUrl) {
    containerStyle.backgroundImage = `url(${formData.bgFrenteUrl})`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
  } else if (page === 'verso' && formData.bgVersoUrl) {
    containerStyle.backgroundImage = `url(${formData.bgVersoUrl})`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
  }

  const corTexto = formData.corTexto || '#1e293b';
  const blocks = getBlocks(formData);
  const visibleBlocks = blocks.filter((b: any) => b.page === page && b.visible);

  // LÓGICA DO DRAG & DROP EM PORCENTAGEM
  const handleDragStart = (e: React.MouseEvent, key: string) => {
    if (!isEditable) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (onSelectBlock) {
      onSelectBlock(key);
    }
    
    // Obtém o elemento pai (o container do diploma A4)
    const canvasElement = e.currentTarget.parentElement;
    if (!canvasElement) return;
    
    const rect = canvasElement.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    
    const block = blocks.find((b: any) => b.id === key);
    if (!block) return;
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = block.x; // em %
    const startTop = block.y; // em %

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const zoomFactor = zoomLevel / 100;
      const actualDeltaX = deltaX / zoomFactor;
      const actualDeltaY = deltaY / zoomFactor;

      // Converte pixels reais de delta para porcentagem
      const pctDeltaX = (actualDeltaX / (canvasWidth / zoomFactor)) * 100;
      const pctDeltaY = (actualDeltaY / (canvasHeight / zoomFactor)) * 100;

      const newX = parseFloat(Math.min(95, Math.max(0, startLeft + pctDeltaX)).toFixed(2));
      const newY = parseFloat(Math.min(95, Math.max(0, startTop + pctDeltaY)).toFixed(2));

      const updatedBlocks = blocks.map((b: any) => {
        if (b.id === key) {
          return { ...b, x: newX, y: newY };
        }
        return b;
      });

      if (onChangeBlocks) {
        onChangeBlocks(updatedBlocks);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRemoveBlock = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const updatedBlocks = blocks.map((b: any) => {
      if (b.id === key) {
        return { ...b, visible: false };
      }
      return b;
    });

    if (onChangeBlocks) {
      onChangeBlocks(updatedBlocks);
    }
    
    if (onSelectBlock && selectedBlockId === key) {
      onSelectBlock(null);
    }
  };

  const getPosStyle = (block: any): React.CSSProperties => {
    return {
      position: 'absolute',
      left: `${block.x}%`,
      top: `${block.y}%`,
      cursor: isEditable ? 'move' : 'default',
    };
  };

  const renderBlockContent = (block: any) => {
    const isSelected = selectedBlockId === block.id;

    switch (block.type) {
      case 'logo':
        const logoW = `${block.width || 96}px`;
        return (
          <div 
            style={{ width: logoW, height: logoW }}
            className="flex items-center justify-center bg-[#001a33] rounded-full border-4 border-slate-200 shadow-sm"
          >
             <Award size={36} className="text-white" />
          </div>
        );

      case 'text':
        const textStyle: React.CSSProperties = {
          fontSize: `${block.fontSize || 14}px`,
          color: corTexto,
          width: block.id === 'titulo' || block.id === 'subtitulo' || block.id === 'cidadeData' || block.id === 'texto' ? '650px' : 'auto',
          fontFamily: block.id === 'titulo' ? 'Playfair Display, serif' : block.id === 'texto' ? 'serif' : 'sans-serif',
          textAlign: block.id === 'titulo' || block.id === 'subtitulo' || block.id === 'cidadeData' || block.id === 'texto' ? 'center' : 'left',
          fontWeight: block.id === 'titulo' ? '900' : block.id === 'subtitulo' || block.id === 'cidadeData' ? 'bold' : 'normal',
          textTransform: block.id === 'titulo' || block.id === 'subtitulo' || block.id === 'cidadeData' ? 'uppercase' : 'none',
          lineHeight: block.id === 'texto' ? '1.8' : 'normal',
          letterSpacing: block.id === 'subtitulo' ? '0.3em' : 'normal'
        };
        
        return (
          <div style={textStyle}>
            <div dangerouslySetInnerHTML={{ __html: parseText(block.content || '') }} />
          </div>
        );

      case 'signature':
        const signatureW = `${block.width || 256}px`;
        return (
          <div style={{ width: signatureW }} className="text-center flex flex-col items-center justify-center">
            <div className="w-full border-b border-slate-800 pb-1 mb-2"></div>
            <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest">{block.title || 'Visto'}</p>
          </div>
        );

      case 'qrcode':
        const qrW = `${block.width || 120}px`;
        return (
          <div style={{ width: qrW }} className="bg-white p-2 rounded border border-slate-200 flex flex-col items-center shadow-sm">
            <QrCode size={36} className="text-[#001a33]" />
            <span className="text-[6px] font-black text-slate-400 mt-1 uppercase tracking-widest">Autenticidade</span>
          </div>
        );

      case 'table':
        return (
          <div className="flex flex-col border border-slate-200 p-4 bg-white/90 rounded-xl w-[550px]">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">
              Histórico Escolar
            </h2>
            <div className="text-[11px] text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">
              <div dangerouslySetInnerHTML={{ __html: parseText(block.content || '') }} />
            </div>
          </div>
        );

      case 'registry':
        return (
          <div className="flex flex-col border border-slate-250 p-4 bg-white/95 rounded-xl w-[250px] shadow-sm">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b border-slate-800 pb-1.5 mb-3">
              Registro
            </h2>
            <p className="text-[9px] font-bold text-slate-500 mb-0.5">Registrado sob o número:</p>
            <p className="text-xs font-black text-slate-800 mb-3">1024-2026</p>
            
            <p className="text-[9px] font-bold text-slate-500 mb-0.5">Livro Especial:</p>
            <p className="text-xs font-black text-slate-800">{previewData.livro_registro}</p>
          </div>
        );

      case 'stamp':
        return (
          <div className="text-center flex flex-col items-center justify-center border border-slate-200 p-4 bg-white/90 rounded-xl w-[250px] shadow-sm">
            <div className="w-full border-b border-dotted border-slate-400 h-10 mb-1 flex items-center justify-center">
              <span className="text-[8px] text-slate-400 uppercase font-black opacity-30">Visto / Carimbo</span>
            </div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Autorizado por</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="bg-white w-[297mm] h-[210mm] shadow-2xl relative rounded-[2mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200 select-none"
      style={containerStyle}
    >
      {/* MARCA D'ÁGUA (Só na Frente se tiver ativa) */}
      {formData.hasWatermark && formData.watermarkText && page === 'frente' && (
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden w-full h-full pointer-events-none opacity-[0.03]">
          <div 
            className="text-slate-900 font-black whitespace-nowrap uppercase transform -rotate-45 select-none" 
            style={{ fontSize: '140px', letterSpacing: '0.1em' }}
          >
            {formData.watermarkText}
          </div>
        </div>
      )}

      {/* Molduras Padrão */}
      {(!formData.ocultarDesignPadrao) && page === 'frente' && (
        <>
          <div className="absolute inset-4 border-8 border-double border-slate-300 rounded-sm pointer-events-none z-10"></div>
          <div className="absolute inset-8 border border-slate-200 rounded-sm pointer-events-none z-10"></div>
        </>
      )}

      {/* Renderização de todos os Blocos Visíveis da Página */}
      {visibleBlocks.map((block: any) => {
        const isSelected = selectedBlockId === block.id;
        
        return (
          <div
            key={block.id}
            style={getPosStyle(block)}
            onMouseDown={(e) => handleDragStart(e, block.id)}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditable && onSelectBlock) {
                onSelectBlock(block.id);
              }
            }}
            className={`z-20 ${
              isEditable
                ? `outline-2 outline-offset-2 transition-all group ${
                    isSelected 
                      ? 'outline outline-purple-600 ring-2 ring-purple-100' 
                      : 'hover:outline hover:outline-dashed hover:outline-slate-400'
                  }`
                : ''
            }`}
          >
            {renderBlockContent(block)}

            {/* Botão de Excluir Bloco (Apenas em Edição e se Selecionado/Hover) */}
            {isEditable && (
              <button
                onClick={(e) => handleRemoveBlock(e, block.id)}
                className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md border border-white opacity-0 group-hover:opacity-100 transition-opacity z-50 focus:outline-none"
                title="Excluir Elemento"
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DiplomaPreview;
