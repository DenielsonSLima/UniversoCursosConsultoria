import React from 'react';
import { User, ShieldCheck } from 'lucide-react';
import { getDocumentValidationQrUrl } from '../../../../../shared/document-validation/document-validation.url';

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

// Coordenadas padrão iniciais em porcentagem (%) para o crachá vertical
const posicoesPadrao: Record<string, { x: number; y: number }> = {
  foto: { x: 27.5, y: 14 },
  nome: { x: 3.7, y: 47.0 },
  cargo: { x: 3.7, y: 53.0 },
  matricula: { x: 5.5, y: 60.0 },
  cpf: { x: 5.5, y: 66.2 },
  polo: { x: 5.5, y: 72.4 },
  qrcode: { x: 62.0, y: 60.0 }
};

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
  const qrCodeUrl = getDocumentValidationQrUrl(codeValidador);

  const useCustomBg = page === 'frente' ? !!formData.bgFrenteUrl : !!formData.bgVersoUrl;
  const ocultarDesign = useCustomBg && !!formData.ocultarDesignPadrao;

  // Novos campos padrão do verso (v2)
  const getNewVersoFields = (): any[] => [
    {
      id: 'verso_qrcode',
      type: 'qrcode',
      value: 'QR_VALIDADOR_CRACHA',
      x: 27.0,
      y: 10.0,
      width: 46,
      height: 26,
      page: 'verso'
    },
    {
      id: 'verso_nome',
      type: 'text',
      value: '{{ALUNO_NOME}}',
      x: 3.7,
      y: 38.0,
      width: 92.6,
      page: 'verso',
      style: { fontSize: '6px', fontWeight: 'bold', color: '#1e293b', textAlign: 'center' }
    },
    {
      id: 'verso_matricula',
      type: 'text',
      value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
      x: 3.7,
      y: 43.0,
      width: 92.6,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
    },
    {
      id: 'verso_cpf',
      type: 'text',
      value: 'CPF: {{ALUNO_CPF}}',
      x: 3.7,
      y: 47.0,
      width: 92.6,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
    },
    {
      id: 'verso_curso',
      type: 'text',
      value: 'CURSO: {{ALUNO_CURSO}}',
      x: 3.7,
      y: 51.0,
      width: 92.6,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
    },
    {
      id: 'verso_url_validador',
      type: 'text',
      value: 'www.universocc.com.br/validador',
      x: 3.7,
      y: 55.5,
      width: 92.6,
      page: 'verso',
      style: { fontSize: '4.5px', fontWeight: 'bold', color: '#dc2626', textAlign: 'center' }
    },
    {
      id: 'instrucoes',
      type: 'text',
      value: formData.textoVerso || 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
      x: 5.0,
      y: 60.0,
      width: 90.0,
      page: 'verso',
      style: { fontSize: '4.2px', fontWeight: 'normal', color: '#64748b', textAlign: 'left' }
    },
    {
      id: 'emissao_label',
      type: 'text',
      value: 'EMISSÃO',
      x: 5.0,
      y: 86.0,
      page: 'verso',
      style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' }
    },
    {
      id: 'emissao_valor',
      type: 'text',
      value: '{{DATA_HOJE}}',
      x: 5.0,
      y: 89.0,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' }
    },
    {
      id: 'validade_label',
      type: 'text',
      value: 'VALIDADE',
      x: 55.0,
      y: 86.0,
      page: 'verso',
      style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' }
    },
    {
      id: 'validade_valor',
      type: 'text',
      value: '{{DATA_VALIDADE}}',
      x: 55.0,
      y: 89.0,
      page: 'verso',
      style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' }
    }
  ];

  // Resolvendo a lista de campos com fallback para compatibilidade retroativa
  const getActiveFields = (): any[] => {
    if (formData.fields && Array.isArray(formData.fields) && formData.fields.length > 0) {
      // Migração em tempo de renderização: detecta verso antigo e substitui
      const oldVersoIds = ['admissao_label', 'admissao_valor', 'assinatura_linha', 'assinatura_cargo', 'assinatura_instituicao'];
      const hasOldVerso = formData.fields.some((f: any) => oldVersoIds.includes(f.id));
      const hasNewVerso = formData.fields.some((f: any) => f.id === 'verso_qrcode');

      if (hasOldVerso && !hasNewVerso) {
        const frenteFields = formData.fields.filter((f: any) => (f.page || 'frente') !== 'verso');
        return [...frenteFields, ...getNewVersoFields()];
      }
      if (!hasNewVerso) {
        const frenteFields = formData.fields.filter((f: any) => (f.page || 'frente') !== 'verso');
        return [...frenteFields, ...getNewVersoFields()];
      }
      return formData.fields;
    }

    // Fallback: se não houver fields, reconstrói usando posições antigas/padrão
    const pos = formData.posicoes || posicoesPadrao;
    return [
      {
        id: 'foto',
        type: 'foto',
        value: '{{ALUNO_FOTO}}',
        x: pos.foto?.x ?? 27.5,
        y: pos.foto?.y ?? 14,
        width: formData.fotoWidth || 45,
        height: formData.fotoHeight || 28.5,
        page: 'frente'
      },
      {
        id: 'nome',
        type: 'text',
        value: '{{ALUNO_NOME}}',
        x: pos.nome?.x ?? 3.7,
        y: pos.nome?.y ?? 47.0,
        page: 'frente',
        style: { fontWeight: 'bold', fontSize: `${formData.tamanhoFonteNome || 8.5}px`, textAlign: 'center', color: formData.corTexto || '#1e293b' }
      },
      {
        id: 'cargo',
        type: 'text',
        value: formData.textoFrente || formData.cargoPadrao || 'ESTAGIÁRIO',
        x: pos.cargo?.x ?? 3.7,
        y: pos.cargo?.y ?? 53.0,
        page: 'frente',
        style: { fontWeight: 'bold', fontSize: `${formData.tamanhoFonteDados || 7.5}px`, textAlign: 'center', color: formData.corSecundaria || '#10b981' }
      },
      {
        id: 'matricula',
        type: 'text',
        value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
        x: pos.matricula?.x ?? 5.5,
        y: pos.matricula?.y ?? 60.0,
        page: 'frente',
        style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
      },
      {
        id: 'cpf',
        type: 'text',
        value: 'CPF: {{ALUNO_CPF}}',
        x: pos.cpf?.x ?? 5.5,
        y: pos.cpf?.y ?? 66.2,
        page: 'frente',
        style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
      },
      {
        id: 'polo',
        type: 'text',
        value: 'POLO: {{POLO_NOME}}',
        x: pos.polo?.x ?? 5.5,
        y: pos.polo?.y ?? 72.4,
        page: 'frente',
        style: { fontSize: `${formData.tamanhoFonteDados || 6.8}px`, color: formData.corTexto || '#1e293b' }
      },
      {
        id: 'qrcode',
        type: 'qrcode',
        value: 'QR_VALIDADOR_CRACHA',
        x: pos.qrcode?.x ?? 62.0,
        y: pos.qrcode?.y ?? 60.0,
        width: 22,
        height: 14,
        page: 'frente'
      },
      // --- VERSO: QR Code ---
      {
        id: 'verso_qrcode',
        type: 'qrcode',
        value: 'QR_VALIDADOR_CRACHA',
        x: 27.0,
        y: 10.0,
        width: 46,
        height: 26,
        page: 'verso'
      },
      // --- VERSO: Dados do Aluno ---
      {
        id: 'verso_nome',
        type: 'text',
        value: '{{ALUNO_NOME}}',
        x: 3.7,
        y: 38.0,
        width: 92.6,
        page: 'verso',
        style: { fontSize: '6px', fontWeight: 'bold', color: '#1e293b', textAlign: 'center' }
      },
      {
        id: 'verso_matricula',
        type: 'text',
        value: 'MATRÍCULA: {{ALUNO_MATRICULA}}',
        x: 3.7,
        y: 43.0,
        width: 92.6,
        page: 'verso',
        style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
      },
      {
        id: 'verso_cpf',
        type: 'text',
        value: 'CPF: {{ALUNO_CPF}}',
        x: 3.7,
        y: 47.0,
        width: 92.6,
        page: 'verso',
        style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
      },
      {
        id: 'verso_curso',
        type: 'text',
        value: 'CURSO: {{ALUNO_CURSO}}',
        x: 3.7,
        y: 51.0,
        width: 92.6,
        page: 'verso',
        style: { fontSize: '5px', fontWeight: 'bold', color: '#475569', textAlign: 'center' }
      },
      // --- VERSO: URL de Validação em vermelho ---
      {
        id: 'verso_url_validador',
        type: 'text',
        value: 'www.universocc.com.br/validador',
        x: 3.7,
        y: 55.5,
        width: 92.6,
        page: 'verso',
        style: { fontSize: '4.5px', fontWeight: 'bold', color: '#dc2626', textAlign: 'center' }
      },
      // --- VERSO: Instruções de Uso ---
      {
        id: 'instrucoes',
        type: 'text',
        value: formData.textoVerso || 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
        x: 5.0,
        y: 60.0,
        width: 90.0,
        page: 'verso',
        style: { fontSize: '4.2px', fontWeight: 'normal', color: '#64748b', textAlign: 'left' }
      },
      // --- VERSO: Data de Emissão e Validade ---
      {
        id: 'emissao_label',
        type: 'text',
        value: 'EMISSÃO',
        x: 5.0,
        y: 86.0,
        page: 'verso',
        style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' }
      },
      {
        id: 'emissao_valor',
        type: 'text',
        value: '{{DATA_HOJE}}',
        x: 5.0,
        y: 89.0,
        page: 'verso',
        style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' }
      },
      {
        id: 'validade_label',
        type: 'text',
        value: 'VALIDADE',
        x: 55.0,
        y: 86.0,
        page: 'verso',
        style: { fontSize: '3.5px', fontWeight: 'bold', color: '#94a3b8' }
      },
      {
        id: 'validade_valor',
        type: 'text',
        value: '{{DATA_VALIDADE}}',
        x: 55.0,
        y: 89.0,
        page: 'verso',
        style: { fontSize: '5px', fontWeight: 'bold', color: '#475569' }
      }
    ];
  };

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

    const allFields = getActiveFields();
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

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel / 100})`, 
    marginBottom: zoomLevel < 100 ? `-${85.6 * (1 - zoomLevel / 100)}mm` : '0',
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
    transformOrigin: 'top',
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

  const filteredFields = getActiveFields().filter((f: any) => (f.page || 'frente') === page);

  return (
    <div style={containerStyle} className="bg-white">
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
                borderRadius: '50%',
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
              <img src={qrCodeUrl} alt="QR" className="w-full object-contain pointer-events-none" style={{ aspectRatio: '1/1' }} />
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
  );
};

export default CrachaPreview;
