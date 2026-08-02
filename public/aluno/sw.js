const CACHE_VERSION = 'universo-aluno-shell-v3';
const SAFE_SHELL_ASSETS = [
  '/aluno/',
  '/aluno/manifest.webmanifest',
  '/aluno/icons/app-icon-v3-192.png',
  '/aluno/icons/app-icon-v3-512.png',
  '/aluno/icons/apple-touch-icon-v3.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SAFE_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('universo-aluno-shell-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Este worker não intercepta fetches. Assim, Auth, Supabase, pagamentos,
// documentos, PDFs e dados acadêmicos nunca são persistidos pelo PWA.
