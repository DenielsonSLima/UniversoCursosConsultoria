import React from 'react';
import { MapPin, Phone, Clock, MessageCircle } from 'lucide-react';

const unitsData = [
  {
    name: "Unidade Japoatã (Matriz)",
    address: "Rua V, nº 56 - Loteamento São José, Japoatã - SE, 49950-000",
    phone: "(79) 99602-8316 / (79) 99861-7614",
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: "/unnamed-2.jpg"
  },
  {
    name: "Unidade Aquidabã",
    address: "Rua Eduardo Chaves, nº 109, Centro (Vizinho ao Fórum), Aquidabã - SE, 49945-000",
    phone: "(79) 99602-8316 / (79) 99861-7614",
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: "https://images.unsplash.com/photo-1541339907198-e08756ebafe3?auto=format&fit=crop&q=80&w=800"
  },
  {
    name: "Unidade Porto da Folha",
    address: "Rua Major João Gonçalves, nº 1783, Centro (Vizinho à Delegacia), Porto da Folha - SE, 49800-000",
    phone: "(79) 99602-8316 / (79) 99861-7614",
    whatsapp: "5579996028316",
    hours: [
      { day: "Segunda a Sexta", time: "08:00 às 17:00" },
      { day: "Sábado", time: "08:00 às 17:00" }
    ],
    image: "https://images.unsplash.com/photo-1498243639359-2830bcb3c154?auto=format&fit=crop&q=80&w=800"
  }
];

const UnitsList: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {unitsData.map((unit, index) => (
        <div 
          key={index} 
          className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-2xl hover:shadow-blue-900/10 transition-all group"
        >
          <div className="h-48 overflow-hidden relative">
            <img 
              src={unit.image} 
              alt={unit.name} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
            <div className="absolute bottom-4 left-6">
              <h3 className="text-white font-black text-xl uppercase tracking-tighter">
                {unit.name}
              </h3>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            {/* Endereço */}
            <div className="flex gap-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Localização</p>
                <p className="text-slate-700 font-medium leading-snug">{unit.address}</p>
              </div>
            </div>

            {/* Contato */}
            <div className="flex gap-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit">
                <Phone size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Telefone</p>
                <p className="text-slate-700 font-bold">{unit.phone}</p>
              </div>
            </div>

            {/* Horários */}
            <div className="flex gap-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl h-fit">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Funcionamento</p>
                {unit.hours.map((h, i) => (
                  <p key={i} className="text-slate-700 text-sm">
                    <span className="font-semibold text-blue-900">{h.day}:</span> {h.time}
                  </p>
                ))}
              </div>
            </div>

            {/* Ação */}
            <a 
              href={`https://wa.me/${unit.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-4 flex items-center justify-center gap-2 bg-[#FFFFFF] border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
            >
              <MessageCircle size={16} />
              Falar com esta unidade
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UnitsList;