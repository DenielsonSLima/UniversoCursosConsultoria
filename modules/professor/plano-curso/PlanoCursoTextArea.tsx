import React, { useLayoutEffect, useRef } from 'react';

interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const PlanoCursoTextArea: React.FC<Props> = ({ value, className = '', ...props }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return undefined;
    const fit = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(128, textarea.scrollHeight)}px`;
    };
    fit();
    let width = textarea.clientWidth;
    const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(() => {
      if (textarea.clientWidth !== width) {
        width = textarea.clientWidth;
        fit();
      }
    }) : null;
    observer?.observe(textarea);
    return () => observer?.disconnect();
  }, [value]);
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={4}
      className={`block min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-base leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 sm:text-[13px] ${className}`}
    />
  );
};

export default PlanoCursoTextArea;
