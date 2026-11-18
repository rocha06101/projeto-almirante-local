# Refinamento da tela de Eventos

Implementação concluída em 17/11/2026, no frontend local. Nenhum endpoint, DTO, serviço de API ou arquivo de backend foi alterado. Nenhum commit ou push foi realizado; alterações locais preexistentes foram preservadas.

## Alterações

- Calendário exibe apenas títulos, com reticências e cores originais. Participantes continuam disponíveis nos dados, detalhes e próximos eventos. No mobile, o título pode ocupar até quatro linhas.
- Seleção compartilhada por ID: primeiro clique destaca; segundo clique no mesmo evento abre os detalhes. Selecionar outro evento não abre o modal. A seleção não dispara consultas.
- A lista lateral encontra a página do evento e ajusta somente sua rolagem interna. Eventos fora do intervalo de próximos eventos continuam acessíveis no calendário, sem alteração da regra de próximos eventos.
- Seleção de evento separada da seleção de dia. Dias vazios, navegação para outro intervalo e respostas que removem o evento limpam a seleção conforme o contexto.
- Seção inferior removida, incluindo estados e estilos sem uso. Calendário e painel lateral usam a altura disponível em desktop. Dias com vários eventos continuam acessíveis pelo popover nativo do FullCalendar.
- Backdrop, Escape, botão de fechar e cancelamento do formulário usam a mesma verificação de alterações. Confirmação permite continuar editando ou descartar. Carregamento da edição não marca alteração; busca de participantes também não.
- Formulário permanece montado durante a confirmação, preservando campos e seleção de participantes. Foco é restaurado; operações em andamento continuam protegidas. A operação de cadastro pendente mantém a chave de idempotência ao reabrir.

## Arquivos modificados nesta tarefa

Caminhos relativos à raiz do projeto:

- `src/app/pages/eventos/eventos.ts`
- `src/app/pages/eventos/eventos.html`
- `src/app/pages/eventos/eventos.scss`
- `src/app/pages/eventos/eventos.spec.ts`
- `src/app/pages/eventos/calendario/eventos-calendario.ts`
- `src/app/pages/eventos/calendario/eventos-calendario.scss`
- `src/app/pages/eventos/proximos/proximos-eventos.ts`
- `src/app/pages/eventos/proximos/proximos-eventos.scss`
- `src/app/pages/eventos/detalhes/evento-detalhes.ts`
- `src/app/pages/eventos/detalhes/evento-detalhes.html`
- `src/app/pages/eventos/detalhes/evento-detalhes.spec.ts`
- `src/app/pages/eventos/formulario/evento-formulario.ts`
- `src/app/pages/eventos/formulario/evento-formulario.spec.ts`
- `e2e/eventos.spec.ts`
- `docs/RELATORIO-REFINAMENTO-EVENTOS.md` (este relatório, novo)

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Aprovado, com avisos de orçamento de bundle e CSS |
| `npx ng test --watch=false --include='src/app/pages/eventos/**/*.spec.ts'` | 47 testes aprovados em 3 arquivos |
| `npx playwright test --config=playwright.eventos.config.ts` | 23 testes aprovados no Chromium |
| Inspeção visual | 320, 768, 1280 e 1440 px; desktop em 900 px de altura |
| Desktop 1440 × 900 | Calendário e painel lateral integralmente no viewport, sem rolagem vertical da página |
| Overflow horizontal | Verificado nas quatro larguras |
| `git diff --check` | Sem erros |

Os testes abrangem títulos, participantes, IDs com títulos iguais, seleção cruzada, paginação, eventos passados, dias vazios, navegação, consulta de dias com vários eventos, descarte na criação/edição, foco, Escape com seletor nativo de data aberto, criação/edição/exclusão, conflitos HTTP 409, erros, RBAC, bloqueios financeiros e idempotência após resposta incerta.

Capturas geradas em `test-results/eventos/`, pasta já ignorada pelo Git. Incluem `eventos-320.png`, `eventos-768.png`, `eventos-1280.png`, `eventos-1440.png` nas subpastas dos testes e `selecao-1440x900.png` no cenário de 21/11/2026.

## Limitações da validação

Os E2E usam respostas HTTP simuladas e Chromium; não validam um backend real nem outros navegadores. O build apresenta avisos de orçamento de tamanho do bundle inicial e de estilos, incluindo o calendário, mas não apresenta erros. A captura citada no texto do pedido não estava disponível entre os anexos desta tarefa; a referência visual foi a implementação local.
