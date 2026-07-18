import { Play, MonitorPlay, CheckCircle2 } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';
import { getVimeoEmbedUrl, normalizeVimeoVideoUrl } from '../eadCourseWizard.utils';

const EadCourseWizardStep4 = () => {
  const {
    videoPrincipalUrl,
    setVideoPrincipalUrl,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-red-50 text-red-600 rounded-xl"><Play size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Vídeo principal do curso</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">Cole o Vimeo que aparece na aba Vídeo do aluno, separado das aulas e atividades.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-red-100 bg-red-50/50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
                <Play size={17} />
              </span>
              <div>
                <h5 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Vídeo principal do curso</h5>
                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-slate-500">
                  Use o link normal do Vimeo. Se colar o código incorporado, o sistema salva apenas o link padronizado.
                </p>
              </div>
            </div>
          </div>

          {normalizeVimeoVideoUrl(videoPrincipalUrl) && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600">
              <CheckCircle2 size={13} />
              Vimeo configurado
            </span>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <label className="block text-[9px] font-black uppercase tracking-widest text-red-700">URL do Vimeo</label>
          <input
            type="url"
            placeholder="https://vimeo.com/1207083868"
            className="w-full rounded-xl border border-red-100 bg-white px-4 py-3 text-xs font-semibold text-blue-650 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            value={videoPrincipalUrl}
            onChange={e => setVideoPrincipalUrl(e.target.value)}
          />
          {normalizeVimeoVideoUrl(videoPrincipalUrl) && normalizeVimeoVideoUrl(videoPrincipalUrl) !== videoPrincipalUrl.trim() && (
            <p className="text-[10px] font-bold text-slate-500">
              Será salvo como: <span className="text-red-600">{normalizeVimeoVideoUrl(videoPrincipalUrl)}</span>
            </p>
          )}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-red-100 bg-white">
          {getVimeoEmbedUrl(videoPrincipalUrl) ? (
            <div className="aspect-video bg-black">
              <iframe
                src={getVimeoEmbedUrl(videoPrincipalUrl)}
                title="Prévia do vídeo principal do curso"
                className="h-full w-full"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-slate-50 text-center">
              <div className="max-w-xs px-6">
                <MonitorPlay className="mx-auto mb-3 text-slate-300" size={36} />
                <p className="text-xs font-black uppercase tracking-widest text-slate-500">Prévia do Vimeo</p>
                <p className="mt-2 text-[10px] font-bold leading-relaxed text-slate-400">
                  Cole o link do Vimeo para conferir o player antes de salvar.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep4;
