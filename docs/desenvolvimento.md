# Desenvolvimento, autenticação, PWA e testes

## Ambientes (scripts npm)

| Script | Aponta para | Protocolo | Uso |
| --- | --- | --- | --- |
| `npm start` | `proxy.conf.json` → API remota (Render) | HTTP `:4200` | Comportamento histórico. **Não** faz login contra o backend atual (cookies `__Host-` exigem HTTPS). |
| `npm run start:https` | `proxy.conf.json` → API remota (Render) | HTTPS `:4201` | Idem, com HTTPS. |
| **`npm run start:local`** | `proxy.conf.backend-https.json` → **backend local** `https://localhost:8444` | **HTTPS `:4201`** | Desenvolvimento normal contra o backend real do Compose (`compose.https.yaml`). |
| `npm run start:backend` | `proxy.conf.backend.json` → `http://localhost:8090` | HTTP `:4200` | Backend em HTTP (não autentica: o backend exige HTTPS). |
| `npm run start:mock` | `proxy.conf.local.json` → `mock-server.mjs` (`:3333`) | HTTP `:4200` | Sem backend; `node mock-server.mjs` em outro terminal. |

`secure: false` no `proxy.conf.backend-https.json` aceita o certificado **autoassinado do nginx local** e existe
somente para desenvolvimento. Nada disso é usado no build de produção.

O navegador fala sempre com o **mesmo origin** do frontend (`/api/...`); o proxy encaminha ao backend. Assim os
cookies `__Host-almirante-csrf` e `__Host-almirante-refresh` (Secure, HttpOnly, SameSite=Strict, sem `Domain`) ficam
no site do frontend e o CORS não é necessário.

## Contrato de autenticação (backend `Desbravadores.Backend`)

- `GET /api/Auth/csrf` → `{ "csrfToken": "..." }` e cookie `__Host-almirante-csrf` (HttpOnly).
- `POST /api/Auth/login`, `/refresh`, `/logout` exigem o header **`X-CSRF-TOKEN`** (não é o `XSRF-TOKEN` padrão do Angular)
  e o cookie de CSRF. Login → `{ "token": { "accessToken", "expiresAtUtc" } }` e cookie `__Host-almirante-refresh` (HttpOnly).
- O antiforgery vincula o token ao usuário autenticado no momento da emissão: quando a chamada seguinte leva `Authorization: Bearer`
  (logout), o CSRF é pedido **com** Bearer; login/refresh usam CSRF anônimo.
- Somente o **access token** vive no cliente, **em memória** (`AuthService`). Após recarregar a página a sessão é restaurada com
  `csrf` → `refresh` (cookie) → `Auth/Me`. Nada é gravado em `localStorage`/`sessionStorage` (o token legado `auth_token` é apagado).
- `401` em endpoint de negócio: uma renovação (compartilhada entre chamadas simultâneas e abas via Web Locks) e uma repetição;
  se falhar, a sessão local é encerrada e o usuário volta ao `/login`. `403` **não** encerra a sessão. `429` mostra o `Retry-After`.
- `withCredentials` e `Authorization` são aplicados **apenas** a URLs da API (`core/config/api-base.ts`), nunca a domínios externos.

## PWA

- `public/manifest.webmanifest` (standalone, ícones `any` e `maskable` 192/512) + `apple-touch-icon`. Ícones gerados por
  `node scripts/generate-pwa-icons.mjs` a partir de `public/images/logo.png`.
- `ngsw-config.json`: **somente o shell e assets estáticos** (JS/CSS/fontes/imagens/ícones). Não há `dataGroups`: nenhuma resposta da
  API (auth, usuários, financeiro…) é armazenada pelo service worker, e `/api/**` fica fora das navegações do SW.
- Service worker só existe no **build de produção** (`provideServiceWorker`, `enabled: !isDevMode()`).
- Atualização: ao detectar uma versão nova o app mostra um aviso ("Há uma nova versão… Atualizar agora / Depois"); nada recarrega
  sozinho, para não interromper um formulário em uso. Também confere atualização quando o app volta ao primeiro plano.
- Instalação exige origem confiável: `localhost` (HTTP) em desenvolvimento ou HTTPS com certificado válido em produção.
  Chrome **não registra** service worker em HTTPS com certificado autoassinado não confiável.

## Testes

```bash
npm test                      # unitários (Vitest, via ng test)
npm run build                 # build de produção (gera ngsw.json)
npm run test:e2e              # E2E de layout/shell (Chrome do sistema; sobe `npm run start:local`; API interceptada)
npm run test:e2e:pwa          # PWA sobre dist/ (rode `npm run build` antes)
E2E_EMAIL=... E2E_PASSWORD=... npx playwright test --project=real-backend   # login/refresh/logout reais
```

- `e2e/responsive.spec.ts`: 17 viewports (celulares, tablets retrato/paisagem, notebooks, desktop) × login, cadastro, home, desbravadores,
  cadastro de membro, tesouraria, lançamentos: sem overflow horizontal global, navegação/menus dentro da viewport, alvos de toque,
  dropdowns dentro da viewport, ausência de erros de console. Screenshots em `test-results/screens/` (`E2E_FULL=0` para só a viewport).
- `e2e/shell.spec.ts`: sidebar (completa/trilho/barra inferior), cliques de navegação, logout, teclado, rotação.
- `e2e/auth.real.spec.ts`: contra `https://localhost:8444` (o backend limita login a 3/min por IP: não repita em rajada).
