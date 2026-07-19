import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getDocumentValidationUrl } from '../../../../../shared/document-validation/document-validation.url';
import { AssinaturasData, assinaturasService } from '../../../../configuracoes/assinaturas/assinaturas.service';
import DiplomaBlockContent from './DiplomaBlockContent';
import { getBlocks } from './diploma-preview.blocks';
import {
  DiplomaPreviewProps,
  getTechnicalCourseTitle,
  getTemplateBackgroundUrl,
} from './diploma-preview.model';

export { getBlocks } from './diploma-preview.blocks';
export {
  EAD_BACK_LEGAL_TEXT,
  EAD_BACK_TEXT,
  EAD_BACK_TITLE_TEXT,
  EAD_FRONT_TEXT,
  EAD_VALIDITY_TEXT,
  PRESENTIAL_BACK_LEGAL_TEXT,
  PRESENTIAL_FRONT_TEXT,
  PRESENTIAL_VALIDITY_TEXT,
  TECHNICAL_BACK_TEXT,
  TECHNICAL_FRONT_TEXT,
  getTemplateBackgroundUrl,
  posicoesPadrao,
} from './diploma-preview.model';

const buildDefaultPreviewData = (formData: any): Record<string, string> => ({
  nome_aluno: 'JOÃO DA SILVA SAURO',
  cpf: '123.456.789-00',
  cidade: 'Cidade do Polo',
  uf: 'UF',
  cidade_uf: 'Cidade do Polo/UF',
  curso_nome:
    formData.tipoCurso === 'Cursos Técnicos'
      ? 'Técnico em Enfermagem'
      : formData.tipoCurso === 'Cursos Especialização'
        ? 'Especialização'
        : formData.tipoCurso === 'Educação a Distância (EAD)'
          ? 'Curso EAD'
          : 'Curso de Formação',
  curso_titulo: getTechnicalCourseTitle(
    formData.tipoCurso === 'Cursos Técnicos' ? 'Técnico em Enfermagem' : 'Curso de Formação',
  ),
  carga_horaria: '1200',
  data_inicio: '04/12/2025',
  data_fim: '30/12/2025',
  periodo: '04/12/2025 até 30/12/2025',
  data_conclusao: '20 de Maio de 2026',
  data_conclusao_extenso: '20 de Maio de 2026',
  grade_curricular: 'Anatomia Humana - 80h - Nota: 9.0\nFisiologia - 80h - Nota: 8.5\nPrimeiros Socorros - 40h - Nota: 10.0\nFarmacologia Aplicada - 60h - Nota: 9.5\nÉtica e Deontologia - 40h - Nota: 9.0\nEstágio Supervisionado I - 200h - Aprovado',
  livro_registro: 'Livro: 12, Folha: 45, Registro: 1024',
  ensino_medio_estabelecimento: 'COLÉGIO ESTADUAL EXEMPLO',
  ensino_medio_localidade_uf: 'JAPOATÃ - SE',
  ensino_medio_ano_conclusao: '2022',
  certificado_numero: '1024',
  codigo_certificado: 'CERT-EAD-2B4F-D710-0F26',
  pagina_livro: '45',
  livro: '12',
  validacao_sistec: 'SE123456789',
  codigo_validacao: 'CERT-EAD-2B4F-D710-0F26',
  naturalidade: 'Japoatã/SE',
  data_nascimento: '10/02/2002',
  rg: '3.456.789 SSP/SE',
  eixo_tecnologico: 'ambiente e saúde',
  diretoria_geral_nome: 'NOME DA DIRETORA',
  diretoria_geral_cargo: 'Diretora Geral',
  secretaria_nome: 'NOME DA SECRETÁRIA',
  secretaria_cargo: 'Secretária Escolar',
});

const DiplomaPreview: React.FC<DiplomaPreviewProps> = ({
  formData,
  page,
  zoomLevel,
  previewValues = {},
  isEditable = false,
  selectedBlockId = null,
  onSelectBlock,
  onChangeBlocks,
}) => {
  const previewData: Record<string, string> = { ...buildDefaultPreviewData(formData), ...previewValues };
  const [assinaturas, setAssinaturas] = useState<AssinaturasData>(() => assinaturasService.getSignaturesSync());
  const signatureTemplateVars = {
    diretoria_geral_nome: assinaturas.diretoriaGeralNome || previewData.diretoria_geral_nome,
    diretoria_geral_cargo: assinaturas.diretoriaGeralCargo || previewData.diretoria_geral_cargo,
    secretaria_nome: assinaturas.secretariaNome || previewData.secretaria_nome,
    secretaria_cargo: assinaturas.secretariaCargo || previewData.secretaria_cargo,
  };

  useEffect(() => {
    void assinaturasService.getSignatures()
      .then(setAssinaturas)
      .catch(() => setAssinaturas(assinaturasService.getSignaturesSync()));
  }, []);

  const getSignatureUrl = (block: any) => {
    if (!block.signatureSource || block.signatureSource === 'none' || block.signatureSource === 'manual') {
      return block.signatureImageUrl || '';
    }
    return assinaturas[block.signatureSource as keyof AssinaturasData] || '';
  };

  const zoomScale = zoomLevel / 100;
  const scaledPageFrameStyle: React.CSSProperties = {
    width: `${297 * zoomScale}mm`,
    height: `${210 * zoomScale}mm`,
    position: 'relative',
  };
  const containerStyle: React.CSSProperties = {
    transform: `scale(${zoomScale})`,
    transformOrigin: 'top left',
    backgroundColor: 'white',
    position: 'absolute',
    inset: 0,
  };
  const backgroundUrl = getTemplateBackgroundUrl(formData, page);
  const shouldRenderLandscapeWatermark = page === 'verso' && !backgroundUrl && Boolean(formData.landscapeWatermarkUrl);
  if (backgroundUrl) {
    containerStyle.backgroundImage = `url(${backgroundUrl})`;
    containerStyle.backgroundSize = 'cover';
    containerStyle.backgroundPosition = 'center';
  }

  const corTexto = formData.corTexto || '#1e293b';
  const blocks = getBlocks(formData);
  const visibleBlocks = blocks.filter((block: any) => block.page === page && block.visible);
  const validationUrl = getDocumentValidationUrl(previewData.codigo_validacao);

  const handleDragStart = (event: React.MouseEvent, key: string) => {
    if (!isEditable) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectBlock?.(key);

    const canvasElement = event.currentTarget.parentElement;
    if (!canvasElement) return;
    const rect = canvasElement.getBoundingClientRect();
    const block = blocks.find((item: any) => item.id === key);
    if (!block) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = block.x;
    const startTop = block.y;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const zoomFactor = zoomLevel / 100;
      const actualDeltaX = (moveEvent.clientX - startX) / zoomFactor;
      const actualDeltaY = (moveEvent.clientY - startY) / zoomFactor;
      const pctDeltaX = (actualDeltaX / (rect.width / zoomFactor)) * 100;
      const pctDeltaY = (actualDeltaY / (rect.height / zoomFactor)) * 100;
      const newX = parseFloat(Math.min(95, Math.max(0, startLeft + pctDeltaX)).toFixed(2));
      const newY = parseFloat(Math.min(95, Math.max(0, startTop + pctDeltaY)).toFixed(2));
      onChangeBlocks?.(blocks.map((item: any) => item.id === key ? { ...item, x: newX, y: newY } : item));
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRemoveBlock = (event: React.MouseEvent, key: string) => {
    event.preventDefault();
    event.stopPropagation();
    onChangeBlocks?.(blocks.map((block: any) => block.id === key ? { ...block, visible: false } : block));
    if (selectedBlockId === key) onSelectBlock?.(null);
  };

  return (
    <div className="relative shrink-0 transition-[width,height] duration-200" style={scaledPageFrameStyle}>
      <div
        className="bg-white w-[297mm] h-[210mm] shadow-2xl relative rounded-[2mm] overflow-hidden select-none"
        style={containerStyle}
      >
        {shouldRenderLandscapeWatermark ? (
          <div className="absolute inset-0 z-0 flex h-full w-full items-center justify-center overflow-hidden pointer-events-none">
            <img
              src={formData.landscapeWatermarkUrl}
              alt=""
              className="select-none object-contain"
              style={{
                width: `${formData.landscapeWatermarkScale || 55}%`,
                opacity: formData.landscapeWatermarkOpacity ?? 0.1,
                transform: formData.landscapeWatermarkRotate ? 'rotate(-22deg)' : 'none',
              }}
            />
          </div>
        ) : null}

        {visibleBlocks.map((block: any) => {
          const isSelected = selectedBlockId === block.id;
          const blockStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${block.x}%`,
            top: `${block.y}%`,
            cursor: isEditable ? 'move' : 'default',
          };
          if (block.type === 'signatureImage' && block.signatureBlend !== false) {
            blockStyle.mixBlendMode = 'multiply';
          }
          return (
            <div
              key={block.id}
              style={blockStyle}
              onMouseDown={(event) => handleDragStart(event, block.id)}
              onClick={(event) => {
                event.stopPropagation();
                if (isEditable) onSelectBlock?.(block.id);
              }}
              className={`z-20 ${isEditable ? `outline-2 outline-offset-2 transition-all group ${isSelected ? 'outline outline-purple-600 ring-2 ring-purple-100' : 'hover:outline hover:outline-dashed hover:outline-slate-400'}` : ''}`}
            >
              <DiplomaBlockContent
                block={block}
                corTexto={corTexto}
                isEditable={isEditable}
                previewData={previewData}
                signatureTemplateVars={signatureTemplateVars}
                validationUrl={validationUrl}
                visibleBlocks={visibleBlocks}
                getSignatureUrl={getSignatureUrl}
              />
              {isEditable ? (
                <button
                  onClick={(event) => handleRemoveBlock(event, block.id)}
                  className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md border border-white opacity-0 group-hover:opacity-100 transition-opacity z-50 focus:outline-none"
                  title="Excluir Elemento"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiplomaPreview;
