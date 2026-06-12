import React from 'react';
import { Heart, Users, Zap, Award, Briefcase, Monitor, Thermometer, ShieldCheck } from 'lucide-react';

const Diferenciais: React.FC = () => {
  const itens = [
    { title: 'Atendimento Humanizado', desc: 'Atendimento personalizado e focado no acolhimento.', icon: <Heart className="text-blue-500" /> },
    { title: 'Corpo Docente Experiente', desc: 'Profissionais com ampla formação técnica e prática.', icon: <Users className="text-blue-500" /> },
    { title: 'Metodologias Ativas', desc: 'Foco total em aprendizado prático e empregabilidade.', icon: <Zap className="text-blue-500" /> },
    { title: 'Certificação Nacional', desc: 'Certificados válidos e reconhecidos em todo o país.', icon: <Award className="text-blue-500" /> },
    { title: 'Parcerias Estratégicas', desc: 'Convênios para estágios e inserção no mercado.', icon: <Briefcase className="text-blue-500" /> },
    { title: 'Estrutura Moderna', desc: 'Salas climatizadas e laboratórios equipados.', icon: <Thermometer className="text-blue-500" /> },
    { title: 'Plataformas Digitais', desc: 'Ambiente virtual moderno para cursos EAD e híbridos.', icon: <Monitor className="text-blue-500" /> },
    { title: 'Educação Acessível', desc: 'Ensino de qualidade com forte impacto social.', icon: <ShieldCheck className="text-blue-500" /> },
  ];

  return (
    <section id="diferenciais" className="py-20 bg-white">
      <div className="container mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-5xl font-black text-[#001a33] mb-4 uppercase tracking-tighter">
          Nossos <span className="text-blue-600">Diferenciais</span>
        </h2>
        <div className="w-20 h-1.5 bg-blue-600 mx-auto rounded-full mb-12"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {itens.map((item, idx) => (
            <div key={idx} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left group">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                {item.icon}
              </div>
              <h3 className="text-sm font-bold text-blue-900 mb-2 uppercase tracking-tight">{item.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Diferenciais;