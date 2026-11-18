# Reconstrução de Eventos — 17/11/2026

A implementação está no workspace, com build, testes unitários e testes no Chromium aprovados. A homologação autenticada contra o backend real permanece pendente: não havia credenciais E2E configuradas. Os testes de navegador usam exclusivamente fixtures dentro de `e2e/`; o código de produção consulta a API.

## 1. Diagnóstico inicial

- Branch: `feature/events-screen`.
- Workspace Angular único, com `src/app/core`, `src/app/pages` e `src/app/shared`; `/eventos` já estava registrada como rota lazy com `authGuard` no layout e `permissaoGuard` para `eventos.consultar`.
- A implementação anterior era uma tabela inline em `src/app/pages/eventos/eventos.ts`.
- O Git já apresentava alterações em `package.json` e `package-lock.json`. Elas incluíam os quatro pacotes FullCalendar. Esses arquivos foram preservados, sem instalação, regeneração do lockfile, commit, push ou merge.
- Node instalado: **20.20.2**; npm: **10.8.2**. Angular instalado: **21.2.9**; CLI/build: **21.2.7**; TypeScript: **5.9.3**; RxJS: **7.8.2**; tslib: **2.8.1**.
- Node 20.20.2 atende à [matriz de compatibilidade do Angular 21](https://angular.dev/reference/versions), mas é inferior ao `engines.node >=22.12.0` declarado pelo próprio projeto. Essa divergência foi registrada; não se alterou a configuração para ocultá-la.
- `npm ls --depth=0` terminou com código 0; Angular, Bootstrap, Inter, RxJS e tslib estavam resolvidos. `@emnapi/core` e `@emnapi/runtime` apareciam como dependências opcionais ausentes, sem impedir build ou testes.
- `package.json`, lockfile, `angular.json` e os três `tsconfig` foram inspecionados. Os arquivos CSS referenciados em `angular.json` estão presentes e são resolvidos no build.
- O **build inicial passou**. Não houve TS2307, TS2354 ou TS2304. Portanto, não é possível atribuir uma causa histórica comprovada aos erros anteriores; eles não são reproduzíveis no estado encontrado. Nenhum componente compartilhado foi alterado para mascará-los.
- `skipLibCheck: true` já existia no projeto e não foi alterado. Também foi executada a checagem adicional com `--skipLibCheck false`, com sucesso.

## 2. Arquivos criados e alterados

Alterado:

- `src/app/pages/eventos/eventos.ts`

Criados:

- `src/app/core/models/evento.model.ts`
- `src/app/core/services/eventos.ts`
- `src/app/pages/eventos/eventos.html`
- `src/app/pages/eventos/eventos.scss`
- `src/app/pages/eventos/eventos.utils.ts`
- `src/app/pages/eventos/eventos.spec.ts`
- `src/app/pages/eventos/calendario/eventos-calendario.ts`
- `src/app/pages/eventos/calendario/eventos-calendario.scss`
- `src/app/pages/eventos/proximos/proximos-eventos.ts`
- `src/app/pages/eventos/proximos/proximos-eventos.scss`
- `src/app/pages/eventos/detalhes/evento-detalhes.ts`
- `src/app/pages/eventos/detalhes/evento-detalhes.html`
- `src/app/pages/eventos/detalhes/evento-detalhes.scss`
- `src/app/pages/eventos/detalhes/evento-detalhes.spec.ts`
- `src/app/pages/eventos/formulario/evento-formulario.ts`
- `src/app/pages/eventos/formulario/evento-formulario.html`
- `src/app/pages/eventos/formulario/evento-formulario.scss`
- `src/app/pages/eventos/formulario/evento-formulario.spec.ts`
- `e2e/eventos.spec.ts`
- `playwright.eventos.config.ts`
- `docs/RELATORIO-EVENTOS.md`

Sidebar, Topbar, Toast, autenticação, interceptors, rotas e backend não foram modificados.

## 3. Dependências

Nenhuma dependência nova foi instalada nesta execução. Foram reutilizadas as alterações preexistentes:

| Pacote | Versão instalada |
| --- | --- |
| `@fullcalendar/angular` | 6.1.21 |
| `@fullcalendar/core` | 6.1.21 |
| `@fullcalendar/daygrid` | 6.1.21 |
| `@fullcalendar/interaction` | 6.1.21 |

O manifesto instalado do adaptador declara peers Angular `12 - 22` e core `~6.1.21`, compatíveis com as versões encontradas. Angular CDK, Vitest e Playwright já estavam disponíveis. Não foram usados `--force`, `--legacy-peer-deps` ou mudanças nos budgets.

## 4. Componentes e responsabilidades

| Arquivo/componente | Responsabilidade |
| --- | --- |
| `Eventos` | Orquestra período visível, próximos eventos, seleção e abertura do modal |
| `EventosCalendario` | FullCalendar mensal, navegação, seleção e renderização |
| `ProximosEventos` | Cards cronológicos e paginação de três cadastros |
| `EventoDetalhes` | GET atual, grupos relacionados, lançamentos e exclusão |
| `EventoFormulario` | Cadastro/edição, participantes, custos, revisão e confirmação financeira |
| `EventosService` | HTTP pelos serviços/interceptors existentes e operação de cadastro pendente em memória |
| `evento.model.ts` | DTOs e payloads separados |
| `eventos.utils.ts` | Datas civis, apresentação, identificação dos grupos e erros HTTP |

O serviço tem uma instância no escopo da página: permite recuperar um cadastro incerto ao fechar/reabrir o modal, sem compartilhar o rascunho com uma nova sessão de navegação. Não persiste tokens nem dados do formulário em Web Storage.

## 5. Contratos inspecionados e endpoints

Foram consultados os [DTOs do backend remoto](https://github.com/LucasDevolps/Desbravadores.Backend/blob/main/src/Almirante.Api/Dtos/EventoDtos.cs) e o [controller remoto](https://github.com/LucasDevolps/Desbravadores.Backend/blob/main/src/Almirante.Api/Controllers/EventosController.cs), além das cópias locais em `../Desbravadores.Backend` e `../backend-issue-186`. Nesta última foram conferidos também validators, regras monetárias, enum de status e serviço de eventos. O controller da branch local da issue 186 usa as permissões dinâmicas por operação, enquanto o `main` remoto consultado ainda contém a policy anterior. O frontend usa exclusivamente as permissões dinâmicas existentes.

| Operação | Contrato utilizado |
| --- | --- |
| `GET /api/Eventos` | `dataInicial` e `dataFinal` inclusivas em `yyyy-MM-dd`; resposta `items`, período e `dataMinimaCadastro` |
| `GET /api/Eventos/{id}` | Estado atual com `versao` base64, participantes e lançamentos |
| `POST /api/Eventos` | Data, local, membros, transporte, alimentação, seguro, referência opcional e header UUID `Idempotency-Key` |
| `PUT /api/Eventos/{id}` | Conteúdo editável, `versao` e motivo quando há remoção de participantes |
| `DELETE /api/Eventos/{id}` | Corpo com `motivo` e `versao` |
| `GET /api/Membros` | Identificação/seleção de participantes, condicionada a `membros.consultar` |

O fim exclusivo do FullCalendar é convertido para o dia civil anterior. A consulta de próximos eventos usa hoje até hoje + 365 dias, totalizando 366 dias inclusivos. Navegação rápida cancela a consulta anterior com `switchMap`; notificações repetidas do mesmo período não geram novo GET.

## 6. Funcionalidades implementadas

- Visualização mensal `dayGridMonth`, português, segunda-feira como primeiro dia, semanas variáveis e limite de eventos por célula.
- Mês anterior/próximo, Hoje, título mensal, destaque de hoje e seleção de data sem cadastro automático.
- Lista dos eventos da data selecionada e cadastro preenchido com essa data.
- Cards futuros ordenados, independentes do mês visível, com paginação, local e quantidade real de participantes.
- Estados distintos para carregamento, vazio, erro, autorização, envio e conclusão.
- Detalhes consultados por ID, custos individuais, total do cadastro, participantes e lançamentos.
- Identificação dos grupos do mesmo passeio sem somar valores financeiros nem perder IDs individuais.
- Formulário com participantes pesquisáveis, transporte gratuito, alimentação individual, seguro e referência ao mesmo passeio.
- Estimativas monetárias antes da confirmação; backend permanece responsável pelos valores definitivos e pela geração/sincronização dos lançamentos.
- Confirmação explícita antes de salvar; bloqueio de cliques repetidos.
- Repetição de POST com a mesma chave e corpo após resposta incerta; reabertura do modal recupera a operação enquanto a página permanece aberta.
- Tratamento de `EVENTO_IDEMPOTENCIA_SEM_RESPOSTA_ORIGINAL`, oferecendo consulta do cadastro já existente.
- PUT/DELETE preservam a versão. Conflitos de edição/exclusão bloqueiam reenvio até recarregar os dados atuais.
- Motivo obrigatório na remoção de participantes e na exclusão; confirmação separada de exclusão.
- Bloqueios para lançamentos pagos/atrasados e para mudança de data/local em passeio com múltiplos cadastros.
- Permissões `eventos.consultar`, `eventos.criar`, `eventos.editar`, `eventos.excluir` e verificação adicional na execução das operações.
- Toast global, foco contido no modal, Escape, abertura de evento por teclado e restauração do foco.
- Calendário redimensionado pela API pública quando a animação da Sidebar altera o espaço disponível.

## 7. Testes executados

| Comando | Resultado |
| --- | --- |
| `npm test -- --watch=false` antes dos novos testes | 42 arquivos, 274 testes aprovados |
| `npm test -- --watch=false --include='src/app/pages/eventos/**/*.spec.ts'` | 3 arquivos, 31 testes novos aprovados |
| `npm test -- --watch=false` final | **45 arquivos, 305 testes aprovados** |
| `npx playwright test --config=playwright.eventos.config.ts` | **13 testes aprovados** no Chromium |
| `npx tsc -p tsconfig.app.json --noEmit --skipLibCheck false` | Aprovado, sem erros |
| `git diff --check` | Aprovado |

Cobertura inclui os 18 grupos de cenários solicitados: renderização da rota/calendário, navegação, intervalos inclusivos, datas civis e fuso, dados recebidos, próximos eventos, seleção, detalhes, confirmação, idempotência, versão, motivo, RBAC, HTTP 400/401/403/404/409, estados, atualização e cancelamento de respostas obsoletas. O fluxo de renovação após 401 também mantém os testes preexistentes dos interceptors/autenticação.

Os cenários de navegador verificam chamadas HTTP, ausência de POST antes da confirmação, preservação da chave/corpo, edição após recarga de versão, atualização pós-exclusão e bloqueio de rota antes de consultar eventos. Os quatro testes visuais também exigem ausência de erros de console/página no fluxo normal.

## 8. Build

`npm run build` passou antes e depois da implementação.

- Bundle inicial: **914,92 kB → 931,40 kB**, abaixo do limite de erro de 1 MB; o aviso de 500 kB já existia.
- Chunk lazy de Eventos: aproximadamente **295,87 kB**, transferência estimada de **74,56 kB**.
- Permanecem os avisos preexistentes de tamanho de estilos em Desbravadores, cadastro, perfil, Home, lançamentos e Topbar.
- Há um novo aviso no stylesheet do calendário: **4,17 kB**, 172 bytes acima do limite de aviso de 4 kB, abaixo do limite de erro de 8 kB.
- Nenhum budget ou configuração global do compilador foi aumentado para aprovar a entrega.

## 9. Navegador e evidências visuais

Foi iniciado o servidor de desenvolvimento HTTPS em `https://localhost:4201` pelo Playwright, com a configuração existente `npm run start:local`. A rota `/eventos` foi realmente renderizada no Chromium instalado pelo Playwright, em `America/Sao_Paulo`.

Foram verificadas **320, 768, 1280 e 1440 px**, com capturas da página e do formulário, inspeção visual e asserções de overflow horizontal. Também há uma asserção específica de que a coluna de domingo cabe integralmente no calendário.

Problemas encontrados e corrigidos durante a validação:

- Rótulo do dia da semana deslocado por fuso: passou a usar `dow` do FullCalendar.
- Largura interna desatualizada durante a animação da Sidebar: `ResizeObserver` chama `updateSize()` pela API pública.
- Cor herdada dos eventos com contraste inadequado: conteúdo passou a herdar a cor da categoria.
- Altura do painel lateral desalinhada: calendário e painel compartilham a mesma linha do grid.
- Foco perdido ao substituir botões por formulário: foco inicial e posição do conteúdo são restaurados na troca de modo.
- Notificações SignalR do shell precisavam de simulação própria nos testes; o shell de produção não foi alterado.

Capturas locais (artefatos ignorados pelo Git, em `test-results/eventos`):

- [Desktop 1280](../test-results/eventos/eventos-calendário-e-detalhes-sem-overflow-em-1280px/eventos-1280.png)
- [Desktop 1440](../test-results/eventos/eventos-calendário-e-detalhes-sem-overflow-em-1440px/eventos-1440.png)
- [Tablet 768](../test-results/eventos/eventos-calendário-e-detalhes-sem-overflow-em-768px/eventos-768.png)
- [Mobile 320](../test-results/eventos/eventos-calendário-e-detalhes-sem-overflow-em-320px/eventos-320.png)
- [Formulário mobile](../test-results/eventos/eventos-calendário-e-detalhes-sem-overflow-em-320px/formulario-320.png)

## 10. Diferenças visuais em relação ao protótipo

A composição de duas colunas, fundo claro, superfícies brancas, bordas suaves, Inter, cabeçalho centralizado e cores dos eventos foi reproduzida e comparada visualmente. A proporção desktop é 69/31, descontado o espaço entre colunas. Tablet/mobile empilham os elementos.

Não se declara equivalência pixel a pixel:

- Sidebar e Topbar existentes permanecem azuis e com seus controles atuais; o protótipo apresenta Sidebar roxa e Topbar mais simples. A restrição de preservar o layout global foi respeitada.
- Botões maiores, Hoje, ações de gestão, indicação de página e lista da data selecionada foram incluídos por requisitos funcionais/acessibilidade.
- O mês inicial é o mês real. Novembro de 2026 tem seis semanas visíveis; a referência de setembro tem cinco.
- Sem títulos ou horários no contrato, a apresentação usa `Evento — local` e quantidade de participantes. Não foram reproduzidos textos/horários fictícios do protótipo.
- Em 320 px, nomes longos são abreviados dentro da célula; o nome completo está nos detalhes, na lista do dia selecionado e no painel lateral.

## 11. Limitações e homologação pendente

- Consulta direta, sem credenciais, a `https://localhost:8444/api/Eventos?dataInicial=2026-11-01&dataFinal=2026-11-30`: **HTTP 401**, confirmando a proteção do endpoint.
- `E2E_EMAIL` e `E2E_PASSWORD` não estavam configurados. Nenhuma criação, edição ou exclusão foi executada com uma sessão real. **A geração efetiva de lançamentos no banco e o RBAC do servidor precisam de homologação autenticada.** Os testes aprovados confirmam comportamento do frontend e contratos enviados, usando API simulada.
- Sem `membros.consultar`, o cadastro não consegue selecionar novos participantes. Em edição, os IDs atuais são preservados e a seleção fica indisponível; os detalhes ainda podem apresentar os IDs reais quando nomes não estão acessíveis.
- A operação idempotente pendente é conservada em memória enquanto a página permanece aberta. Recarregar o documento ou sair da rota descarta esse rascunho; após resposta incerta, deve-se consultar os cadastros antes de iniciar outra operação.
- A lista lateral cobre os próximos 366 dias, sem buscar indefinidamente anos futuros.
- A aceitação integral com backend real permanece aberta até a homologação acima.

## 12. Evolução futura de título, descrição e horário

Não existem esses campos nos DTOs inspecionados e eles não são enviados nem inventados. Quando o backend os disponibilizar:

1. Atualizar os tipos de leitura e escrita conforme o contrato efetivamente publicado.
2. Alterar `nomeEvento`/`mapearEventos` para usar título com fallback compatível.
3. Acrescentar campos de formulário e detalhes conforme validações reais.
4. Definir semântica de horário e fuso antes de deixar de usar eventos `allDay`; manter datas civis para eventos sem horário.
5. Atualizar testes de contrato, renderização e conversão de datas.
