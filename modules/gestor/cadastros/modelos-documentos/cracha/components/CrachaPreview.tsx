import React from 'react';
import { User, ShieldCheck } from 'lucide-react';

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
    validade?: string;
    fotoUrl?: string | null;
    foto?: string | null;
  };
  isEditable?: boolean;
  onChangePositions?: (positions: any) => void;
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
  onChangePositions
}) => {
  // Tamanho padrão CR80 Vertical: 54mm x 85.6mm
  const collaboratorData = aluno ? {
    nome: aluno.nome,
    cargo: aluno.cargo || formData.cargoPadrao || 'COLABORADOR',
    matricula: aluno.matricula,
    cpf: aluno.cpf,
    polo: aluno.polo || 'POLO JAPOATÃ (MATRIZ)',
    admissao: '05/01/2024',
    emissao: new Date().toLocaleDateString('pt-BR'),
    instituicao: 'UNIVERSO CURSOS E CONSULTORIA',
    fotoUrl: aluno.fotoUrl || aluno.foto || null
  } : {
    nome: 'CARLOS HENRIQUE DE OLIVEIRA',
    cargo: formData.cargoPadrao || 'COORDENADOR PEDAGÓGICO',
    matricula: '2026F987',
    cpf: '987.654.321-99',
    polo: 'POLO JAPOATÃ (MATRIZ)',
    admissao: '05/01/2024',
    emissao: '18/06/2026',
    instituicao: 'UNIVERSO CURSOS E CONSULTORIA',
    fotoUrl: null
  };

  const codeValidador = collaboratorData.matricula;
  const urlValidador = `${window.location.origin}/validator?code=${codeValidador}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidador)}`;

  const useCustomBg = page === 'frente' ? !!formData.bgFrenteUrl : !!formData.bgVersoUrl;
  const usePhotoshopLayout = useCustomBg && !!formData.usePhotoshopLayout;
  const ocultarDesign = useCustomBg && (!!formData.ocultarDesignPadrao || usePhotoshopLayout);

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel / 100})`, 
    marginBottom: zoomLevel < 100 ? `-${85.6 * (1 - zoomLevel / 100)}mm` : '0',
    backgroundColor: 'white'
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

  // LÓGICA DO DRAG & DROP NATIVO EM PORCENTAGEM
  const handleDragStart = (e: React.MouseEvent, key: string) => {
    if (!isEditable || page !== 'frente') return;
    e.preventDefault();
    e.stopPropagation();
    
    const cardElement = e.currentTarget.parentElement;
    if (!cardElement) return;
    
    const rect = cardElement.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;
    
    const posicoesAtuais = formData.posicoes || posicoesPadrao;
    let pos = posicoesAtuais[key];
    
    // Compatibilidade retroativa para templates salvos com 'dados_bloco'
    if (!pos && posicoesAtuais.dados_bloco) {
      const db = posicoesAtuais.dados_bloco;
      if (key === 'matricula') pos = { x: db.x, y: db.y };
      else if (key === 'cpf') pos = { x: db.x, y: db.y + 6.2 };
      else if (key === 'polo') pos = { x: db.x, y: db.y + 12.4 };
      else if (key === 'qrcode') pos = { x: db.x + 56.5, y: db.y };
    }
    
    if (!pos) pos = posicoesPadrao[key];
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = pos.x; // em %
    const startTop = pos.y; // em %
 
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      const zoomFactor = zoomLevel / 100;
      const actualDeltaX = deltaX / zoomFactor;
      const actualDeltaY = deltaY / zoomFactor;
 
      const pctDeltaX = (actualDeltaX / (cardWidth / zoomFactor)) * 100;
      const pctDeltaY = (actualDeltaY / (cardHeight / zoomFactor)) * 100;
 
      const newX = parseFloat(Math.min(95, Math.max(0, startLeft + pctDeltaX)).toFixed(2));
      const newY = parseFloat(Math.min(95, Math.max(0, startTop + pctDeltaY)).toFixed(2));
 
      const novasPosicoes = {
        ...(formData.posicoes || posicoesPadrao),
        [key]: { x: newX, y: newY }
      };
 
      if (onChangePositions) {
        onChangePositions(novasPosicoes);
      }
    };
 
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
 
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
 
  const getPosStyle = (key: string): React.CSSProperties => {
    const posicoesAtuais = formData.posicoes || posicoesPadrao;
    let pos = posicoesAtuais[key];
    
    // Compatibilidade retroativa para templates salvos com 'dados_bloco'
    if (!pos && posicoesAtuais.dados_bloco) {
      const db = posicoesAtuais.dados_bloco;
      if (key === 'matricula') pos = { x: db.x, y: db.y };
      else if (key === 'cpf') pos = { x: db.x, y: db.y + 6.2 };
      else if (key === 'polo') pos = { x: db.x, y: db.y + 12.4 };
      else if (key === 'qrcode') pos = { x: db.x + 56.5, y: db.y };
    }
    
    if (!pos) pos = posicoesPadrao[key];
    
    return {
      position: 'absolute',
      left: `${pos.x}%`,
      top: `${pos.y}%`,
      cursor: isEditable ? 'move' : 'default',
    };
  };

  const getDragBorderClass = () => {
    return isEditable ? 'hover:outline-2 hover:outline-dashed hover:outline-blue-500 rounded-[0.5mm] transition-all' : '';
  };

  // RENDERIZADOR COM POSICIONAMENTO ARRASTÁVEL DO PHOTOSHOP
  if (usePhotoshopLayout) {
    const corTexto = formData.corTexto || '#1e293b';
    const fontNome = `${formData.tamanhoFonteNome || 8.5}px`;
    const fontDados = `${formData.tamanhoFonteDados || 6.8}px`;
    const fontRotulo = '4.5px';
    const exibirRotulos = formData.exibirRotulos !== false;

    // Foto width/height em porcentagem
    const fw = `${formData.fotoWidth || 45.0}%`;
    const fh = `${formData.fotoHeight || 28.5}%`;

    return (
      <div 
        className="bg-white w-[54mm] h-[85.6mm] shadow-2xl relative flex flex-col rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200 select-none"
        style={containerStyle}
      >
        {page === 'frente' ? (
          // FRENTE - POSICIONAMENTO DINÂMICO ARRASTÁVEL
          <>
            {/* Foto Circular do Colaborador */}
            <div 
              style={{ ...getPosStyle('foto'), width: fw, height: fh }}
              onMouseDown={(e) => handleDragStart(e, 'foto')}
              className={`rounded-full border-2 border-slate-200/50 flex items-center justify-center bg-slate-50 overflow-hidden z-15 ${getDragBorderClass()}`}
            >
              {collaboratorData.fotoUrl ? (
                <img src={collaboratorData.fotoUrl} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <User size={42} className="text-slate-300" />
              )}
            </div>

            {/* Nome do Colaborador */}
            <div 
              style={getPosStyle('nome')}
              onMouseDown={(e) => handleDragStart(e, 'nome')}
              className={`w-[92.6%] h-[10%] flex items-center justify-center text-center z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-center leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>NOME:</span>
                  <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{collaboratorData.nome}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{collaboratorData.nome}</span>
              )}
            </div>

            {/* Cargo / Função */}
            <div 
              onMouseDown={(e) => handleDragStart(e, 'cargo')}
              className={`w-[92.6%] h-[8%] flex items-center justify-center text-center z-15 ${getDragBorderClass()}`}
              style={getPosStyle('cargo')}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-center leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CARGO:</span>
                  <span style={{ fontSize: fontDados, color: formData.corPrimaria || corTexto, fontWeight: 800, textTransform: 'uppercase' }}>{collaboratorData.cargo}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: formData.corPrimaria || corTexto, fontWeight: 800, textTransform: 'uppercase' }}>{collaboratorData.cargo}</span>
              )}
            </div>

            {/* Matrícula */}
            <div 
              style={getPosStyle('matricula')}
              onMouseDown={(e) => handleDragStart(e, 'matricula')}
              className={`w-[50%] h-[8%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MATRÍCULA:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.matricula}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.matricula}</span>
              )}
            </div>

            {/* CPF */}
            <div 
              style={getPosStyle('cpf')}
              onMouseDown={(e) => handleDragStart(e, 'cpf')}
              className={`w-[50%] h-[8%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPF:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.cpf}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.cpf}</span>
              )}
            </div>

            {/* Polo */}
            <div 
              style={getPosStyle('polo')}
              onMouseDown={(e) => handleDragStart(e, 'polo')}
              className={`w-[60%] h-[8%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>POLO:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.polo}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{collaboratorData.polo}</span>
              )}
            </div>

            {/* QR Code de Validação */}
            <div 
              style={getPosStyle('qrcode')}
              onMouseDown={(e) => handleDragStart(e, 'qrcode')}
              className={`w-[22%] h-[14%] bg-white p-[0.5mm] flex flex-col items-center justify-center rounded-[0.8mm] shadow-sm z-15 ${getDragBorderClass()}`}
            >
              <img src={qrCodeUrl} alt="QR" className="w-full h-full object-contain" />
              <p className="text-[3.2px] font-black text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                VALIDAR
              </p>
            </div>
          </>
        ) : (
          // VERSO - POSICIONAMENTO ABSOLUTO VERTICAL DO VERSO (Não-arrastável no verso)
          <>
            {/* Termos de Uso */}
            <div 
              className="absolute top-[12mm] left-[4mm] right-[4mm] text-center font-bold text-slate-600 text-[5px] leading-normal tracking-wide z-15 whitespace-pre-wrap"
            >
              {formData.textoVerso || 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal e obrigatório nas dependências da instituição.'}
            </div>

            {/* Datas */}
            <div className="absolute top-[52mm] left-[4mm] right-[4mm] grid grid-cols-2 gap-2 border-t border-slate-200/50 pt-2 text-left z-15">
              <div>
                <p className="text-[3.8px] font-black text-slate-400 uppercase leading-none">Admissão</p>
                <p className="text-[5.8px] font-bold text-slate-600 mt-0.5 leading-none">{collaboratorData.admissao}</p>
              </div>
              <div>
                <p className="text-[3.8px] font-black text-slate-400 uppercase leading-none">Emissão</p>
                <p className="text-[5.8px] font-bold text-slate-600 mt-0.5 leading-none">{collaboratorData.emissao}</p>
              </div>
            </div>

            {/* Rodapé */}
            <div 
              className="absolute top-[68mm] left-[4mm] right-[4mm] text-center border-t border-slate-200/50 pt-[1.5mm] z-15"
            >
              <p className="text-[4px] font-bold text-slate-400 uppercase leading-none">
                Diretoria de Recursos Humanos
              </p>
              <p className="text-[5px] font-black text-slate-600 mt-1 uppercase tracking-wider leading-none">
                UNIVERSO CURSOS E CONSULTORIA
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  // LAYOUT PADRÃO (SE NÃO FOR O LAYOUT DE POSIÇÕES ABSOLUTAS DO PHOTOSHOP)
  return (
    <div 
      className="bg-white w-[54mm] h-[85.6mm] shadow-2xl relative flex flex-col rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200"
      style={containerStyle}
    >
       {page === 'frente' ? (
         // DESIGN FRENTE (Vertical)
         <>
           {/* Faixa decorativa do Topo */}
           {!ocultarDesign && (
             <>
               <div 
                 className="h-10 flex flex-col items-center justify-center shrink-0 px-2 text-center"
                 style={{ backgroundColor: formData.corPrimaria, color: '#fff' }}
               >
                 <h4 className="text-[6px] font-black tracking-widest opacity-80 uppercase">Universo</h4>
                 <h2 className="text-[9px] font-black uppercase tracking-wider leading-none">Cursos e Consultoria</h2>
               </div>
               {/* Linha fina de transição (Cor Secundária) */}
               <div className="h-1 w-full" style={{ backgroundColor: formData.corSecundaria }}></div>
             </>
           )}

           <div className={`flex-1 flex flex-col items-center justify-between py-3 px-2 relative ${ocultarDesign ? 'bg-transparent' : 'bg-slate-50/35'}`}>
              {/* Moldura da Foto */}
              <div 
                className="w-[24mm] h-[24mm] rounded-full border-4 flex items-center justify-center bg-white shadow-md overflow-hidden z-10"
                style={{ borderColor: ocultarDesign ? 'transparent' : formData.corSecundaria }}
              >
                {collaboratorData.fotoUrl ? (
                  <img src={collaboratorData.fotoUrl} alt="Foto" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User size={48} className="text-slate-300" />
                  </div>
                )}
              </div>

              {/* Informações do Colaborador */}
              <div className="w-full text-center z-10 flex-1 flex flex-col justify-center mt-2">
                <h3 className="text-[9.5px] font-black text-slate-900 uppercase tracking-tight leading-tight line-clamp-2 px-1">
                  {collaboratorData.nome}
                </h3>
                <p 
                  className="text-[7.5px] font-extrabold uppercase mt-1 tracking-wide line-clamp-1"
                  style={{ color: formData.corPrimaria }}
                >
                  {collaboratorData.cargo}
                </p>
              </div>

              {/* Dados de Identificação + QR Code na Frente */}
              <div className="w-full flex items-stretch gap-1.5 mt-2 z-10">
                {/* Dados */}
                <div className="flex-1 bg-white rounded-lg border border-slate-100 p-1.5 shadow-sm text-left flex flex-col gap-0.5 justify-center">
                  <div>
                    <p className="text-[3.8px] font-black text-slate-400 uppercase tracking-widest leading-none">Matrícula</p>
                    <p className="text-[5.8px] font-bold text-slate-700 leading-none">{collaboratorData.matricula}</p>
                  </div>
                  <div className="mt-1">
                    <p className="text-[3.8px] font-black text-slate-400 uppercase tracking-widest leading-none">CPF</p>
                    <p className="text-[5.8px] font-bold text-slate-700 leading-none">{collaboratorData.cpf}</p>
                  </div>
                  <div className="mt-1">
                    <p className="text-[3.8px] font-black text-slate-400 uppercase tracking-widest leading-none">Polo</p>
                    <p className="text-[5.8px] font-bold text-slate-700 truncate leading-none">{collaboratorData.polo}</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="w-[15.5mm] bg-white rounded-lg border border-slate-100 p-1 flex flex-col items-center justify-center text-center shadow-sm">
                  <img src={qrCodeUrl} alt="Validação QR" className="w-[10.5mm] h-[10.5mm] bg-white" />
                  <p className="text-[3.2px] font-black text-slate-500 uppercase tracking-widest leading-none mt-1">
                    VALIDAR
                  </p>
                </div>
              </div>

              {/* Rodapé Colorido de Classificação */}
              {!ocultarDesign && (
                <div 
                  className="w-full py-1 text-center rounded-lg mt-2 z-10"
                  style={{ backgroundColor: formData.corPrimaria, color: '#fff' }}
                >
                  <p className="text-[7px] font-black tracking-widest uppercase">
                    {formData.textoFrente || 'COLABORADOR'}
                  </p>
                </div>
              )}

              {/* Marca d'água super sutil */}
              {!ocultarDesign && (
                <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
                  <ShieldCheck size={180} style={{ color: formData.corPrimaria }} />
                </div>
              )}
           </div>
         </>
       ) : (
         // DESIGN VERSO
         <>
           {/* Tarja superior simulando crachá corporativo */}
           {!ocultarDesign && (
             <div className="h-6 bg-slate-800 w-full flex items-center justify-center shrink-0">
               <div className="w-8 h-2 bg-slate-700 rounded-full"></div>
             </div>
           )}

           <div className={`flex-1 flex flex-col p-3 relative justify-between ${ocultarDesign ? 'bg-transparent' : 'bg-slate-50/80'}`}>
              {/* Termo e Instruções */}
              <div className={`text-[5px] text-slate-600 leading-normal text-justify whitespace-pre-wrap font-medium ${ocultarDesign ? 'pt-4' : ''}`}>
                {formData.textoVerso || 
                  'INSTRUÇÕES DE USO:\n' +
                  '1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição.\n' +
                  '2. Mantenha-o sempre visível em local adequado com cordão de segurança.\n' +
                  '3. Em caso de perda, roubo ou extravio, comunique imediatamente o setor administrativo.\n' +
                  '4. Se encontrado, favor devolver à Universo Cursos e Consultoria.'
                }
              </div>

              {/* Bloco de Datas e Informações Adicionais */}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200/50 pt-2 mt-2 text-left">
                <div>
                  <p className="text-[4px] font-black text-slate-400 uppercase">Admissão</p>
                  <p className="text-[6px] font-bold text-slate-600">{collaboratorData.admissao}</p>
                </div>
                <div>
                  <p className="text-[4px] font-black text-slate-400 uppercase">Emissão</p>
                  <p className="text-[6px] font-bold text-slate-600">{collaboratorData.emissao}</p>
                </div>
              </div>

              {/* Footer do Verso */}
              <div className="border-t border-slate-200/50 pt-2 mt-2 text-center">
                <p className="text-[4px] font-bold text-slate-400 uppercase">
                  Emitido por Universo Cursos e Consultoria
                </p>
              </div>
           </div>
         </>
       )}
    </div>
  );
};

export default CrachaPreview;
