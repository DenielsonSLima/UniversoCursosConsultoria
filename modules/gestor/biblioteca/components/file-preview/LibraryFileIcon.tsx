import React from 'react';
import {
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation
} from 'lucide-react';
import { FilePreviewKind } from './filePreview.utils';

interface LibraryFileIconProps {
  kind: FilePreviewKind;
  size?: 'sm' | 'md' | 'lg';
}

const ICON_STYLES: Record<FilePreviewKind, { className: string; label: string }> = {
  PDF: { className: 'from-rose-500 to-red-600 text-white', label: 'PDF' },
  DOC: { className: 'from-blue-500 to-blue-700 text-white', label: 'DOC' },
  XLS: { className: 'from-emerald-500 to-emerald-700 text-white', label: 'XLS' },
  PPT: { className: 'from-orange-500 to-red-600 text-white', label: 'PPT' },
  IMG: { className: 'from-fuchsia-500 to-violet-700 text-white', label: 'IMG' },
  VIDEO: { className: 'from-amber-400 to-orange-600 text-white', label: 'VÍDEO' },
  OTHER: { className: 'from-slate-400 to-slate-600 text-white', label: 'ARQ' }
};

const ICONS: Record<FilePreviewKind, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  PDF: FileText,
  DOC: FileText,
  XLS: FileSpreadsheet,
  PPT: Presentation,
  IMG: FileImage,
  VIDEO: FileVideo,
  OTHER: File
};

const SIZE_STYLES = {
  sm: { wrapper: 'h-10 w-9 rounded-lg', icon: 17, badge: 'text-[6px] bottom-1' },
  md: { wrapper: 'h-14 w-12 rounded-xl', icon: 22, badge: 'text-[7px] bottom-1.5' },
  lg: { wrapper: 'h-[76px] w-16 rounded-2xl', icon: 30, badge: 'text-[8px] bottom-2' }
};

const LibraryFileIcon: React.FC<LibraryFileIconProps> = ({ kind, size = 'md' }) => {
  const style = ICON_STYLES[kind];
  const sizes = SIZE_STYLES[size];
  const Icon = ICONS[kind];

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br shadow-lg shadow-slate-900/10 ring-1 ring-white/70 ${sizes.wrapper} ${style.className}`}
    >
      <span className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/20" />
      <Icon size={sizes.icon} strokeWidth={1.8} />
      <span className={`absolute font-black tracking-[0.12em] text-white/95 ${sizes.badge}`}>
        {style.label}
      </span>
    </span>
  );
};

export default LibraryFileIcon;
