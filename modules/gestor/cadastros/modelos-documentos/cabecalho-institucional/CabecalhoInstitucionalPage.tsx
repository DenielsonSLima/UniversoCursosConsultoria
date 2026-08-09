import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  Eye,
  Loader2,
  MapPin,
  PanelTop,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
} from 'lucide-react';

import DocumentHeader from '../../../components/DocumentHeader';
import type { InstitutionalHeaderFields } from '../../../components/institutional-header.model';
import { empresasService } from '../../../configuracoes/empresas/empresas.service';
import {
  marcaDaguaService,
  type CompanyWatermark,
} from '../../../configuracoes/marca-dagua/marca-dagua.service';
import { polosService, type Polo } from '../../../configuracoes/polos/polos.service';
import ReportWatermark from '../../../relatorios/components/ReportWatermark';

type PreviewOrientation = 'portrait' | 'landscape';

interface PreviewCompany extends InstitutionalHeaderFields {
  id?: string;
  nomeFantasia?: string;
}

interface HeaderPreviewData {
  company: PreviewCompany | null;
  polos: Polo[];
  watermarks: CompanyWatermark[];
}

type HeaderPreviewPolo = InstitutionalHeaderFields & Partial<CompanyWatermark>;

interface HeaderUnit {
  key: string;
  label: string;
  isHeadquarters: boolean;
  company?: PreviewCompany;
  polo?: HeaderPreviewPolo;
}

const previewMeta = {
  eyebrow: 'Modelo de documento',
  title: 'Relatório institucional',
  label: 'Tipo',
  value: 'Prévia protegida',
};

const loadHeaderPreviewData = async (): Promise<HeaderPreviewData> => {
  const [company, polos, watermarks] = await Promise.all([
    empresasService.getCompanyPrincipal(),
    polosService.getAll(),
    marcaDaguaService.getCompaniesWithWatermark(),
  ]);

  return { company, polos, watermarks };
};

const getWatermarkFields = (
  watermark: CompanyWatermark | undefined,
  isHeadquarters: boolean,
): HeaderPreviewPolo => {
  const portraitFields: HeaderPreviewPolo = {
    isMatriz: isHeadquarters,
    watermarkUrl: watermark?.watermarkUrl,
    watermarkOpacity: watermark?.watermarkOpacity,
    watermarkScale: watermark?.watermarkScale,
    watermarkRotate: watermark?.watermarkRotate,
  };

  if (!watermark?.landscapeWatermarkUrl) return portraitFields;

  return {
    ...portraitFields,
    landscapeWatermarkUrl: watermark.landscapeWatermarkUrl,
    landscapeWatermarkOpacity: watermark.landscapeWatermarkOpacity,
    landscapeWatermarkScale: watermark.landscapeWatermarkScale,
    landscapeWatermarkRotate: watermark.landscapeWatermarkRotate,
  };
};

const getHeaderUnits = ({ company, polos, watermarks }: HeaderPreviewData): HeaderUnit[] => {
  const matrixPolo = polos.find((polo) => polo.is_matriz);
  const watermarkByPolo = new Map(watermarks.map((watermark) => [watermark.id, watermark]));
  const units: HeaderUnit[] = [];

  if (company) {
    const matrixWatermark = watermarkByPolo.get(matrixPolo?.id || company.id || '');
    units.push({
      key: `matriz-${company.id || matrixPolo?.id || 'principal'}`,
      label: company.nomeFantasia || matrixPolo?.nome || 'Matriz',
      isHeadquarters: true,
      company,
      polo: getWatermarkFields(matrixWatermark, true),
    });
  } else if (matrixPolo) {
    units.push({
      key: `matriz-${matrixPolo.id || 'principal'}`,
      label: matrixPolo.nome || 'Matriz',
      isHeadquarters: true,
      polo: {
        ...matrixPolo,
        ...getWatermarkFields(watermarkByPolo.get(matrixPolo.id), true),
      },
    });
  }

  polos
    .filter((polo) => !polo.is_matriz)
    .forEach((polo, index) => {
      units.push({
        key: `polo-${polo.id || index}`,
        label: polo.nome || polo.cidade || `Polo ${index + 1}`,
        isHeadquarters: false,
        company: company || undefined,
        polo: {
          ...polo,
          ...getWatermarkFields(watermarkByPolo.get(polo.id), false),
        },
      });
    });

  return units;
};

const CabecalhoInstitucionalPage = () => {
  const [selectedUnitKey, setSelectedUnitKey] = useState('');
  const [orientation, setOrientation] = useState<PreviewOrientation>('portrait');
  const previewQuery = useQuery({
    queryKey: ['institutional-header-preview'],
    queryFn: loadHeaderPreviewData,
    staleTime: 5 * 60 * 1000,
  });

  const units = useMemo(
    () => (previewQuery.data ? getHeaderUnits(previewQuery.data) : []),
    [previewQuery.data],
  );
  const selectedUnit = units.find((unit) => unit.key === selectedUnitKey) || units[0];
  const pageDimensions = orientation === 'portrait'
    ? { width: '210mm', minHeight: '297mm' }
    : { width: '297mm', minHeight: '210mm' };

  return (
    <div className="animate-fadeIn space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="relative border-b border-slate-100 bg-[#001a33] px-6 py-7 text-white">
          <div className="absolute inset-y-0 right-0 w-52 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.35),transparent_66%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-blue-200">
                <PanelTop size={18} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                  Modelos de documentos
                </span>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight">
                Cabeçalho institucional
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-300">
                Confira o padrão oficial que relatórios e documentos usam para cada unidade.
              </p>
            </div>
            <span className="flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-100">
              <Eye size={14} /> Somente leitura
            </span>
          </div>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Matriz ou polo
            </span>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={selectedUnit?.key || ''}
                onChange={(event) => setSelectedUnitKey(event.target.value)}
                disabled={previewQuery.isLoading || units.length === 0}
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-[#001a33] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {units.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.isHeadquarters ? 'Matriz' : 'Polo'} · {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <fieldset>
            <legend className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Orientação
            </legend>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {([
                { value: 'portrait' as const, label: 'Retrato', icon: RectangleVertical },
                { value: 'landscape' as const, label: 'Paisagem', icon: RectangleHorizontal },
              ]).map((option) => {
                const Icon = option.icon;
                const isActive = orientation === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setOrientation(option.value)}
                    className={`flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-black uppercase tracking-wider transition ${
                      isActive
                        ? 'bg-[#001a33] text-white shadow-sm'
                        : 'text-slate-500 hover:bg-white hover:text-[#001a33]'
                    }`}
                  >
                    <Icon size={16} /> {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </section>

      {previewQuery.isLoading ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-slate-200 bg-white text-center shadow-sm">
          <Loader2 className="mb-4 animate-spin text-blue-600" size={34} />
          <p className="text-sm font-bold text-[#001a33]">Carregando dados das unidades...</p>
          <p className="mt-1 text-xs font-medium text-slate-500">A prévia não altera nenhum cadastro.</p>
        </div>
      ) : previewQuery.isError ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-[2rem] border border-rose-200 bg-rose-50 px-6 text-center">
          <AlertTriangle className="mb-4 text-rose-600" size={34} />
          <p className="text-sm font-black uppercase tracking-tight text-rose-800">
            Não foi possível carregar matriz e polos
          </p>
          <p className="mt-2 max-w-xl text-xs font-medium text-rose-700">
            {previewQuery.error instanceof Error
              ? previewQuery.error.message
              : 'Tente novamente em instantes.'}
          </p>
          <button
            type="button"
            onClick={() => previewQuery.refetch()}
            className="mt-5 flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-rose-800"
          >
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      ) : selectedUnit ? (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-inner">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Prévia real</p>
              <h3 className="text-sm font-black uppercase tracking-tight text-[#001a33]">
                {selectedUnit.isHeadquarters ? 'Matriz' : 'Polo'} · {selectedUnit.label}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <MapPin size={15} /> Dados atuais do cadastro
            </div>
          </div>

          <div className="overflow-auto p-4 sm:p-8">
            <div className="w-max min-w-full">
              <article
                className="relative mx-auto box-border overflow-hidden bg-white p-[12mm] text-slate-800 shadow-2xl shadow-slate-400/30"
                style={pageDimensions}
                aria-label={`Prévia do cabeçalho em orientação ${orientation === 'portrait' ? 'retrato' : 'paisagem'}`}
              >
                <ReportWatermark polo={selectedUnit.polo} orientation={orientation} />

                <DocumentHeader
                  company={selectedUnit.company}
                  polo={selectedUnit.polo}
                  orientation={orientation}
                  meta={previewMeta}
                />

                <div className="relative z-10 border-b border-slate-200 pb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600">
                    Conteúdo demonstrativo
                  </p>
                  <h4 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
                    Título do documento
                  </h4>
                  <p className="mt-2 max-w-3xl text-xs font-medium leading-relaxed text-slate-500">
                    O conteúdo de cada relatório começa abaixo desta faixa, mantendo o mesmo espaçamento em todas as emissões.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-600" size={30} />
          <p className="text-sm font-bold text-amber-800">Nenhuma matriz ou polo foi encontrado.</p>
        </div>
      )}
    </div>
  );
};

export default CabecalhoInstitucionalPage;
