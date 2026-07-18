import React from 'react';
import {
  formatCrachaEleitoralDate,
  getDefaultCrachaPeriodoEleitoralFields,
} from '../cracha-periodo-eleitoral.service';

interface CrachaPeriodoEleitoralPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel?: number;
  aluno?: {
    nome?: string;
    matricula?: string;
    curso?: string;
    polo?: string;
    instituicaoEnsino?: string;
    categoriaProfissional?: string;
    instrutor?: string;
    validade?: string;
    fotoUrl?: string | null;
  };
  isEditable?: boolean;
  selectedFieldId?: string | null;
  onSelectField?: (id: string | null) => void;
  onChangePositions?: (fields: any[]) => void;
}

const replaceVars = (value: string, data: Record<string, string>) =>
  String(value || '').replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => data[key] || '');

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const CrachaPeriodoEleitoralPreview: React.FC<CrachaPeriodoEleitoralPreviewProps> = ({
  formData,
  page,
  zoomLevel = 100,
  aluno,
  isEditable = false,
  selectedFieldId = null,
  onSelectField,
  onChangePositions,
}) => {
  const zoomScale = zoomLevel / 100;
  const corPrimaria = formData?.corPrimaria || '#0b58a8';
  const validadePeriodo = formatCrachaEleitoralDate(formData?.disponivelFim);
  const baseData = {
    ALUNO_NOME: aluno?.nome || 'MARÍLIA VIEIRA DOS SANTOS',
    ALUNO_MATRICULA: aluno?.matricula || '201830130',
    ALUNO_CURSO: aluno?.curso || 'TÉC. ENFERMAGEM',
    ALUNO_POLO: aluno?.polo || 'POLO PRINCIPAL',
    DATA_FIM_DISPONIBILIDADE: validadePeriodo || '31/12/2019',
    HOSPITAL_NOME: formData?.hospitalNome || formData?.orgaoTitulo || 'Hospital de Urgência de Sergipe - HUSE',
    ORGAO_TITULO: formData?.hospitalNome || formData?.orgaoTitulo || 'Hospital de Urgência de Sergipe - HUSE',
    TITULO_PRINCIPAL: formData?.tituloPrincipal || 'ESTÁGIO\nCURRICULAR',
  };
  const instituicaoEnsino = aluno?.instituicaoEnsino || formData?.instituicaoEnsinoPadrao || 'Universidade Federal de Sergipe';
  const categoriaProfissional = aluno?.categoriaProfissional || replaceVars(formData?.categoriaPadrao || '{{ALUNO_CURSO}}', baseData);
  const instrutor = aluno?.instrutor || formData?.instrutorPadrao || 'EDINALVA';
  const validade = aluno?.validade || replaceVars(formData?.validadePadrao || '{{DATA_FIM_DISPONIBILIDADE}}', baseData) || validadePeriodo;

  const data = {
    ...baseData,
    INSTITUICAO_ENSINO: instituicaoEnsino,
    CATEGORIA_PROFISSIONAL: categoriaProfissional,
    INSTRUTOR: instrutor,
    VALIDADE: validade,
  };

  const allFields = Array.isArray(formData?.fields) && formData.fields.length > 0
    ? formData.fields
    : getDefaultCrachaPeriodoEleitoralFields();
  const filteredFields = allFields.filter((field: any) => (field.page || 'frente') === page);
  const useCustomBg = page === 'frente' ? !!formData?.bgFrenteUrl : !!formData?.bgVersoUrl;
  const ocultarDesign = useCustomBg && !!formData?.ocultarDesignPadrao;

  const frameStyle: React.CSSProperties = {
    width: `${142 * zoomScale}mm`,
    height: `${86 * zoomScale}mm`,
    position: 'relative',
    flexShrink: 0,
  };

  const cardStyle: React.CSSProperties = {
    width: '142mm',
    height: '86mm',
    transform: `scale(${zoomScale})`,
    transformOrigin: 'top left',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fff',
    fontFamily: '"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif',
    boxShadow: '0 18px 35px rgba(15, 23, 42, 0.14)',
    userSelect: 'none',
  };

  if (page === 'frente' && formData?.bgFrenteUrl) {
    cardStyle.backgroundImage = `url(${formData.bgFrenteUrl})`;
    cardStyle.backgroundSize = 'cover';
    cardStyle.backgroundPosition = 'center';
  }

  if (page === 'verso' && formData?.bgVersoUrl) {
    cardStyle.backgroundImage = `url(${formData.bgVersoUrl})`;
    cardStyle.backgroundSize = 'cover';
    cardStyle.backgroundPosition = 'center';
  }

  const handleDragStart = (event: React.MouseEvent, fieldId: string) => {
    if (!isEditable || !onChangePositions) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectField?.(fieldId);

    const cardElement = event.currentTarget.closest('[data-cracha-eleitoral-card="true"]') as HTMLElement | null;
    if (!cardElement) return;

    const rect = cardElement.getBoundingClientRect();
    const field = allFields.find((item: any) => item.id === fieldId);
    if (!field) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = Number(field.x || 0);
    const startTop = Number(field.y || 0);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const pctDeltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const pctDeltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const newX = Number(clamp(startLeft + pctDeltaX, -10, 105).toFixed(2));
      const newY = Number(clamp(startTop + pctDeltaY, -10, 105).toFixed(2));
      onChangePositions(allFields.map((item: any) => (item.id === fieldId ? { ...item, x: newX, y: newY } : item)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderSeal = (field: any, isSelected: boolean, commonStyle: React.CSSProperties, hoverOutlineStyle: string) => (
    <div
      key={field.id}
      style={{
        ...commonStyle,
        width: `${field.width || 14}%`,
        height: `${field.height || 12}%`,
        color: field.style?.color || '#1f2937',
      }}
      onMouseDown={(event) => handleDragStart(event, field.id)}
      onClick={(event) => {
        event.stopPropagation();
        if (isEditable) onSelectField?.(field.id);
      }}
      className={`${hoverOutlineStyle} flex flex-col items-center justify-center text-center`}
    >
      <div className="flex items-center justify-center rounded-full border-2 border-current font-black leading-none" style={{ width: '52%', height: '45%', fontSize: '5px' }}>
        PORVIR
      </div>
      <div className="mt-[1px] font-black leading-none tracking-widest" style={{ fontSize: '7px' }}>ESTADO DE</div>
      <div className="mt-[1px] border-y border-current px-1 font-black leading-none" style={{ fontSize: '12px' }}>SERGIPE</div>
      {isSelected && <span className="sr-only">Selecionado</span>}
    </div>
  );

  return (
    <div style={frameStyle}>
      <div
        data-cracha-eleitoral-card="true"
        style={cardStyle}
        onClick={() => isEditable && onSelectField?.(null)}
      >
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
                backgroundSize: '10% 10%, 10% 10%, 50% 50%, 50% 50%',
              }}
            />
            <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-blue-500/45" />
            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-blue-500/45" />
          </div>
        )}

        {!ocultarDesign && page === 'frente' && (
          <div className="absolute inset-y-0 left-0 z-0 w-[41mm]" style={{ backgroundColor: corPrimaria }}>
            <div className="absolute right-0 top-[17mm] h-[41mm] w-[31mm] bg-white" />
          </div>
        )}

        {filteredFields.map((field: any) => {
          const isSelected = selectedFieldId === field.id;
          const hoverOutlineStyle = isEditable ? 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-blue-500 hover:outline-offset-1' : '';
          const commonStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${field.x || 0}%`,
            top: `${field.y || 0}%`,
            cursor: isEditable ? 'move' : 'default',
            zIndex: isSelected ? 50 : (field.style?.zIndex || 15),
            outline: isSelected ? '2px dashed #2563eb' : undefined,
            outlineOffset: isSelected ? '2px' : undefined,
            boxSizing: 'border-box',
          };

          if (field.type === 'seal') {
            return renderSeal(field, isSelected, commonStyle, hoverOutlineStyle);
          }

          if (field.type === 'rect') {
            return (
              <div
                key={field.id}
                style={{
                  ...commonStyle,
                  width: `${field.width || 20}%`,
                  height: `${field.height || 3}%`,
                  backgroundColor: field.style?.backgroundColor || corPrimaria,
                  borderRadius: field.style?.borderRadius || '0',
                }}
                onMouseDown={(event) => handleDragStart(event, field.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) onSelectField?.(field.id);
                }}
                className={`${hoverOutlineStyle} transition-all`}
              />
            );
          }

          if (field.type === 'line') {
            return (
              <div
                key={field.id}
                style={{
                  ...commonStyle,
                  width: `${field.width || 30}%`,
                  height: field.height ? `${field.height}%` : '1px',
                  backgroundColor: field.style?.backgroundColor || field.style?.color || '#64748b',
                }}
                onMouseDown={(event) => handleDragStart(event, field.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) onSelectField?.(field.id);
                }}
                className={`${hoverOutlineStyle} transition-all`}
              />
            );
          }

          if (field.type === 'photo') {
            const initials = String(aluno?.nome || 'Aluno')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase();
            return (
              <div
                key={field.id}
                style={{
                  ...commonStyle,
                  width: `${field.width || 25}%`,
                  height: `${field.height || 46}%`,
                  overflow: 'hidden',
                  borderRadius: field.style?.borderRadius || '6px',
                  border: `${field.style?.borderWidth || '2px'} solid ${field.style?.borderColor || corPrimaria}`,
                  backgroundColor: '#e2e8f0',
                }}
                onMouseDown={(event) => handleDragStart(event, field.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) onSelectField?.(field.id);
                }}
                className={`${hoverOutlineStyle} transition-all`}
              >
                {aluno?.fotoUrl ? (
                  <img
                    src={aluno.fotoUrl}
                    alt={`Foto de ${aluno.nome || 'aluno'}`}
                    className="h-full w-full"
                    style={{ objectFit: field.style?.objectFit || 'cover' }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-black text-slate-400">
                    {initials}
                  </div>
                )}
              </div>
            );
          }

          if (field.type === 'image') {
            const imageBlendMode = field.style?.mixBlendMode || 'multiply';
            return (
              <div
                key={field.id}
                style={{
                  ...commonStyle,
                  width: `${field.width || 32}%`,
                  height: `${field.height || 8}%`,
                  mixBlendMode: imageBlendMode,
                  opacity: field.style?.opacity ?? 1,
                }}
                onMouseDown={(event) => handleDragStart(event, field.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) onSelectField?.(field.id);
                }}
                className={`${hoverOutlineStyle} transition-all`}
              >
                <img
                  src={field.value}
                  alt={field.label || 'Assinatura'}
                  draggable={false}
                  className="h-full w-full"
                  style={{
                    objectFit: field.style?.objectFit || 'contain',
                    opacity: 1,
                  }}
                />
              </div>
            );
          }

          const resolvedText = replaceVars(field.value, data);
          const style = field.style || {};
          const baseTextStyle: React.CSSProperties = {
            ...commonStyle,
            width: field.width ? `${field.width}%` : 'auto',
            minHeight: field.height ? `${field.height}%` : undefined,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: style.color || formData?.corTexto || corPrimaria,
            fontSize: style.fontSize || '14px',
            fontWeight: style.fontWeight || '700',
            fontStyle: style.fontStyle,
            lineHeight: style.lineHeight || '1.1',
            textAlign: style.textAlign || 'left',
            letterSpacing: 0,
            display: field.height ? 'flex' : undefined,
            alignItems: field.height ? 'center' : undefined,
            justifyContent: field.height
              ? style.textAlign === 'left'
                ? 'flex-start'
                : style.textAlign === 'right'
                  ? 'flex-end'
                  : 'center'
              : undefined,
          };

          if (field.type === 'boxText') {
            return (
              <div
                key={field.id}
                style={{
                  ...baseTextStyle,
                  height: field.height ? `${field.height}%` : undefined,
                  border: `1px solid ${style.borderColor || formData?.corBorda || corPrimaria}`,
                  borderRadius: style.borderRadius || '5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: style.textAlign === 'left' ? 'flex-start' : style.textAlign === 'right' ? 'flex-end' : 'center',
                  padding: '0 8px',
                  backgroundColor: style.backgroundColor || 'rgba(255,255,255,0.5)',
                }}
                onMouseDown={(event) => handleDragStart(event, field.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isEditable) onSelectField?.(field.id);
                }}
                className={`${hoverOutlineStyle} transition-all`}
              >
                {resolvedText}
              </div>
            );
          }

          return (
            <div
              key={field.id}
              style={baseTextStyle}
              onMouseDown={(event) => handleDragStart(event, field.id)}
              onClick={(event) => {
                event.stopPropagation();
                if (isEditable) onSelectField?.(field.id);
              }}
              className={`${hoverOutlineStyle} transition-all`}
            >
              {resolvedText}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CrachaPeriodoEleitoralPreview;
