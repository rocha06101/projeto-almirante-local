# Issue #213 — redução, zeragem e estorno de eventos

Inspeção e implementação em 18/11/2026, na branch `feature/eventos-issue-213`. O working tree estava limpo antes das alterações. Nenhum arquivo do backend foi modificado.

## Fonte dos contratos

As issues [#213](https://github.com/LucasDevolps/Desbravadores.Backend/issues/213) e [#209](https://github.com/LucasDevolps/Desbravadores.Backend/issues/209) estavam abertas na consulta, mas **a implementação da #209 já existe na `develop` remota**. Referência inspecionada: `1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8`. A cópia local do backend estava em `main`, commit `6c52174`, e não representa esse contrato.

O Swagger do servidor local (`https://localhost:8444/swagger/v1/swagger.json`, HTTP 200) também confirmou `Estorno`, `Devolucao`, `EventoDto.devolucoes` e o corpo `{ motivo, versao }`. `/openapi/v1.json` respondeu 404; não foi usado como contrato.

Referências no backend, sob `src/Almirante.Api/`:

- [Controllers/EventosController.cs](https://github.com/LucasDevolps/Desbravadores.Backend/blob/1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8/src/Almirante.Api/Controllers/EventosController.cs): rotas, permissões e respostas.
- [Services/EventosService.cs](https://github.com/LucasDevolps/Desbravadores.Backend/blob/1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8/src/Almirante.Api/Services/EventosService.cs): `UpdateAsync`, `EstornarParticipanteAsync`, `DeleteAsync`, `ExigirRemocaoDePagantesPermitida`, `ListarDoParticipanteAsync` e separação entre cobrança e devolução.
- [Dtos/EventoDtos.cs](https://github.com/LucasDevolps/Desbravadores.Backend/blob/1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8/src/Almirante.Api/Dtos/EventoDtos.cs), `Validation/Eventos/EventoValidators.cs` e `Validation/Usuarios/TextoVarchar.cs`: DTOs, versão e motivos em Windows-1252, sem controles.
- [Services/DevolucaoRegras.cs](https://github.com/LucasDevolps/Desbravadores.Backend/blob/1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8/src/Almirante.Api/Services/DevolucaoRegras.cs): cálculo **exclusivamente no servidor** e conclusão do estorno. A regra de retenção usa valores esperados das devoluções ativas; uma baixa menor, com justificativa, não deve ser reinterpretada pelo cliente.
- `Controllers/LancamentosController.cs`, `Dtos/LancamentoDtos.cs`, `Security/CatalogoPermissoes.cs`, `Infrastructure/EventosOpenApi.cs`, `Controllers/MeController.cs`, `Dtos/AutoatendimentoDtos.cs`, `Services/DataCivil.cs`.
- Testes inspecionados: [EventosDevolucoesSqlServerTests.cs](https://github.com/LucasDevolps/Desbravadores.Backend/blob/1e6e88c52ad8b2c58fe3e8ad156e87cb09b1dfa8/src/Almirante.Api.Tests/EventosDevolucoesSqlServerTests.cs) e `DevolucoesApiTests.cs`. Foram lidos; não foram executados nesta tarefa de frontend.

## Matriz REST real

Prefixo `/api`. Todas as operações protegidas também podem retornar 401/403; a UI mantém as permissões já usadas e não altera guardas globais.

| Operação | Método e rota | Corpo/query | Resposta | Permissão/política | 400 / 404 / 409 |
| --- | --- | --- | --- | --- | --- |
| Lista de eventos | GET `/Eventos` | `dataInicial`, `dataFinal` civis; até 366 dias | `EventosResponse` | `eventos.consultar` | 400: período inválido |
| Detalhes | GET `/Eventos/{id}` | — | `EventoDto` | `eventos.consultar` | 404: inexistente/inativo |
| Cadastro preservado | POST `/Eventos` | Conteúdo do evento, referência opcional; `Idempotency-Key` UUID | 201 ou replay 200, `EventoDto` | `eventos.criar` | 400: dados; 404: referência/membro; 409: idempotência/grupo |
| Edição/redução/zeragem/remoção | PUT `/Eventos/{id}` | Conteúdo, `versao`, `motivo` quando exigido | 200 `EventoDto` | `eventos.editar` | 400: validação/motivo; 404: evento; 409: versão, grupo ou regra financeira |
| Estorno individual | POST `/Eventos/{id}/Participantes/{membroId}/Estorno` | `{ motivo, versao }` | 200 `EventoDto` atualizado | `eventos.editar` | 400: motivo/versão; 404: evento ou membro sem vínculo/histórico; 409: nada retido, pagamento histórico sem liquidação, versão ou trava |
| Exclusão | DELETE `/Eventos/{id}` | `{ motivo, versao }` | 204 | `eventos.excluir` | 400: dados; 404: inexistente/inativo; 409: retenção, devolução em aberto ou versão |
| Consulta financeira | GET `/Lancamentos` e `/{id}` | Paginação/filtros ou ID | Lista ou `LancamentoDto` | `financeiro.lancamentos.consultar` | 400: filtros; 404: item |
| Baixa/correção de devolução (sem nova UI nesta entrega) | POST/PUT `/Lancamentos/{id}/Devolucao` | `dataPagamento`, `valorPago`, `justificativa` | 200 `LancamentoDto` | `financeiro.pagamentos.registrar` | 400: valores/data/justificativa; 404: lançamento; 409: tipo incorreto, duplicidade, estado ou concorrência |
| Consulta do próprio membro | GET `/Me/Eventos`, `/Me/Eventos/{id}` | — | `items`/`EventoParticipanteDto`, incluindo `minhasDevolucoes` | `Autoatendimento` | 404: detalhe sem participação ativa |

Não existe idempotência declarada para estorno. Nenhum retry foi adicionado. A baixa de devolução tem endpoint próprio; não foi implementada usando `/Pagamento`.

## Comportamento implementado

- `Pago` restringe a edição; `Atrasado` continua sendo cobrança em aberto.
- Com pagamento, os componentes podem mudar se o **total por membro diminuir**. O backend entregue rejeita aumento **e recomposição mantendo o mesmo total**, embora a descrição inicial da issue mencione `<=`. Edição não financeira continua possível.
- Transporte gratuito, alimentação individual e seguro desativado são normalizados para zero. Valores efetivos devem ser finitos, não negativos, com duas casas e precisão segura em centavos.
- Data e inclusão de participantes ficam bloqueadas com pagamento; data/local compartilhados continuam protegidos.
- Remoção é avaliada por membro: quem não pagou não fica bloqueado por outro pagante. Antes da data, pagamento sem devolução ou com devolução pendente bloqueia; a partir da data civil, a remoção pode ser submetida sem gerar devolução. O servidor mantém a última palavra sobre a data no fuso configurado do clube.
- Motivo trimado, de 1 a 255 caracteres em CP1252, na remoção, cancelamento de cobranças e, conservadoramente, em toda redução com pagamento. Sem emojis, tabulações ou quebras de linha.
- Revisão mostra componentes antes/depois, valores por participante, diferença **estimada**, quantidade de participantes e motivo. Não calcula nem promete valor de estorno. Mudança no modelo, motivo, evento ou versão após revisão exige nova revisão.
- Estorno avulso usa os IDs e a versão capturados do cadastro selecionado, inclusive para participante removido com pagamento no histórico. Revalida permissão e alvo antes do POST, exige confirmação e protege clique duplo.
- Devoluções aparecem separadamente, com status, valor esperado, valor devolvido, data, motivo e justificativa quando informados pela API. Não são somadas nem criadas localmente.
- Exclusão bloqueada diante de pagamento sem devolução ou devolução em aberto. Se todas as devoluções exibidas foram baixadas, permite **solicitar validação pelo servidor**, sem afirmar inexistência de saldo retido.
- Após edição/estorno, GET atualiza detalhes/versão, e o evento de atualização recarrega calendário e próximos. Após DELETE 204, fecha o detalhe e recarrega as listas (um GET do evento excluído responderia 404). Reconciliação após resposta incerta também atualiza listagens.
- Rede, timeout e 5xx não geram sucesso nem reenvio; edição/estorno/exclusão exigem consulta antes de nova tentativa. 409 mantém a explicação real e exige recarga; não é renomeado automaticamente como conflito de versão.
- Mantidos modal, trap de foco, Escape, descarte, retorno de foco, labels, feedback e estilo existentes. Tesouraria identifica devoluções como Saída e bloqueia edição/exclusão também nos métodos, além dos botões.

## Limites intencionais e integração

`EventoLancamentoDto` expõe somente `id`, `membroId`, `valor` e `status`: **não expõe `ValorPago`**. O valor de uma cobrança paga não comprova pagamento integral. A interface não calcula saldo retido, total de devoluções a gerar ou quitação integral com esses dados. A função de apresentação `liquidacaoConfirmavel` distingue bloqueio conhecido, ausência de pagamentos e situação que exige validação do servidor. Para devoluções baixadas, remoção/exclusão ainda podem retornar 409 por retenção ou pagamento histórico. Isso é explicitado na confirmação.

Os dados de liquidação estão expostos em `LancamentoDto` e são usados somente quando disponíveis na consulta de tesouraria. Não foi adicionado acesso financeiro a quem só possui permissão de eventos.

A #209 não bloqueia esta integração: código remoto e Swagger local já a contêm. APIs antigas sem `devolucoes` não exibem o estorno individual. Não foi criada rota fictícia, fallback financeiro ou indicador de permissão novo.

A UI de baixa pela tesouraria não faz parte da #213 e não foi adicionada. Este frontend ainda não tem consumidor de `/Me/Eventos`; o contrato foi conferido, sem criar uma tela de autoatendimento fora do escopo. O serviço genérico de lançamentos não precisou mudar.

## Arquivos alterados

| Arquivos | Finalidade |
| --- | --- |
| `src/app/core/models/evento.model.ts`, `core/services/eventos.ts` | DTO real de devolução e POST individual com motivo/versão |
| `src/app/pages/eventos/eventos.utils.ts` | Regras específicas, motivo e resposta incerta |
| `pages/eventos/formulario/evento-formulario.{ts,html,scss}` | Redução/zeragem, seleção individual, revisão e proteção contra dados alterados |
| `pages/eventos/detalhes/evento-detalhes.{ts,html,scss}` | Estorno, histórico/devoluções, exclusão e reconciliação |
| `features/lancamentos/models/lancamento.model.ts` | Campos reais de liquidação e vínculo de devolução |
| `shared/components/financial-entries-component/financial-entries-component.{ts,html}` | Exibição fiel de devolução e bloqueio de mutações avulsas |
| Specs de eventos, formulário, detalhes, financeiro; `eventos-financeiro.spec.ts`; `e2e/eventos.spec.ts` | Contrato HTTP, erros, concorrência, regras, acessibilidade e regressão |

`eventos.ts/html`, rotas, permissões, autenticação, CSRF, proxies e dependências foram inspecionados e preservados. A atualização existente das duas listagens foi reutilizada.

## Validação

Resultados finais executados:

- `npm run build`: passou. Avisos de orçamento: bundle inicial de 930,92 kB para limite de aviso de 500 kB e sete SCSS existentes acima de 4 kB; nenhum erro de compilação.
- `npm test -- --watch=false`: **46 arquivos, 368 testes passaram**.
- `npx playwright test --config=playwright.eventos.config.ts`: **27 testes passaram**, incluindo viewports de 320/390/768/1280/1440 px, teclado, foco, estorno, zeragem e regressões de criação/edição/exclusão.
- `git diff --check`: sem problemas de whitespace.

Os testes E2E usam respostas interceptadas de contratos confirmados; não comprovam execução financeira no banco real. A consulta ao Swagger foi feita contra o backend em execução, sem mutações financeiras reais.

Na primeira rodada E2E: 26 passaram e 1 falhou por uma asserção nova que esperava preço no cartão lateral. O cartão existente não apresenta preço; a asserção foi corrigida para verificar recarga das duas listagens, sem alterar o layout.

## Roteiro manual com backend atualizado e dados de teste

1. Criar evento com dois participantes; registrar pagamento integral e parcial pelo fluxo apropriado do backend. Reduzir o custo e depois zerar, conferindo motivo, devoluções pendentes e preservação dos pagamentos.
2. Fazer reduções sucessivas e conferir exclusivamente as devoluções retornadas pelo servidor; tentar aumentar e recompor com o mesmo total.
3. Solicitar estorno de um participante em um cadastro com grupos relacionados. Conferir IDs, ausência de alterações nos outros grupos e 409 ao repetir sem retenção.
4. Antes da data, tentar remover pagante sem estorno, com devolução pendente e após baixa. Remover outro participante não pago. Testar novamente no dia do evento.
5. Processar a devolução pelo endpoint dedicado com permissão de tesouraria. Conferir valor esperado versus efetivamente devolvido, data e justificativa; testar exclusão com retenção/pendência e após quitação aceita pelo servidor.
6. Abrir duas sessões para provocar 409 de versão; interromper a resposta de edição/estorno/exclusão e reconciliar antes de repetir. Testar usuário somente leitor.
7. Conferir teclado, Escape, descarte, retorno do foco e telas pequenas. O navegador usa a data civil local para a indicação antecipada de remoção; o backend decide no fuso configurado do clube, inclusive na virada do dia.

Nenhum PUT/POST de pagamento original foi adicionado. Payloads de edição não contêm lançamentos/devoluções; o POST de estorno envia apenas motivo/versão. Os testes verificam isso. Não há geração de lançamento, cálculo de retenção ou baixa fictícia no código de produção.
