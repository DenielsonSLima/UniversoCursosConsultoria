
import React from 'react';

const AboutSection: React.FC = () => {
  return (
    <div className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2">
            <img 
              src="https://picsum.photos/600/400?random=10" 
              alt="Sobre nós" 
              className="rounded-2xl shadow-2xl w-full object-cover"
            />
          </div>
          <div className="lg:w-1/2">
            <h4 className="text-blue-600 font-bold uppercase tracking-widest text-sm mb-2">Quem Somos</h4>
            <h2 className="text-4xl font-bold text-slate-900 mb-6 leading-tight">Excelência em Capacitação e Estratégia</h2>
            <p className="text-slate-600 text-lg mb-6 leading-relaxed">
              O Universo Cursos e Consultoria nasceu com a missão de democratizar o acesso ao conhecimento de alto nível e fornecer suporte estratégico para empresas de todos os tamanhos.
            </p>
            <p className="text-slate-600 text-lg mb-8 leading-relaxed">
              Com mais de uma década de experiência, nossa equipe é composta por mestres, doutores e profissionais que vivem o dia a dia do mercado global.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h5 className="font-bold text-2xl text-blue-600">5000+</h5>
                <p className="text-slate-500">Alunos Certificados</p>
              </div>
              <div>
                <h5 className="font-bold text-2xl text-blue-600">300+</h5>
                <p className="text-slate-500">Empresas Atendidas</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutSection;
