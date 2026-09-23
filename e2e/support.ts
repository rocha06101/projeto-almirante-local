import { Page, Route } from '@playwright/test';

export const VIEWPORTS = {
  phones: [
    { name: 'phone-320x568', width: 320, height: 568 },
    { name: 'phone-360x640', width: 360, height: 640 },
    { name: 'phone-375x667', width: 375, height: 667 },
    { name: 'phone-390x844', width: 390, height: 844 },
    { name: 'phone-412x915', width: 412, height: 915 },
    { name: 'phone-430x932', width: 430, height: 932 },
    { name: 'phone-landscape-844x390', width: 844, height: 390 },
  ],
  tablets: [
    { name: 'tablet-768x1024', width: 768, height: 1024 },
    { name: 'tablet-820x1180', width: 820, height: 1180 },
    { name: 'tablet-834x1194', width: 834, height: 1194 },
    { name: 'tablet-landscape-1024x768', width: 1024, height: 768 },
    { name: 'tablet-landscape-1180x820', width: 1180, height: 820 },
  ],
  desktops: [
    { name: 'laptop-1280x720', width: 1280, height: 720 },
    { name: 'laptop-1366x768', width: 1366, height: 768 },
    { name: 'laptop-1440x900', width: 1440, height: 900 },
    { name: 'laptop-1536x864', width: 1536, height: 864 },
    { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  ],
};

export const ALL_VIEWPORTS = [...VIEWPORTS.phones, ...VIEWPORTS.tablets, ...VIEWPORTS.desktops];

/** Viewports em que também se guarda screenshot como evidência visual. */
export const SCREENSHOT_VIEWPORTS = new Set([
  'phone-390x844',
  'phone-landscape-844x390',
  'tablet-768x1024',
  'tablet-landscape-1024x768',
  'laptop-1366x768',
  'desktop-1920x1080',
]);

export const ROUTES = [
  { path: '/', name: 'home', ready: 'app-home' },
  { path: '/desbravadores', name: 'desbravadores', ready: 'app-desbravadores table' },
  { path: '/desbravadores/cadastrar', name: 'cadastro-membro', ready: 'app-user-register' },
  { path: '/treasury', name: 'tesouraria', ready: 'app-treasury app-financial-entries-component table' },
  { path: '/lancamentos', name: 'lancamentos', ready: 'app-financial-entries-component table' },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Intercepta somente a API (`/api/**`) com respostas fixas, para exercitar layout sem
 * depender de dados/credenciais reais. Os testes de contrato real ficam em auth.real.spec.ts.
 */
export async function mockApi(page: Page) {
  const expires = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname.toLowerCase();
    const method = route.request().method();

    if (path.endsWith('/auth/csrf')) return json(route, { csrfToken: 'csrf-de-teste' });
    if (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) {
      return json(route, { token: { accessToken: 'token-de-teste', expiresAtUtc: expires() } });
    }
    if (path.endsWith('/auth/me')) {
      return json(route, {
        id: '11111111-1111-1111-1111-111111111111',
        nome: 'Maria Aparecida de Nascimento Albuquerque',
        email: 'maria@example.com',
        cargo: { id: '22222222-2222-2222-2222-222222222222', nome: 'Diretoria', role: 'Diretor' },
      });
    }
    if (path.endsWith('/auth/logout')) return route.fulfill({ status: 204 });
    if (path.endsWith('/usuarios') && method === 'GET') {
      return json(
        route,
        Array.from({ length: 8 }, (_, i) => ({
          id: `0000000${i}-aaaa-bbbb-cccc-dddddddddddd`,
          nome: i % 2 ? 'Bartolomeu Fernandes de Albuquerque Cavalcanti' : `Desbravador ${i + 1}`,
          email: i % 2 ? 'bartolomeu.fernandes.albuquerque.cavalcanti@clube-desbravadores.example.org' : `d${i}@example.com`,
          dataCriacao: '2026-03-10T10:00:00Z',
          cargo: { id: 'c1', nome: i % 3 ? 'Desbravador' : 'Conselheiro', role: 'Membro' },
        })),
      );
    }
    if (path.endsWith('/lancamentos') && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return json(route, {
        items: Array.from({ length: 6 }, (_, i) => ({
          id: `0000000${i}-1111-2222-3333-444444444444`,
          membroId: `0000000${i}-aaaa-bbbb-cccc-dddddddddddd`,
          membroNome: i % 2 ? 'Bartolomeu Fernandes de Albuquerque Cavalcanti' : `Membro ${i + 1}`,
          finalidade: ['Mensalidade', 'Campori', 'Acampamento'][i % 3],
          descricao: null,
          categoria: i % 2 ? 'Evento' : 'Clube',
          tipoFluxo: i % 4 === 3 ? 'Saida' : 'Entrada',
          valor: 20 + i * 15.5,
          vencimento: `2026-08-1${i}`,
          status: ['Pendente', 'Pago', 'Atrasado'][i % 3],
        })),
        total: 23,
        page,
        pageSize: 10,
        totalPages: 3,
      });
    }
    return json(route, []);
  });
}

export interface OverflowReport {
  documentOverflow: number;
  offenders: string[];
}

/**
 * Overflow horizontal GLOBAL (documentElement.scrollWidth > clientWidth) e, para diagnóstico,
 * os elementos que ultrapassam a viewport fora de containers deliberadamente roláveis.
 */
export async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = (el: Element) => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) return true;
      }
      return false;
    };

    const offenders = Array.from(document.body.querySelectorAll('*'))
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || style.position === 'fixed') return false;
        return (rect.right > window.innerWidth + 1 || rect.left < -1) && !clipped(el);
      })
      .slice(0, 8)
      .map(el => {
        const rect = el.getBoundingClientRect();
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : '';
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [${Math.round(rect.left)}..${Math.round(rect.right)}]`;
      });

    return { documentOverflow: doc.scrollWidth - doc.clientWidth, offenders };
  });
}

/** Erros de console/página relevantes (ignora ruído de terceiros conhecido). */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];

  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('requestfailed', request => {
    problems.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/api/')) {
      problems.push(`http ${response.status()}: ${response.url()}`);
    }
  });

  return problems;
}
