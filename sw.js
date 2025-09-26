self.addEventListener('install', (e)=> self.skipWaiting());
self.addEventListener('activate', (e)=> self.clients.claim());
// cache bem simples — personalize depois
self.addEventListener('fetch', (e)=>{ /* no-op por enquanto */ });
