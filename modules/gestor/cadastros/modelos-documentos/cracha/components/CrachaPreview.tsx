import React from 'react';
import { User, ShieldCheck } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../../shared/document-validation/DocumentValidationQrCodeImage';
import { resolveCrachaFields } from './cracha-editor.model';

interface CrachaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
  aluno?: {
    nome: string;
    cpf: string;
    rg?: string;
    matricula: string;
    cargo?: string;
    polo?: string;
    curso?: string;
    validade?: string;
    fotoUrl?: string | null;
    foto?: string | null;
    validationCode?: string;
  };
  isEditable?: boolean;
  selectedFieldId?: string | null;
  onSelectField?: (id: string | null) => void;
  onChangePositions?: (fields: any[]) => void;
}

const CrachaPreview: React.FC<CrachaPreviewProps> = ({ 
  formData, 
  page, 
  zoomLevel, 
  aluno,
  isEditable = false,
  selectedFieldId = null,
  onSelectField,
  onChangePositions
}) => {
  // Calcular data de validade (1 ano a partir da emissão)
  const today = new Date();
  const validadeDate = new Date(today);
  validadeDate.setFullYear(validadeDate.getFullYear() + 1);

  const collaboratorData = aluno ? {
    nome: aluno.nome,
    cargo: aluno.cargo || formData.cargoPadrao || 'ESTAGIÁRIO',
    matricula: aluno.matricula,
    cpf: aluno.cpf,
    polo: aluno.polo || 'POLO JAPOATÃ (MATRIZ)',
    curso: aluno.curso || 'TÉCNICO EM ENFERMAGEM',
    admissao: '05/01/2024',
    emissao: today.toLocaleDateString('pt-BR'),
    validade: aluno.validade || validadeDate.toLocaleDateString('pt-BR'),
    instituicao: 'UNIVERSO CURSOS E CONSULTORIA',
    fotoUrl: aluno.fotoUrl || aluno.foto || null,
    validationCode: aluno.validationCode,
  } : {
    nome: 'CARLOS HENRIQUE DE OLIVEIRA',
    cargo: formData.cargoPadrao || 'ESTAGIÁRIO',
    matricula: '2026F987',
    cpf: '987.654.321-99',
    polo: 'POLO JAPOATÃ (MATRIZ)',
    curso: 'TÉCNICO EM ENFERMAGEM',
    admissao: '05/01/2024',
    emissao: today.toLocaleDateString('pt-BR'),
    validade: validadeDate.toLocaleDateString('pt-BR'),
    instituicao: 'UNIVERSO CURSOS E CONSULTORIA',
    fotoUrl: null,
    validationCode: undefined,
  };

  const codeValidador = collaboratorData.validationCode || collaboratorData.matricula;

  const useCustomBg = page === 'frente' ? !!formData.bgFrenteUrl : !!formData.bgVersoUrl;
  const ocultarDesign = useCustomBg && !!formData.ocultarDesignPadrao;

  const activeFields = resolveCrachaFields(formData);

  const replaceVars = (val: string) => {
    if (!val) return '';
    return val
      .replace(/{{ALUNO_NOME}}/g, collaboratorData.nome)
      .replace(/{{ALUNO_MATRICULA}}/g, collaboratorData.matricula)
      .replace(/{{ALUNO_CPF}}/g, collaboratorData.cpf)
      .replace(/{{POLO_NOME}}/g, collaboratorData.polo)
      .replace(/{{ALUNO_CURSO}}/g, collaboratorData.curso)
      .replace(/{{DATA_HOJE}}/g, collaboratorData.emissao)
      .replace(/{{DATA_VALIDADE}}/g, collaboratorData.validade);
  };

  // Drag & Drop Handler
  const handleDragStart = (e: React.MouseEvent, fieldId: string) => {
    if (!isEditable) return;
    e.preventDefault();
    e.stopPropagation();

    if (onSelectField) {
      onSelectField(fieldId);
    }

    const itemElement = e.currentTarget;
    const cardElement = itemElement.parentElement;
    if (!cardElement) return;

    const rect = cardElement.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;

    const allFields = activeFields;
    const field = allFields.find((f: any) => f.id === fieldId);
    if (!field) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = field.x; // em %
    const startTop = field.y; // em %

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const zoomFactor = zoomLevel / 100;
      const actualDeltaX = deltaX / zoomFactor;
      const actualDeltaY = deltaY / zoomFactor;

      const pctDeltaX = (actualDeltaX / (cardWidth / zoomFactor)) * 100;
      const pctDeltaY = (actualDeltaY / (cardHeight / zoomFactor)) * 100;

      const newX = parseFloat(Math.min(95, Math.max(-10, startLeft + pctDeltaX)).toFixed(2));
      const newY = parseFloat(Math.min(98, Math.max(-10, startTop + pctDeltaY)).toFixed(2));

      const updatedFields = allFields.map((f: any) => 
        f.id === fieldId ? { ...f, x: newX, y: newY } : f
      );

      if (onChangePositions) {
        onChangePositions(updatedFields);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const zoomScale = zoomLevel / 100;

  const previewFrameStyle: React.CSSProperties = {
    width: `${54 * zoomScale}mm`,
    height: `${85.6 * zoomScale}mm`,
    position: 'relative',
    flexShrink: 0
  };

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomScale})`, 
    backgroundColor: 'white',
    width: '54mm',
    height: '85.6mm',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '2.5mm',
    overflow: 'hidden',
    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    flexShrink: 0,
    transformOrigin: 'top left',
    transition: 'transform 0.1s ease-out',
    userSelect: 'none'
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

  const filteredFields = activeFields.filter((f: any) => (f.page || 'frente') === page);

  return (
    <div style={previewFrameStyle}>
      <div style={containerStyle} className="bg-white">
      {isEditable && (
        <div className="absolute inset-0 z-[8] pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(37, 99, 235, 0.16) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(37, 99, 235, 0.16) 1px, transparent 1px),
                linear-gradient(to right, rgba(15, 23, 42, 0.2) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(15, 23, 42, 0.2) 1px, transparent 1px)
              `,
              backgroundSize: '10% 10%, 10% 10%, 50% 50%, 50% 50%'
            }}
          />
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((mark) => (
            <React.Fragment key={mark}>
              <span
                className="absolute font-mono font-black text-blue-500/60"
                style={{ left: `${mark}%`, top: '1.2mm', fontSize: '3px', transform: 'translateX(-50%)' }}
              >
                {mark}
              </span>
              <span
                className="absolute font-mono font-black text-blue-500/60"
                style={{ top: `${mark}%`, left: '1.2mm', fontSize: '3px', transform: 'translateY(-50%)' }}
              >
                {mark}
              </span>
            </React.Fragment>
          ))}
          <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-blue-500/45" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-blue-500/45" />
        </div>
      )}

      {/* 1. Elementos Decorativos de Fundo (Design Padrão se não estiver ocultado) */}
      {!ocultarDesign && page === 'frente' && (
        <>
          <div 
            className="h-10 flex flex-col items-center justify-center shrink-0 px-2 text-center"
            style={{ backgroundColor: formData.corPrimaria || '#0f172a', color: '#fff' }}
          >
            <h4 className="text-[6px] font-black tracking-widest opacity-80 uppercase">Universo</h4>
            <h2 className="text-[9px] font-black uppercase tracking-wider leading-none">Cursos e Consultoria</h2>
          </div>
          <div className="h-1 w-full shrink-0" style={{ backgroundColor: formData.corSecundaria || '#10b981' }}></div>
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
            <ShieldCheck size={180} style={{ color: formData.corPrimaria || '#0f172a' }} />
          </div>
        </>
      )}

      {!ocultarDesign && page === 'verso' && (
        <div className="h-6 bg-slate-800 w-full flex items-center justify-center shrink-0">
          <div className="w-8 h-2 bg-slate-700 rounded-full"></div>
        </div>
      )}

      {/* 2. Renderização Dinâmica dos Campos Absolutos */}
      {filteredFields.map((field: any) => {
        const isSelected = selectedFieldId === field.id;
        const hoverOutlineStyle = isEditable ? 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-500 hover:outline-offset-1' : '';

        // Estilos Comuns
        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${field.x}%`,
          top: `${field.y}%`,
          cursor: isEditable ? 'move' : 'default',
          zIndex: isSelected ? 50 : (field.style?.zIndex || 15),
          outline: isSelected ? '2px dashed #2563eb' : undefined,
          outlineOffset: isSelected ? '2px' : undefined,
          boxSizing: 'border-box'
        };

        if (field.type === 'foto') {
          return (
            <div
              key={field.id}
              style={{
                ...commonStyle,
                width: `${field.width || 45}%`,
                height: `${field.height || 28.5}%`,
                border: isSelected ? 'none' : '2px solid rgba(226, 232, 240, 0.7)',
                borderRadius: '3mm',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f8fafc',
                overflow: 'hidden'
              }}
              onMouseDown={(e) => handleDragStart(e, field.id)}
              onClick={(e) => { e.stopPropagation(); if (isEditable && onSelectField) onSelectField(field.id); }}
              className={`${hoverOutlineStyle} transition-all`}
            >
              {collaboratorData.fotoUrl ? (
                <img src={collaboratorData.fotoUrl} alt="Foto" className="w-full h-full object-cover pointer-events-none" />
              ) : (
                <User className="text-slate-300 pointer-events-none" style={{ width: '60%', height: '60%' }} />
              )}
            </div>
          );
        }

        if (field.type === 'qrcode') {
          return (
            <div
              key={field.id}
              style={{
                ...commonStyle,
                width: `${field.width || 22}%`,
                height: 'auto',
                backgroundColor: 'white',
                padding: '2%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid rgba(226, 232, 240, 0.7)'
              }}
              onMouseDown={(e) => handleDragStart(e, field.id)}
              onClick={(e) => { e.stopPropagation(); if (isEditable && onSelectField) onSelectField(field.id); }}
              className={`${hoverOutlineStyle} transition-all`}
            >
              <DocumentValidationQrCodeImage
                code={codeValidador}
                alt="QR"
                className="pointer-events-none w-full"
              />
              <div className="w-full flex flex-col items-center pointer-events-none" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '2px', marginTop: '2px' }}>
                <p style={{ fontSize: '2.8px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1, marginBottom: '1px' }}>
                  CÓD. VALIDAÇÃO
                </p>
                <p style={{ fontSize: '3.5px', fontWeight: 900, color: '#2563eb', fontFamily: 'monospace', letterSpacing: '0.06em', lineHeight: 1, wordBreak: 'break-all', textAlign: 'center' }}>
                  {codeValidador}
                </p>
              </div>
            </div>
          );
        }

        if (field.type === 'image') {
          return (
            <div
              key={field.id}
              style={{
                ...commonStyle,
                width: field.width ? `${field.width}%` : '30%',
                height: field.height ? `${field.height}%` : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseDown={(e) => handleDragStart(e, field.id)}
              onClick={(e) => { e.stopPropagation(); if (isEditable && onSelectField) onSelectField(field.id); }}
              className={`${hoverOutlineStyle} transition-all`}
            >
              <img 
                src={field.value} 
                alt="Imagem" 
                className="w-full h-auto object-contain pointer-events-none" 
                style={{ mixBlendMode: field.style?.mixBlendMode || 'multiply' }}
              />
            </div>
          );
        }

        // text fields
        return (
          <div
            key={field.id}
            style={{
              ...commonStyle,
              width: field.width ? `${field.width}%` : '92.6%',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              ...field.style
            }}
            onMouseDown={(e) => handleDragStart(e, field.id)}
            onClick={(e) => { e.stopPropagation(); if (isEditable && onSelectField) onSelectField(field.id); }}
            className={`${hoverOutlineStyle} transition-all`}
          >
            {replaceVars(field.value)}
          </div>
        );
      })}
      </div>
    </div>
  );
};

export default CrachaPreview;
