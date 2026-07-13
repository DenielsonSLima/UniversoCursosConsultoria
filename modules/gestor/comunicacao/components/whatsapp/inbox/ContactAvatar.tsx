import React from 'react';
import { initials } from '../whatsapp.utils';

interface ContactAvatarProps {
  name?: string | null;
  photo?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-12 w-12 text-sm',
};

const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, photo, size = 'md', className = '' }) => (
  <div className={`shrink-0 overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-700 ${sizes[size]} ${className}`}>
    {photo ? (
      <img src={photo} alt={name || 'Contato'} className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full items-center justify-center">{initials(name)}</div>
    )}
  </div>
);

export default ContactAvatar;
