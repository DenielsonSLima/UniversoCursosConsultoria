import React, { useEffect, useRef, useState } from 'react';

interface PartnerCardAvatarProps {
  src?: string | null;
  name: string;
  className?: string;
  onPhotoError?: (src: string) => Promise<string | null>;
}

const initialsFor = (name: string) => String(name || '').trim().split(/\s+/).filter(Boolean)
  .slice(0, 2).map(part => Array.from(part)[0] || '').join('').toLocaleUpperCase('pt-BR') || '?';

function AvatarImage({ src, name, className = '', onPhotoError }: PartnerCardAvatarProps & { key?: string }) {
  const [photo, setPhoto] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const recovery = useRef<'idle' | 'pending' | 'used'>('idle');
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const state = !photo ? 'initials' : failed ? 'error' : loaded ? 'loaded' : 'loading';

  const fail = async () => {
    setLoaded(false);
    if (recovery.current === 'pending') return;
    if (!photo || !onPhotoError || recovery.current === 'used') { setFailed(true); return; }
    recovery.current = 'pending';
    try {
      const replacement = await onPhotoError(photo);
      if (!active.current) return;
      if (replacement && replacement !== photo) { setPhoto(replacement); setFailed(false); }
      else setFailed(true);
    } catch {
      if (active.current) setFailed(true);
    } finally { recovery.current = 'used'; }
  };

  return (
    <div role="img" aria-label={name} data-photo-state={state}
      className={`partner-card-avatar relative ${className}`}>
      <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-xs font-medium">
        {initialsFor(name)}
      </span>
      {photo && !failed && (
        <img key={photo} src={photo} alt="" aria-hidden="true" width={40} height={40} loading="lazy" decoding="async"
          className="absolute inset-0 block h-full w-full object-cover"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={event => {
            if (event.currentTarget.complete && event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0) setLoaded(true);
          }}
          onError={() => void fail()} />
      )}
    </div>
  );
}

export default function PartnerCardAvatar({ src, ...props }: PartnerCardAvatarProps) {
  const photo = typeof src === 'string' ? src.trim() : '';
  return <AvatarImage key={photo} {...props} src={photo} />;
}
