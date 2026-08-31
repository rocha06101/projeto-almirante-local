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

const lancamentos = [
  { id: 'l1', membroId: '1', membroNome: 'Guilherme', tipo: 'Mensalidade', descricao: 'Mensalidade do clube', categoria: 'Clube', valor: 200, moeda: 'BRL', vencimento: '2026-08-10', status: 'Pago' },
  { id: 'l2', membroId: '2', membroNome: 'Guilherme', tipo: 'Campori', descricao: 'Campori regional', categoria: 'Evento', valor: 200, moeda: 'BRL', vencimento: '2027-02-20', status: 'Pendente' },
  { id: 'l3', membroId: '3', membroNome: 'Guilherme', tipo: 'Acampamento', descricao: 'Acampamento de verão', categoria: 'Evento', valor: 50, moeda: 'BRL', vencimento: '2026-04-16', status: 'Pago' },
  { id: 'l4', membroId: '1', membroNome: 'Guilherme', tipo: 'Uniflash', descricao: 'Uniflash anual', categoria: 'Evento', valor: 5, moeda: 'BRL', vencimento: '2026-05-29', status: 'Atrasado' },
  { id: 'l5', membroId: '2', membroNome: 'Maria', tipo: 'Mensalidade', descricao: 'Mensalidade', categoria: 'Clube', valor: 150, moeda: 'BRL', vencimento: '2026-09-15', status: 'Pago' },
  { id: 'l6', membroId: '3', membroNome: 'José', tipo: 'Campori', descricao: 'Campori estadual', categoria: 'Evento', valor: 320, moeda: 'BRL', vencimento: '2026-10-02', status: 'Pendente' },
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

  if (method === 'GET' && path === '/Lancamentos') {
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const status = url.searchParams.get('status');
    const tipo = url.searchParams.get('tipo');
    const data = url.searchParams.get('data');
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10');

    let filtered = [...lancamentos];

    if (search) {
      filtered = filtered.filter(item =>
        [item.membroNome, item.descricao, item.tipo, item.categoria, item.status]
          .join(' ')
          .toLowerCase()
          .includes(search),
      );
    }

    if (status && status !== 'Todos') {
      filtered = filtered.filter(item => item.status === status);
    }

    if (tipo && tipo !== 'Todos') {
      filtered = filtered.filter(item => item.tipo === tipo);
    }

    if (data) {
      filtered = filtered.filter(item => item.vencimento.startsWith(data));
    }

    filtered.sort((a, b) => b.vencimento.localeCompare(a.vencimento));

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const items = filtered.slice(startIndex, startIndex + pageSize);

    return sendJson(res, 200, { items, total, page: safePage, pageSize, totalPages });
  }

  if (method === 'POST' && path === '/Lancamentos') {
    const body = await readBody(req);
    const newItem = {
      id: `l${Date.now()}`,
      membroId: body.membroId ?? '1',
      membroNome: body.membroNome ?? 'Novo membro',
      tipo: body.tipo ?? 'Mensalidade',
      descricao: body.descricao ?? 'Lançamento novo',
      categoria: body.categoria ?? 'Clube',
      valor: Number(body.valor ?? 0),
      moeda: body.moeda ?? 'BRL',
      vencimento: body.vencimento ?? new Date().toISOString().slice(0, 10),
      status: body.status ?? 'Pendente',
    };

    lancamentos.unshift(newItem);
    return sendJson(res, 201, newItem);
  }

  if (method === 'PUT' && path.startsWith('/Lancamentos/')) {
    const body = await readBody(req);
    const id = path.replace('/Lancamentos/', '');
    const itemIndex = lancamentos.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return sendJson(res, 404, { message: 'Lançamento não encontrado.' });
    }

    lancamentos[itemIndex] = { ...lancamentos[itemIndex], ...body };
    return sendJson(res, 200, lancamentos[itemIndex]);
  }

  if (method === 'DELETE' && path.startsWith('/Lancamentos/')) {
    const id = path.replace('/Lancamentos/', '');
    const itemIndex = lancamentos.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return sendJson(res, 404, { message: 'Lançamento não encontrado.' });
    }

    lancamentos.splice(itemIndex, 1);
    return sendJson(res, 204, {});
  }

  return sendJson(res, 404, { message: `Rota não implementada no mock: ${method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`Mock server do Almirante Tamandaré rodando em http://localhost:${PORT}`);
});
