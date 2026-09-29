/**
 * Base da API. Em localhost (e em `*.workers.dev`) o navegador fala com o mesmo
 * origin do frontend e o proxy do dev-server encaminha `/api` ao backend, o que
 * mantém os cookies `__Host-*` (Secure, HttpOnly, SameSite=Strict) no mesmo site.
 */
export function resolveApiBaseUrl(): string {
  const host = globalThis.location?.hostname ?? '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  const isCloudflareWorkers = host.endsWith('.workers.dev');

  if (isLocalhost || isCloudflareWorkers) {
    return '/api';
  }

  return 'https://desbravadores-gestao.onrender.com/api';
}

/** Indica se a URL pertence à API legítima (única a receber Bearer e cookies). */
export function isApiUrl(url: string): boolean {
  const base = resolveApiBaseUrl();
  return url === base || url.startsWith(`${base}/`);
}
