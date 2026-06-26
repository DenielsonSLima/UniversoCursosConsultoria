import React from 'react';
import { File, FileSpreadsheet, FileText, Image, Presentation } from 'lucide-react';

export const ACCEPTED_ATTACHMENT_TYPES = 'image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx';

export const getFileIcon = (url: string | null, type?: string) => {
  if (!url && !type) return <File size={14} />;
  const lower = (url || type || '').toLowerCase();

  if (/\.(jpe?g|png|gif|webp|svg)/.test(lower) || (type || '').startsWith('image/')) {
    return <Image size={14} className="text-blue-500" />;
  }

  if (/\.pdf/.test(lower) || lower.includes('pdf')) {
    return <FileText size={14} className="text-red-500" />;
  }

  if (/\.(ppt|pptx)/.test(lower) || lower.includes('presentation')) {
    return <Presentation size={14} className="text-orange-500" />;
  }

  if (/\.(xls|xlsx)/.test(lower) || lower.includes('spreadsheet')) {
    return <FileSpreadsheet size={14} className="text-emerald-600" />;
  }

  if (/\.(doc|docx)/.test(lower) || lower.includes('word')) {
    return <FileText size={14} className="text-blue-600" />;
  }

  return <File size={14} className="text-slate-500" />;
};

export const isImageUrl = (url: string) =>
  /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url);

export const formatChatTime = (isoString?: string | null) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};
