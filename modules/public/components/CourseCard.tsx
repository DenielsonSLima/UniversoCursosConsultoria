
import React from 'react';
import { Briefcase, Rocket, Users, BarChart } from 'lucide-react';

interface CourseCardProps {
  title: string;
  description: string;
  icon: string;
}

const CourseCard: React.FC<CourseCardProps> = ({ title, description, icon }) => {
  const renderIcon = () => {
    switch (icon) {
      case 'Briefcase': return <Briefcase size={32} />;
      case 'Rocket': return <Rocket size={32} />;
      case 'Users': return <Users size={32} />;
      case 'BarChart': return <BarChart size={32} />;
      default: return <Briefcase size={32} />;
    }
  };

  return (
    <div className="group p-8 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2">
      <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
        {renderIcon()}
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
      <p className="text-slate-600 leading-relaxed">
        {description}
      </p>
      <button className="mt-6 text-blue-600 font-semibold flex items-center group-hover:underline">
        Saiba mais 
        <span className="ml-1">→</span>
      </button>
    </div>
  );
};

export default CourseCard;
