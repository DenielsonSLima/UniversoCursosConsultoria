import React from 'react';
import { User, CreditCard } from 'lucide-react';

interface CarteirinhaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
  aluno?: {
    nome: string;
    cpf: string;
    rg: string;
    nascimento: string;
    matricula: string;
    curso: string;
    instituicao: string;
    validade: string;
    fotoUrl?: string | null;
    tipoDocumento?: string;
    tipo_documento?: string;
  };
  isEditable?: boolean;
  onChangePositions?: (positions: any) => void;
}

// Coordenadas padrão iniciais em porcentagem (%) para encaixe nos boxes do Photoshop
const posicoesPadrao: Record<string, { x: number; y: number }> = {
  foto: { x: 3.5, y: 22.0 },
  nome: { x: 25.0, y: 23.0 },
  instituicao: { x: 25.0, y: 39.5 },
  curso: { x: 25.0, y: 46.0 },
  rg: { x: 25.0, y: 56.5 },
  nascimento: { x: 52.0, y: 56.5 },
  cpf: { x: 25.0, y: 72.0 },
  matricula: { x: 3.5, y: 83.5 },
  qrcode: { x: 42.0, y: 80.0 },
  validade: { x: 75.0, y: 83.5 }
};

const CarteirinhaPreview: React.FC<CarteirinhaPreviewProps> = ({ 
  formData, 
  page, 
  zoomLevel, 
  aluno,
  isEditable = false,
  onChangePositions
}) => {
  // Tamanho padrão CR80: 85.6mm x 54mm (landscape)
  
  const studentData = aluno || {
    nome: 'ANA CLARA DOS SANTOS E SILVA',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    nascimento: '15/08/2005',
    matricula: '2026100123',
    curso: formData.tipoCurso === 'Cursos Livres' ? 'Design Gráfico para Web' : 'Técnico em Informática',
    instituicao: 'Instituto EAD e Tecnologia',
    validade: '31/03/2027',
    tipoDocumento: 'RG'
  };

  const getDocumentLabel = () => {
    const docType = studentData.tipoDocumento || studentData.tipo_documento || 'RG';
    const upper = docType.toUpperCase();
    if (upper.includes('CNH')) return 'CNH';
    if (upper.includes('CNI') || upper.includes('IDENTIFICAÇÃO') || upper.includes('IDENTIFICACAO') || upper.includes('CIN')) return 'CNI';
    if (upper.includes('PASSAPORTE')) return 'PASSAPORTE';
    if (upper.includes('PROFISSIONAL')) return 'PROF.';
    return 'RG';
  };

  const getDocumentDisplay = () => {
    const label = getDocumentLabel();
    const showLabel = (formData.exibirRotulos !== false) || (label !== 'RG');
    return showLabel ? `${label}: ${studentData.rg}` : studentData.rg;
  };

  const codeValidador = studentData.matricula;
  const urlValidador = `${window.location.origin}/validator?code=${codeValidador}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(urlValidador)}`;

  const useCustomBg = page === 'frente' ? !!formData.bgFrenteUrl : !!formData.bgVersoUrl;
  const usePhotoshopLayout = useCustomBg && !!formData.usePhotoshopLayout;
  const ocultarDesign = useCustomBg && (!!formData.ocultarDesignPadrao || usePhotoshopLayout);

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel / 100})`, 
    marginBottom: zoomLevel < 100 ? `-${54 * (1 - zoomLevel / 100)}mm` : '0',
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
    
    // Obtém o elemento pai (o container do cartão)
    const cardElement = e.currentTarget.parentElement;
    if (!cardElement) return;
    
    const rect = cardElement.getBoundingClientRect();
    const cardWidth = rect.width;
    const cardHeight = rect.height;
    
    const posicoesAtuais = formData.posicoes || posicoesPadrao;
    const pos = posicoesAtuais[key] || posicoesPadrao[key];
    
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

      // Converte pixels reais de delta para porcentagem com base nas dimensões reais do cartão sob zoom
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
    const pos = posicoesAtuais[key] || posicoesPadrao[key];
    return {
      position: 'absolute',
      left: `${pos.x}%`,
      top: `${pos.y}%`,
      cursor: isEditable ? 'move' : 'default',
    };
  };

  const getDragBorderClass = () => {
    return isEditable ? 'hover:outline-2 hover:outline-dashed hover:outline-pink-500 rounded-[0.5mm] transition-all' : '';
  };

  // RENDERIZADOR COM POSICIONAMENTO ARRASTÁVEL/FLEXÍVEL DO PHOTOSHOP
  if (usePhotoshopLayout) {
    const corTexto = formData.corTexto || '#1e293b';
    const fontNome = `${formData.tamanhoFonteNome || 8.5}px`;
    const fontDados = `${formData.tamanhoFonteDados || 7.0}px`;
    const fontRotulo = '5px';
    const exibirRotulos = formData.exibirRotulos !== false;

    // Foto width/height em porcentagem
    const fw = `${formData.fotoWidth || 18.5}%`;
    const fh = `${formData.fotoHeight || 44.0}%`;

    // Formatação da Validade para MM/AAAA
    const validadeParts = studentData.validade.split('/');
    const validadeMesAno = validadeParts.length === 3 ? `${validadeParts[1]}/${validadeParts[2]}` : studentData.validade;

    return (
      <div 
        className="bg-white w-[85.6mm] h-[54mm] shadow-2xl relative rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200 select-none"
        style={containerStyle}
      >
        {page === 'frente' ? (
          // FRENTE - POSICIONAMENTO DINÂMICO ARRASTÁVEL
          <>
            {/* Foto 3x4 do Aluno */}
            <div 
              style={{ ...getPosStyle('foto'), width: fw, height: fh }}
              onMouseDown={(e) => handleDragStart(e, 'foto')}
              className={`bg-slate-50 border border-slate-200/50 flex items-center justify-center rounded-[0.8mm] overflow-hidden z-15 ${getDragBorderClass()}`}
            >
              {studentData.fotoUrl || (studentData as any).foto ? (
                <img src={studentData.fotoUrl || (studentData as any).foto} alt="Foto do Aluno" className="w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-slate-300" />
              )}
            </div>

            {/* Nome do Aluno */}
            <div 
              style={getPosStyle('nome')}
              onMouseDown={(e) => handleDragStart(e, 'nome')}
              className={`w-[71%] h-[12%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ALUNO:</span>
                  <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.nome}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.nome}</span>
              )}
            </div>

            {/* Curso */}
            <div 
              style={getPosStyle('curso')}
              onMouseDown={(e) => handleDragStart(e, 'curso')}
              className={`w-[71%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CURSO:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.curso}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.curso}</span>
              )}
            </div>

            {/* RG */}
            <div 
              style={getPosStyle('rg')}
              onMouseDown={(e) => handleDragStart(e, 'rg')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getDocumentLabel()}:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.rg}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{getDocumentDisplay()}</span>
              )}
            </div>

            {/* Data de Nascimento */}
            <div 
              style={getPosStyle('nascimento')}
              onMouseDown={(e) => handleDragStart(e, 'nascimento')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DATA DE NASCIMENTO:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.nascimento}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.nascimento}</span>
              )}
            </div>

            {/* CPF */}
            <div 
              style={getPosStyle('cpf')}
              onMouseDown={(e) => handleDragStart(e, 'cpf')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPF:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.cpf}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.cpf}</span>
              )}
            </div>

            {/* Matrícula */}
            <div 
              style={getPosStyle('matricula')}
              onMouseDown={(e) => handleDragStart(e, 'matricula')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex items-center gap-1 leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MATRÍCULA:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.matricula}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.matricula}</span>
              )}
            </div>

            {/* QR Code de Validação Digital */}
            <div 
              style={getPosStyle('qrcode')}
              onMouseDown={(e) => handleDragStart(e, 'qrcode')}
              className={`w-[13%] h-[20.8%] bg-white p-[0.5mm] flex items-center justify-center rounded-[0.8mm] z-15 ${getDragBorderClass()}`}
            >
              <img src={qrCodeUrl} alt="QR" className="w-full h-full object-contain" />
            </div>

            {/* Validade de Meia Entrada */}
            <div 
              style={getPosStyle('validade')}
              onMouseDown={(e) => handleDragStart(e, 'validade')}
              className={`w-[35%] h-[12%] flex items-center justify-center text-center z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col items-center justify-center text-center leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>VALIDADE</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900 }}>{validadeMesAno}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900 }}>{validadeMesAno}</span>
              )}
            </div>
          </>
        ) : (
          // VERSO - POSICIONAMENTO ABSOLUTO DO VERSO DO PHOTOSHOP (Não-arrastável no verso)
          <>
            {/* Texto legal superior */}
            <div 
              className="absolute top-[16.5mm] left-[4mm] right-[4mm] text-center font-bold text-white text-[5px] leading-normal tracking-wide z-15 whitespace-pre-wrap drop-shadow-sm"
            >
              {formData.textoVerso || 'Esta Carteirinha é de Responsabilidade do Portador,\nPara uso Pessoal e Intransferível.'}
            </div>

            {/* Assinatura do Aluno */}
            <div 
              className="absolute top-[32.2mm] left-[5mm] w-[34mm] text-center font-bold text-slate-600 text-[5.5px] z-15 border-t border-slate-350 pt-[1.5mm]"
            >
              Assinatura do Aluno(a)
            </div>

            {/* Assinatura do Diretor */}
            <div 
              className="absolute top-[32.2mm] right-[5mm] w-[34mm] text-center font-bold text-slate-600 text-[5.5px] z-15 border-t border-slate-350 pt-[1.5mm]"
            >
              Assinatura do Diretor(a)
            </div>

            {/* URL da Instituição */}
            <div 
              className="absolute top-[48.2mm] left-[6mm] font-black text-slate-800 text-[6px] tracking-wide z-15"
            >
              www.universocc.com.br
            </div>

            {/* Data de Emissão */}
            <div 
              className="absolute top-[48.2mm] right-[6mm] font-bold text-slate-800 text-[5.5px] tracking-wide z-15 flex items-center gap-1"
            >
              <span>EMISSÃO:</span>
              <span className="font-black">18/06/2026</span>
            </div>
          </>
        )}
      </div>
    );
  }

  // LAYOUT PADRÃO (SE NÃO FOR O LAYOUT DE POSIÇÕES ABSOLUTAS DO PHOTOSHOP)
  return (
    <div 
      className="bg-white w-[85.6mm] h-[54mm] shadow-2xl relative flex flex-col rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200"
      style={containerStyle}
    >
       {page === 'frente' ? (
          // DESIGN FRENTE 
          <>
            {/* Cabeçalho colorido (ocultado se selecionado design customizado) */}
            {!ocultarDesign && (
              <div 
                className="h-10 flex items-center justify-center shrink-0"
                style={{ backgroundColor: formData.corPrimaria, color: '#fff' }}
              >
                <h2 className="text-[12px] font-black uppercase tracking-widest">{formData.textoFrente || 'CIE - Documento do Estudante'}</h2>
              </div>
            )}

            <div className={`flex flex-1 relative ${ocultarDesign ? 'bg-transparent' : 'bg-white'}`}>
               {/* Coluna da Foto */}
               <div className="w-[22mm] h-full flex flex-col items-center justify-start py-2 px-2 border-r border-slate-100/30 z-10" style={{ backgroundColor: ocultarDesign ? 'transparent' : formData.corSecundaria + '20' }}>
                  <div className="w-[18mm] h-[24mm] bg-white border border-slate-300 flex items-center justify-center rounded overflow-hidden">
                     {/* Placeholder de Foto */}
                     {studentData.fotoUrl || (studentData as any).foto ? (
                       <img src={studentData.fotoUrl || (studentData as any).foto} alt="Foto do Aluno" className="w-full h-full object-cover" />
                     ) : (
                       <User size={32} className="text-slate-300" />
                     )}
                  </div>
                  <div className="mt-2 text-center w-full bg-slate-900 text-white rounded p-0.5">
                     <p className="text-[6px] font-black uppercase tracking-wider">{studentData.validade.split('/')[2]}</p>
                  </div>
               </div>

               {/* Coluna de Dados */}
               <div className="flex-1 py-2 px-3 pl-2 flex flex-col justify-between z-10">
                  <div>
                     <h3 className="text-[10px] font-black text-slate-800 uppercase leading-tight line-clamp-2">
                       {studentData.nome}
                     </h3>
                     
                     <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                        <div>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">CPF</p>
                          <p className="text-[7px] font-bold text-slate-800">{studentData.cpf}</p>
                        </div>
                        <div>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">{getDocumentLabel()}</p>
                          <p className="text-[7px] font-bold text-slate-800">{studentData.rg}</p>
                        </div>
                        <div>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Nascimento</p>
                          <p className="text-[7px] font-bold text-slate-800">{studentData.nascimento}</p>
                        </div>
                        <div>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Matrícula</p>
                          <p className="text-[7px] font-bold text-slate-800">{studentData.matricula}</p>
                        </div>
                     </div>

                     <div className="mt-1">
                       <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Curso</p>
                       <p className="text-[8px] font-black text-slate-800 uppercase line-clamp-1">{studentData.curso}</p>
                     </div>
                     <div className="mt-1">
                       <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Instituição</p>
                       <p className="text-[7px] font-bold text-slate-700 uppercase line-clamp-1">{studentData.instituicao}</p>
                     </div>
                  </div>
                  
                  <div className={`flex items-center justify-between border-t border-slate-200/50 pt-1 mt-1`}>
                    <p className="text-[6px] font-black" style={{ color: formData.corPrimaria }}>
                       Válida até {studentData.validade}
                    </p>
                    {formData.tipoCurso === 'Cursos Livres' && (
                      <span className="text-[5px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase">Uso Interno</span>
                    )}
                  </div>
               </div>

               {/* Coluna do QR Code na Frente */}
               <div className="w-[18mm] h-full border-l border-slate-100/30 py-2 px-1 flex flex-col items-center justify-center text-center z-10" style={{ backgroundColor: ocultarDesign ? 'transparent' : formData.corSecundaria + '10' }}>
                  <img src={qrCodeUrl} alt="Validação QR" className="w-[13mm] h-[13mm] bg-white p-0.5 rounded shadow-sm mb-1" />
                  <p className="text-[4px] font-black text-slate-500 uppercase tracking-widest leading-none">
                    VALIDAÇÃO<br/>DIGITAL
                  </p>
               </div>

               {/* Marca d'água super sutil (ocultada se selecionado design customizado) */}
               {!ocultarDesign && (
                 <div className="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none overflow-hidden">
                   <CreditCard size={120} style={{ color: formData.corPrimaria, transform: 'rotate(-20deg)' }} />
                 </div>
               )}
            </div>
          </>
        ) : (
          // DESIGN VERSO
          <>
            <div className={`flex-1 flex flex-col p-3 relative ${ocultarDesign ? 'bg-transparent' : 'bg-slate-50'}`}>
              
              {/* Textos legais e informações */}
              <div className={`flex-1 pr-12 text-[5.5px] text-slate-700 leading-relaxed text-justify whitespace-pre-wrap font-medium ${ocultarDesign ? '' : 'mt-6'}`}>
                {formData.textoVerso}
              </div>

              {/* Footer do Verso */}
              <div className="border-t border-slate-300/30 pt-1 mt-1">
                <p className="text-[4px] font-bold text-slate-500 text-center uppercase">
                  Documento emitido digitalmente integrado ao sistema acadêmico
                </p>
              </div>

               {/* Tarja Magnética ou Barra de cor (estética - ocultada se selecionado design customizado) */}
               {!ocultarDesign && (
                 <div 
                   className="absolute top-0 left-0 right-0 h-4 bg-slate-800"
                 ></div>
               )}
            </div>
          </>
        )}
    </div>
  );
};

export default CarteirinhaPreview;
