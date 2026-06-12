import React from 'react';
import { GraduationCap, Briefcase, Building2, Stethoscope, Users2, FileCheck, Landmark } from 'lucide-react';

const ConsultingSection: React.FC = () => {
  return (
    <section id="consultoria" className="py-20 bg-slate-50">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-[#001a33] mb-4 uppercase tracking-tighter">
            Serviços de <span className="text-blue-600">Consultoria</span>
          </h2>
          <p className="text-slate-600 max-w-3xl mx-auto text-lg">
            A Universo atua com soluções educacionais e técnicas para instituições públicas e privadas, promovendo eficiência, inovação e resultados.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Consultoria Educacional */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><GraduationCap size={28} /></div>
              <h3 className="text-xl font-bold text-blue-900 uppercase">Consultoria Educacional</h3>
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-2"><span>•</span> Elaboração e revisão de PPP e Regimentos Escolares.</li>
              <li className="flex gap-2"><span>•</span> Planejamento de Planos de Curso Técnicos e FIC (CEE).</li>
              <li className="flex gap-2"><span>•</span> Assessoria para credenciamento e autorização de cursos.</li>
              <li className="flex gap-2"><span>•</span> Formação continuada para professores e gestores.</li>
              <li className="flex gap-2"><span>•</span> Consultoria em gestão escolar e avaliação institucional.</li>
              <li className="flex gap-2"><span>•</span> Estruturação de processos administrativos e pedagógicos.</li>
            </ul>
          </div>

          {/* Consultoria Técnica e Institucional */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Briefcase size={28} /></div>
              <h3 className="text-xl font-bold text-blue-900 uppercase">Técnica e Institucional</h3>
            </div>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-2"><span>•</span> Planejamento estratégico e operacional.</li>
              <li className="flex gap-2"><span>•</span> Elaboração de projetos e planos de capacitação.</li>
              <li className="flex gap-2"><span>•</span> Execução e acompanhamento de projetos sociais.</li>
              <li className="flex gap-2"><span>•</span> Assessoria em prestação de contas e relatórios.</li>
              <li className="flex gap-2"><span>•</span> Organização de eventos, feiras e conferências.</li>
            </ul>
          </div>
        </div>

        {/* Órgãos Públicos - Destaque Especial */}
        <div className="bg-gradient-to-br from-[#001a33] to-[#003366] rounded-[40px] p-8 md:p-12 text-white shadow-2xl overflow-hidden relative">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-10">
              <div className="p-4 bg-blue-600/30 backdrop-blur-md rounded-2xl"><Landmark size={32} /></div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Consultoria para Órgãos Públicos</h3>
                <p className="text-blue-300 text-sm uppercase font-bold tracking-widest mt-1">Parceira Estratégica dos Municípios</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Área Educação Pública */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-xs">
                  <Building2 size={16} /> Área da Educação
                </div>
                <ul className="space-y-2 text-[13px] text-blue-100/80 leading-snug">
                  <li>• Apoio em programas federais (FNDE, PAR, PDDE).</li>
                  <li>• Formação de conselhos e equipes gestoras.</li>
                  <li>• Processos seletivos simplificados.</li>
                  <li>• Capacitação continuada de servidores.</li>
                </ul>
              </div>

              {/* Área Saúde Pública */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-xs">
                  <Stethoscope size={16} /> Área da Saúde
                </div>
                <ul className="space-y-2 text-[13px] text-blue-100/80 leading-snug">
                  <li>• Conferências Municipais de Saúde.</li>
                  <li>• Capacitação de Equipes (Atenção Básica, ACS, ACE).</li>
                  <li>• Assessoria em saúde pública e vigilância.</li>
                  <li>• Treinamentos em atendimento humanizado.</li>
                  <li>• Consultoria em licitações de medicamentos.</li>
                </ul>
              </div>

              {/* Área Assistência Social */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-xs">
                  <Users2 size={16} /> Assistência Social
                </div>
                <ul className="space-y-2 text-[13px] text-blue-100/80 leading-snug">
                  <li>• Conferências de Assistência Social.</li>
                  <li>• Monitoramento de programas e do SUAS.</li>
                  <li>• Formação para conselheiros tutelares.</li>
                  <li>• Treinamentos Cadastro Único e CRAS/CREAS.</li>
                  <li>• Planejamento de ações intersetoriais.</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-12 p-6 bg-white/5 rounded-2xl border border-white/10 text-center">
              <p className="text-blue-100 italic text-sm font-light">
                "A Universo fortalece as políticas públicas, contribuindo para a profissionalização e humanização dos serviços prestados à população."
              </p>
            </div>
          </div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>
      </div>
    </section>
  );
};

export default ConsultingSection;