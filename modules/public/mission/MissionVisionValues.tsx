import React from 'react';
import { Target, Eye, Heart, Shield, CheckCircle2, Award, Zap, Users, Star } from 'lucide-react';

const MissionVisionValues: React.FC = () => {
  const valores = [
    { name: 'Fé', icon: <Star size={16} /> },
    { name: 'Humanização', icon: <Heart size={16} /> },
    { name: 'Ética', icon: <Shield size={16} /> },
    { name: 'Compromisso social', icon: <Users size={16} /> },
    { name: 'Inovação', icon: <Zap size={16} /> },
    { name: 'Excelência acadêmica', icon: <Award size={16} /> },
    { name: 'Inclusão', icon: <CheckCircle2 size={16} /> },
    { name: 'Respeito à diversidade', icon: <Users size={16} /> },
  ];

  return (
    <section id="missao" className="relative py-24 overflow-hidden">
      {/* Background com Imagem e Degradê Azul Royal para Petróleo */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&q=80&w=1920" 
          alt="Background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#4169E1]/95 via-[#002b55]/98 to-[#001a33]"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter">
            Nossa <span className="text-blue-400">Essência</span>
          </h2>
          <div className="w-24 h-1.5 bg-blue-500 mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Missão */}
          <div className="group bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-[40px] hover:bg-white/10 transition-all duration-500">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-900/50">
                <Target className="text-white" size={32} />
              </div>
              <h3 className="text-3xl font-bold text-white uppercase tracking-tight">Missão</h3>
            </div>
            <p className="text-blue-100 text-lg leading-relaxed font-light">
              Oferecer uma educação de excelência, personalizada, humanizada e acessível, formando profissionais éticos, qualificados e preparados para os desafios reais do mercado, transformando sua realidade e da comunidade onde estão inseridos.
            </p>
          </div>

          {/* Visão */}
          <div className="group bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-[40px] hover:bg-white/10 transition-all duration-500">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-blue-500 rounded-2xl shadow-lg shadow-blue-900/50">
                <Eye className="text-white" size={32} />
              </div>
              <h3 className="text-3xl font-bold text-white uppercase tracking-tight">Visão</h3>
            </div>
            <p className="text-blue-100 text-lg leading-relaxed font-light">
              Ser reconhecida como referência regional e nacional em formação profissional, capacitação e consultoria, expandindo para o ensino superior e construindo um centro hospitalar próprio até 2035.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Propósito */}
          <div className="lg:col-span-1 bg-gradient-to-br from-blue-600 to-blue-800 p-10 rounded-[40px] shadow-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <Heart className="text-blue-200" size={28} />
                <h3 className="text-2xl font-bold text-white uppercase">Propósito</h3>
              </div>
              <p className="text-blue-50 text-xl font-medium leading-tight">
                Transformar vidas através da educação profissional e de consultorias que geram impacto positivo nas pessoas e instituições.
              </p>
            </div>
            <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Target size={200} />
            </div>
          </div>

          {/* Valores */}
          <div className="lg:col-span-2 bg-white/5 backdrop-blur-md border border-white/10 p-10 rounded-[40px]">
            <h3 className="text-2xl font-bold text-white uppercase mb-8 flex items-center gap-3">
              <CheckCircle2 className="text-blue-400" /> Nossos Valores
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {valores.map((valor, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-blue-400/50 hover:bg-white/10 transition-all group cursor-default">
                  <div className="text-blue-400 group-hover:scale-110 transition-transform">
                    {valor.icon}
                  </div>
                  <span className="text-white text-xs font-semibold uppercase tracking-wide">{valor.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default MissionVisionValues;