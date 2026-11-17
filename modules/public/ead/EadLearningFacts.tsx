import React from 'react';
import { CheckCircle2, ListChecks, Lock, Sparkles } from 'lucide-react';
import { isSelfDirectedPresentation } from './eadPresentation';

export default function EadLearningFacts({ atividades, regras, pagina }: { atividades: unknown[]; regras?: { tempoMinimoMinutos?: number }; pagina?: unknown }) {
  const selfDirected = isSelfDirectedPresentation(pagina);
  return <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2 mb-4">
                    <ListChecks size={18} className="text-emerald-600" />
                    Atividades
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {atividades.length > 0
                      ? `${atividades.length} atividade(s) de fixação antes da prova, vinculadas às etapas do curso.`
                      : 'Atividades de fixação serão disponibilizadas conforme a organização pedagógica do curso.'}
                  </p>
                </div>
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2 mb-4">
                    <Lock size={18} className="text-amber-600" />
                    Liberação
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {selfDirected ? 'Percurso autoinstrucional com conclusão das etapas, registro das atividades e prova final. A carga horária é estimada para estudo, pesquisa, produção e revisão; não representa horas de vídeo nem permanência obrigatória na tela.' : <>Tempo mínimo de estudo: <strong>{regras?.tempoMinimoMinutos || 0} min</strong>. As etapas são liberadas progressivamente, com marcação de conclusão e atividades antes da avaliação final.</>}
                  </p>
                </div>
              </div>

              {/* Diferenciais */}
              <div className="bg-gradient-to-br from-[#001a33] to-[#003366] rounded-[2.5rem] p-8 text-white relative overflow-hidden border border-blue-950/20 shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Sparkles size={20} className="text-blue-400" />
                  Diferenciais do Ensino EAD Universo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Estude no seu Tempo</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        {selfDirected ? 'Organize seus estudos ao longo do período de acesso informado para o curso, com atividades assíncronas.' : 'Acesso ilimitado 24 horas por dia, 7 dias por semana, adaptando-se completamente à sua rotina.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Material Didático Completo</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        {selfDirected ? 'Textos autorais, casos orientados, oficinas, fontes públicas e atividades de autoavaliação. Esta oferta não inclui videoaulas.' : 'Videoaulas dinâmicas, apostilas digitais e atividades focadas no aprendizado contínuo.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">{selfDirected ? 'Estudo autoinstrucional' : 'Tutoria e Suporte'}</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        {selfDirected ? 'Estude com roteiros, modelos e critérios de autoavaliação. Não inclui tutoria nem correção docente individual.' : 'Esclareça suas dúvidas e conte com apoio pedagógico durante toda a sua formação.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">{selfDirected ? 'Certificado de curso livre' : 'Certificado Reconhecido'}</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        {selfDirected ? 'Certificado de conclusão conforme os critérios do curso. Não confere licenciatura ou especialização. Aceitação para títulos ou horas complementares depende da instituição ou edital.' : 'Validação nacional para turbinar seu currículo e apresentar em processos seletivos.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

  </>;
}
