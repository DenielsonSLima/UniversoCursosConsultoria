import React, { useState, useEffect } from 'react';
import { assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import { resolveStudentIdentityDocument } from '../../../../../shared/utils/studentIdentityDocument';
import { CarteirinhaAbsoluteLayout } from './CarteirinhaAbsoluteLayout';
import { CarteirinhaStandardLayout } from './CarteirinhaStandardLayout';

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
    validationCode?: string;
    poloRazaoSocial?: string;
    poloCnpj?: string;
    poloTelefone?: string;
  };
  showValidationQrCode?: boolean;
  isEditable?: boolean;
  transformOrigin?: React.CSSProperties['transformOrigin'];
  onChangePositions?: (positions: any) => void;
}

// Coordenadas padrão iniciais em porcentagem (%) para encaixe nos boxes do Photoshop
const posicoesPadrao: Record<string, { x: number; y: number }> = {
  // Frente
  foto: { x: 3.5, y: 22.0 },
  nome: { x: 25.0, y: 23.0 },
  instituicao: { x: 25.0, y: 39.5 },
  curso: { x: 25.0, y: 46.0 },
  rg: { x: 25.0, y: 56.5 },
  nascimento: { x: 52.0, y: 56.5 },
  cpf: { x: 25.0, y: 72.0 },
  matricula: { x: 3.5, y: 83.5 },
  qrcode: { x: 42.0, y: 80.0 },
  codigoValidacao: { x: 42.0, y: 94.0 },
  validade: { x: 75.0, y: 83.5 },
  // Verso
  textoVerso: { x: 5.0, y: 20.0 },
  dadosInstitucionais: { x: 5.0, y: 47.0 },
  assinaturaAluno: { x: 6.0, y: 58.0 },
  assinaturaDiretor: { x: 54.0, y: 58.0 },
  assinaturaDiretorImagem: { x: 58.0, y: 44.0 },
  siteValidador: { x: 7.0, y: 88.0 },
  dataEmissao: { x: 65.0, y: 88.0 }
};

const CarteirinhaPreview: React.FC<CarteirinhaPreviewProps> = ({ 
  formData, 
  page, 
  zoomLevel, 
  aluno,
  showValidationQrCode = true,
  isEditable = false,
  transformOrigin = 'top center',
  onChangePositions
}) => {
  // Tamanho padrão CR80: 85.6mm x 54mm (landscape)
  const requiresRemoteSignature = page === 'verso'
    && formData.showAssinaturaDiretor !== false
    && formData.assinaturaOrigem
    && formData.assinaturaOrigem !== 'manual'
    && formData.assinaturaOrigem !== 'none';

  // Busca assinatura central do Supabase de forma assíncrona (multi-browser safe)
  const [assinaturaUrl, setAssinaturaUrl] = useState<string>(
    formData.assinaturaOrigem === 'manual' || !formData.assinaturaOrigem || formData.assinaturaOrigem === 'none'
      ? (formData.assinaturaDiretorPngUrl || '')
      : (assinaturasService.getSignaturesSync()[formData.assinaturaOrigem as keyof ReturnType<typeof assinaturasService.getSignaturesSync>] || '')
  );
  const [signatureState, setSignatureState] = useState<'loading' | 'ready' | 'error'>(() => (
    requiresRemoteSignature ? 'loading' : 'ready'
  ));

  useEffect(() => {
    let active = true;
    if (page !== 'verso' || formData.showAssinaturaDiretor === false) {
      setSignatureState('ready');
    } else if (formData.assinaturaOrigem === 'manual') {
      setAssinaturaUrl(formData.assinaturaDiretorPngUrl || '');
      setSignatureState('ready');
    } else if (formData.assinaturaOrigem && formData.assinaturaOrigem !== 'none') {
      setSignatureState('loading');
      // Busca do Supabase — fonte primária — garante sincronização entre navegadores
      assinaturasService.getSignatures().then((sigs) => {
        if (!active) return;
        const url = sigs[formData.assinaturaOrigem as keyof typeof sigs] || '';
        setAssinaturaUrl(url);
        setSignatureState(url ? 'ready' : 'error');
      }).catch(() => {
        if (!active) return;
        // fallback: tenta sync (pode ser vazio no primeiro acesso)
        const syncSigs = assinaturasService.getSignaturesSync();
        const url = syncSigs[formData.assinaturaOrigem as keyof typeof syncSigs] || '';
        setAssinaturaUrl(url);
        setSignatureState(url ? 'ready' : 'error');
      });
    } else {
      setAssinaturaUrl(formData.assinaturaDiretorPngUrl || '');
      setSignatureState('ready');
    }
    return () => { active = false; };
  }, [formData.assinaturaOrigem, formData.assinaturaDiretorPngUrl, formData.showAssinaturaDiretor, page]);

  const renderReadinessProps = {
    'data-render-ready': signatureState === 'loading' ? 'false' : 'true',
    'data-render-error': signatureState === 'error'
      ? 'A assinatura institucional não pôde ser carregada.'
      : undefined,
  };

  const studentData = aluno || {
    nome: 'ANA CLARA DOS SANTOS E SILVA',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    nascimento: '15/08/2005',
    matricula: '2026100123',
    curso: formData.tipoCurso === 'Cursos Livres' ? 'Design Gráfico para Web' : 'Técnico em Informática',
    instituicao: 'Instituto EAD e Tecnologia',
    validade: '31/03/2027',
    tipoDocumento: 'RG',
    validationCode: 'CIE-AB12-CD34-EF56',
    poloRazaoSocial: 'Universo Cursos e Consultoria Ltda.',
    poloCnpj: '00.000.000/0001-00',
    poloTelefone: '(79) 99999-9999',
  };

  const identity = resolveStudentIdentityDocument({
    ...studentData,
    tipoDocumento: studentData.tipoDocumento || studentData.tipo_documento,
  });
  const getDocumentLabel = () => {
    if (identity.isCin) return 'CIN';
    if (identity.type === 'RG (ANTIGO)') return 'RG';
    if (identity.type === 'CNH') return 'CNH';
    if (identity.type === 'CARTEIRA PROFISSIONAL') return 'PROF.';
    return identity.type === 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO' ? 'DOC.' : identity.label;
  };
  const getDocumentDisplay = () => (
    getDocumentLabel() && (formData.exibirRotulos !== false || getDocumentLabel() !== 'RG')
      ? `${getDocumentLabel()}: ${identity.number}`
      : identity.number
  );

  const codeValidador = studentData.validationCode || studentData.matricula;
  const institutionalText = [
    studentData.poloRazaoSocial,
    studentData.poloCnpj ? `CNPJ: ${studentData.poloCnpj}` : null,
    studentData.poloTelefone ? `Contato: ${studentData.poloTelefone}` : null,
  ].filter(Boolean).join('\n');

  const useCustomBg = page === 'frente' ? !!formData.bgFrenteUrl : !!formData.bgVersoUrl;
  const customBackgroundUrl = page === 'frente' ? formData.bgFrenteUrl : formData.bgVersoUrl;
  const usePhotoshopLayout = useCustomBg && !!formData.usePhotoshopLayout;
  const ocultarDesign = useCustomBg && (!!formData.ocultarDesignPadrao || usePhotoshopLayout);

  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomLevel / 100})`, 
    marginBottom: zoomLevel < 100 ? `-${54 * (1 - zoomLevel / 100)}mm` : '0',
    backgroundColor: useCustomBg ? 'transparent' : 'white',
    isolation: 'isolate',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontKerning: 'none',
    fontVariantLigatures: 'none',
    textRendering: 'geometricPrecision',
    WebkitFontSmoothing: 'antialiased',
    transformOrigin,
  };

  // LÓGICA DO DRAG & DROP NATIVO EM PORCENTAGEM
  const handleDragStart = (e: React.MouseEvent, key: string) => {
    if (!isEditable) return;
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

  const layoutProps = { formData, page, studentData, showValidationQrCode, containerStyle, renderReadinessProps, customBackgroundUrl, ocultarDesign, institutionalText, codeValidador, assinaturaUrl, identity, getDocumentLabel, getDocumentDisplay, getPosStyle, handleDragStart, getDragBorderClass };
  return usePhotoshopLayout
    ? <CarteirinhaAbsoluteLayout {...layoutProps} />
    : <CarteirinhaStandardLayout {...layoutProps} />;
};

export default CarteirinhaPreview;
