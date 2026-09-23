// Proxy do `npm start`.
// Sem configuração: usa o backend local em https://localhost:8444 se ele estiver no ar;
// senão, o backend publicado no Render. Para forçar outro alvo:
//   API_TARGET=http://localhost:8090 npm start
import net from 'node:net';

const LOCAL_TARGET = 'https://localhost:8444';
const REMOTE_TARGET = 'https://desbravadores-gestao.onrender.com';

function isPortOpen(port, host = 'localhost', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const target =
  process.env.API_TARGET ?? ((await isPortOpen(8444)) ? LOCAL_TARGET : REMOTE_TARGET);
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(target);
// O backend do Render precisa do tenant; o local não (a menos que TENANT_ID seja informado).
const tenantId =
  process.env.TENANT_ID ?? (isLocal ? undefined : '0b7f1f70-e9b1-4f0f-aed8-9109f6c967f8');

console.log(`[proxy] /api -> ${target}`);

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
