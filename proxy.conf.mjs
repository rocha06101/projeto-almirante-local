// Proxy do `npm start`.
// Padrão: backend publicado no Render. Para apontar para um backend local:
//   API_TARGET=http://localhost:8090 npm start
//   API_TARGET=https://localhost:8444 npm start
const target = process.env.API_TARGET ?? 'https://desbravadores-gestao.onrender.com';
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(target);
// O backend do Render precisa do tenant; o local não (a menos que TENANT_ID seja informado).
const tenantId =
  process.env.TENANT_ID ?? (isLocal ? undefined : '0b7f1f70-e9b1-4f0f-aed8-9109f6c967f8');

export default {
  '/api': {
    target,
    // Backend local usa certificado autoassinado.
    secure: !isLocal,
    changeOrigin: true,
    logLevel: 'debug',
    headers: tenantId ? { 'x-tenant-id': tenantId } : {},
  },
};
