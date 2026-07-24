import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { formatMatricula } from '../../../../lib/academicUtils';
import type { EmissionLog } from './historico-emissoes.types';

export const getPreviewStudent = (emission: EmissionLog, poloInfo: any) => {
  const birthDate = emission.dados_emissao?.studentBirthDate || emission.aluno?.data_nascimento || '';
  const birthParts = birthDate.split('T')[0]?.split('-') || [];
  const expiresAt = emission.validade_ate ? new Date(emission.validade_ate) : null;

  return {
    id: emission.aluno_id,
    nome: emission.dados_emissao?.studentName || emission.aluno?.nome || '',
    cpf: emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || '',
    rg: emission.aluno?.rg || '',
    nascimento: birthParts.length === 3
      ? `${birthParts[2]}/${birthParts[1]}/${birthParts[0]}`
      : birthDate,
    matricula: emission.dados_emissao?.studentMatricula
      || formatMatricula(emission.matricula_id, emission.emitido_em, emission.polo_id),
    curso: emission.dados_emissao?.courseName || '',
    instituicao: emission.dados_emissao?.institutionName || 'Universo Cursos e Consultoria',
    validade: expiresAt ? expiresAt.toLocaleDateString('pt-BR') : '',
    fotoUrl: emission.dados_emissao?.studentPhotoUrl || emission.aluno?.foto_url || null,
    validationCode: emission.codigo,
    poloRazaoSocial: poloInfo?.nome,
    poloCnpj: poloInfo?.cnpj,
    poloTelefone: poloInfo?.telefone,
  };
};

export const downloadEmissionPdf = async (
  container: HTMLDivElement,
  emission: EmissionLog,
  filenamePrefix = '2-via'
) => {
  const certificatePages = Array.from(
    container.querySelectorAll('[data-certificate-pdf-page="true"]')
  ) as HTMLElement[];
  const standardPages = Array.from(
    container.querySelectorAll('.print-page')
  ) as HTMLElement[];
  const pageNodes = certificatePages.length
    ? certificatePages
    : standardPages;
  if (!pageNodes.length) throw new Error('Elemento de página não localizado.');

  const isLandscape = certificatePages.length > 0;
  await new Promise((resolve) => setTimeout(resolve, 400));
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (const [index, pageNode] of pageNodes.entries()) {
    const canvas = await html2canvas(pageNode, {
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: false,
    });
    if (index > 0) pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      0,
      0,
      isLandscape ? 297 : 210,
      isLandscape ? 210 : 297,
      undefined,
      'FAST'
    );
  }

  pdf.save(`${filenamePrefix}-${emission.documento}-${emission.codigo}.pdf`);
};
