import React from 'react';

interface TypingIndicatorProps {
  name?: string | null;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ name }) => (
  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
    <span>{name ? `${name.split(' ')[0]} está digitando` : 'Digitando'}</span>
    <span className="flex items-center gap-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.2s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.1s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" />
    </span>
  </div>
);

export default TypingIndicator;
