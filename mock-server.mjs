// Servidor mock local para o projeto Almirante Tamandaré.
// Substitui temporariamente o backend remoto (desbravadores-gestao.onrender.com)
// enquanto você não tem acesso a ele. Roda 100% localmente, sem dependências externas.
//
// Como usar:
//   node mock-server.mjs
//   (por padrão sobe em http://localhost:3333)
//
// Depois, com o proxy.conf.json apontando para http://localhost:3333,
// rode "npm start" normalmente para o Angular.

import { createServer } from 'node:http';

const PORT = 3333;

// "Banco de dados" fake em memória
const usuarios = [
  { id: '1', nome: 'Ana Souza', email: 'ana.souza@example.com', dataCriacao: '2026-01-10T10:00:00Z', roles: 'Admin' },
  { id: '2', nome: 'Bruno Lima', email: 'bruno.lima@example.com', dataCriacao: '2026-02-15T14:30:00Z', roles: 'Desbravador' },
  { id: '3', nome: 'Carla Mendes', email: 'carla.mendes@example.com', dataCriacao: '2026-03-20T09:15:00Z', roles: 'Desbravador' },
];

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      try {
        resolve(chunks ? JSON.parse(chunks) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api/, ''); // proxy.conf.json já remove /api, mas cobrimos os dois casos
  const method = req.method;

  console.log(`[mock] ${method} ${req.url}`);

  // POST /Auth/login
  if (method === 'POST' && path === '/Auth/login') {
    const body = await readBody(req);
    if (!body.email || !body.senha) {
      return sendJson(res, 400, { message: 'Email e senha são obrigatórios.' });
    }
    return sendJson(res, 200, {
      token: { accessToken: 'mock-jwt-token-' + Date.now() },
      usuario: { id: '1', nome: 'Usuário Local', email: body.email, roles: 'Admin' },
    });
  }

  // POST /Auth/logout
  if (method === 'POST' && path === '/Auth/logout') {
    return sendJson(res, 200, {});
  }

  // GET /Auth/Me
  if (method === 'GET' && path === '/Auth/Me') {
    const auth = req.headers['authorization'];
    if (!auth) {
      return sendJson(res, 401, { message: 'Não autenticado.' });
    }
    return sendJson(res, 200, { id: '1', nome: 'Usuário Local', email: 'local@example.com', roles: 'Admin' });
  }

  // GET /Usuarios
  if (method === 'GET' && path === '/Usuarios') {
    return sendJson(res, 200, usuarios);
  }

  return sendJson(res, 404, { message: `Rota não implementada no mock: ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`Mock server do Almirante Tamandaré rodando em http://localhost:${PORT}`);
});
