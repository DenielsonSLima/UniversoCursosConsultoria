import React from 'react';
import { CheckCircle2, Award, Users2, ShieldCheck, GraduationCap } from 'lucide-react';

const AboutContent: React.FC = () => {
  const consultoriaItems = [
    {
      title: 'Educação',
      desc: 'Formação continuada de profissionais, elaboração e revisão de documentos institucionais (PPP, Regimento, Planos de Curso), regularização e gestão educacional.',
      icon: <GraduationCap className="shrink-0" size={24} />
    },
    {
      title: 'Saúde',
      desc: 'Capacitação de equipes, projetos voltados à humanização do atendimento e melhoria da gestão em unidades de saúde.',
      icon: <ShieldCheck className="shrink-0" size={24} />
    },
    {
      title: 'Assistência Social',
      desc: 'Elaboração e execução de projetos sociais, capacitação de servidores e aprimoramento dos serviços socioassistenciais.',
      icon: <Users2 className="shrink-0" size={24} />
    }
  ];

  return (
    <section id="quem-somos" className="py-24 bg-slate-50 overflow-hidden scroll-mt-24">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-stretch gap-12 lg:gap-20">
          
          {/* Lado Esquerdo: Composição de Imagens (Mosaico Aumentado) */}
          <div className="lg:w-1/2 relative flex flex-col justify-center">
            <div className="relative z-10 h-full">
              <img 
                src="/about-instituicao.jpeg" 
                alt="Instituição Universo" 
                className="rounded-3xl shadow-2xl w-full h-[500px] lg:h-[700px] object-cover border-4 border-white"
              />
            </div>
            {/* Imagem de sobreposição significativamente aumentada */}
            <div className="absolute -bottom-8 -right-4 z-20 hidden md:block w-80 h-56 lg:w-[400px] lg:h-[280px]">
              <img 
                src="/about-alunos.jpeg" 
                alt="Alunos Universo" 
                className="rounded-2xl shadow-2xl w-full h-full object-cover border-8 border-white"
              />
            </div>
            {/* Elementos Decorativos */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl -z-0"></div>
            <div className="absolute top-1/4 -left-6 w-12 h-12 bg-blue-600/20 rounded-lg rotate-45 -z-0"></div>
          </div>

          {/* Lado Direito: Conteúdo Detalhado */}
          <div className="lg:w-1/2 flex flex-col justify-center py-4">
            <div className="inline-flex items-center space-x-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full mb-6 w-fit">
              <CheckCircle2 size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Desde 2011</span>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-[#001a33] mb-6 leading-tight uppercase tracking-tighter">
              Quem <span className="text-blue-600">Somos</span>
            </h2>

            <div className="space-y-4 text-slate-700 leading-relaxed text-base mb-8">
              <p>
                A <strong className="text-blue-900 font-bold">Universo Cursos e Consultoria</strong> é referência em educação profissional e estratégica no Sertão Sergipano, com unidades em Japoatã, Aquidabã e Porto da Folha.
              </p>
              <p>
                Além da formação educacional, a Universo se destaca na prestação de serviços de consultoria e assessoria técnica para instituições públicas e privadas, nas áreas de:
              </p>
            </div>

            {/* Lista de Consultoria Detalhada */}
            <div className="space-y-6 mb-10">
              {consultoriaItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-4 group">
                  <div className="mt-1 bg-white p-2 rounded-lg shadow-sm border border-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    {item.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-900 text-sm uppercase tracking-tight mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Box de Destaque com Frase Inspiradora */}
            <div className="p-8 bg-gradient-to-br from-[#001a33] via-[#1e3a8a] to-[#4169E1] rounded-3xl text-white shadow-2xl relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-lg md:text-xl font-bold leading-tight mb-4">
                  “Mais do que certificados, entregamos sonhos realizados. Mais do que salas de aula, construímos vidas renovadas pela educação.”
                </p>
                <div className="w-12 h-1 bg-blue-400/50 mb-4 rounded-full"></div>
                <p className="italic text-sm font-light text-blue-100 leading-snug">
                  Unindo educação humanizada e consultoria de alta performance para o desenvolvimento regional.
                </p>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all duration-700"></div>
              <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-blue-400/10 rounded-full blur-xl"></div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default AboutContent;