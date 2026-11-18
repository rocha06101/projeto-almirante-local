# Issue #213 — refinamentos e homologação

Trabalho realizado sobre `881399b2`, na branch `feature/eventos-issue-213`.

| Arquivos | Alteração |
|---|---|
| `evento-detalhes.ts`, `evento-detalhes.html`, `evento-detalhes.spec.ts` | A reconciliação conserva a operação incerta e a trava até receber o detalhe pelo GET. As listagens só recebem o aviso após a consulta bem-sucedida. Um 404 após exclusão incerta informa que o cadastro está indisponível e mantém o resultado indeterminado. |
| `evento-formulario.ts`, `evento-formulario.html`, `evento-formulario.scss`, `evento-formulario.spec.ts` | Formulário comunica timeout e conflito aos detalhes. Seleção coletiva conta apenas as mudanças impedidas. Seleção individual mostra o motivo associado ao checkbox. O estado misto acompanha os IDs e permite desmarcar um grupo que já atingiu o limite de inclusões permitidas. |
| `e2e/eventos.spec.ts` | Verifica mensagens acessíveis, interação pelo teclado no celular e atualização de calendário e próximos eventos após GET bem-sucedido. |
| `e2e/eventos.homologacao.real.spec.ts`, `playwright.eventos.homologacao.config.ts` | Valida os dez cenários com Chromium, Angular, .NET e SQL Server. O cenário de comunicação interrompe apenas a entrega da resposta ao navegador após receber o HTTP real. |

O GET de detalhe só retorna eventos ativos. Seu 404 prova indisponibilidade naquele momento, mas o contrato não identifica qual requisição provocou a exclusão. Por isso a tela mantém a consulta disponível e evita sucesso financeiro ou recarga prematura a partir desse 404. Um PUT ou POST confirmado e um DELETE 204 continuam atualizando as listagens. A versão do recurso é usada como fornecida pelo servidor.

Para seleção antes da data, a tela bloqueia remoções cujo pagamento exige que a tesouraria conclua o estorno. Quando os dados de devolução disponíveis não determinam se há saldo retido, o servidor resolve a tentativa. Nenhum cálculo usa o valor nominal da cobrança como pagamento efetivo.

## Configuração da homologação

- Instância `Development` separada, com rede Docker dedicada, SQL Server Developer e banco inicializado pelo bootstrap do backend. API publicada em loopback na porta 18444; Angular em `https://localhost:4213` com arquivo de proxy temporário para `/api` e `/hubs`.
- Imagem local `almirante-api:latest` identificada por `sha256:6e34f9043b82443289e46f56927c5150b63dd5cfbf08a7d3508806a2c27667de`. Swagger v1 e health responderam 200. As rotas de evento, pagamento, estorno e devolução foram conferidas nessa instância.
- Administrador semeado para a homologação e dois membros fictícios por rodada. O navegador fez login normal com HTTPS, cookie e CSRF. O cenário adicional de RBAC verifica 401 sem credenciais e 403 para a conta de membro em edição, exclusão, estorno e baixa.
- O teste procura o Swagger da instância dedicada antes da primeira mutação e exige `ISSUE213_HOMOLOGACAO_ISOLADA=1` e `ISSUE213_SENHA_ADMIN`. Reexecute somente com banco descartável e proxy apontado para essa API. Use `npx playwright test --config=playwright.eventos.homologacao.config.ts` com a senha de teste injetada no processo.

## Homologação com a API real

O Playwright aprovou os dez cenários da rodada `0ecdcf68` em 29,2 s. Para B–J o roteiro compara as operações da tela e da API com consultas subsequentes. As evidências de persistência abaixo incluem uma consulta SQL somente leitura a `eventos`, `evento_membros`, `Lancamentos`, `historico_eventos` e `auditoria_http` no banco descartável.

| Cenário | Status | Evidência real | Observações |
|---|---|---|---|
| A. Pagamento integral | Aprovado | Evento 201, pagamento e detalhe 200. SQL registrou cobrança de 100,00 com 100,00 pagos. | Segunda cobrança permaneceu pendente e o detalhe exibiu o pagamento. |
| B. Pagamento parcial | Aprovado | Pagamento e PUT 200. SQL registrou cobrança original de 100,00 com 60,00 pagos, custo de 40,00 e devolução pendente de 20,00. | A devolução exibida na tela veio do mesmo ID confirmado pelo GET. |
| C. Redução de custos | Aprovado | Dois PUT 200 com motivo e versão. SQL registrou custo final de 65,00 e duas devoluções de 20,00 e 15,00. | O pagamento original de 100,00 permaneceu ativo e com valor intacto. |
| D. Zeragem | Aprovado | PUT 200, GET da cobrança desativada 404. SQL registrou custo zero, cobrança em aberto inativa e devolução pendente de 100,00. | Os dois participantes permaneceram ativos. O pagamento original continuou ativo. |
| E. Estorno individual | Aprovado | POST 200 com o membro e a versão corretos. Nova tentativa com a versão atual retornou 409 e o GET trouxe uma devolução de 75,00. | Custo de 100,00 e participante não estornado permaneceram intactos. |
| F. Baixa de devolução | Aprovado | Baixa de 76,00 sobre 75,00 retornou 400. Baixa de 75,00 retornou 200. SQL confirmou saída com 75,00 pagos em 18/11/2026. | O detalhe exibiu a devolução concluída após nova consulta. |
| G. Remoção após estorno | Aprovado | PUT 409 antes do estorno e também durante a pendência. Após a baixa, PUT 200 pela tela e GET com um participante ativo. | O participante original apareceu como removido no detalhe e a cobrança paga continuou ativa. |
| H. Exclusão | Aprovado | DELETE 409 com retenção e também com devolução pendente. Após a baixa, DELETE 204, GET 404 e ausência na listagem de ativos. | SQL mostrou evento inativo, histórico de exclusão com motivo e ambos os registros liquidados ativos no caixa. |
| I. Concorrência | Aprovado | PUT com versão atual retornou 200. PUT antigo pela tela retornou 409. A consulta recuperou a versão atual. | SQL persistiu apenas o título concorrente. A lista lateral recebeu o título da consulta. |
| J. Falha de comunicação | Aprovado | O Playwright encaminhou o POST real, recebeu 200 do .NET e interrompeu a resposta ao Chromium. O GET posterior retornou 200. | SQL registrou um único POST 200 na auditoria, uma devolução pendente de 65,00 e pagamento original de 65,00 preservado. A tela bloqueou o reenvio antes do GET e não exibiu toast de sucesso. |

O teste confirmou as permissões efetivas do administrador. Sem autenticação, a lista administrativa retornou 401. A conta de desbravador consultou suas devoluções em `/Me/Eventos` e recebeu 403 em todas as quatro operações financeiras administrativas testadas.

Trecho da consulta usada para cruzar cobrança, devolução e evento:

```sql
SELECT e.Titulo, e.Ativo, e.ValorPorMembro,
       CASE WHEN l.LancamentoOrigemId IS NULL THEN 0 ELSE 1 END AS Devolucao,
       l.Ativo AS LancamentoAtivo, l.Status, l.Valor, l.ValorPago, l.DataPagamento
FROM dbo.eventos AS e
JOIN dbo.Lancamentos AS l ON l.EventoId = e.Id
WHERE e.Titulo LIKE 'HOMOLOG-213 0ecdcf68 %';
```

## Validação automatizada

| Comando | Resultado |
|---|---|
| `npm test -- --watch=false --include 'src/app/pages/eventos/**/*.spec.ts'` | 98 aprovados em 4 arquivos. |
| `NG_BUILD_MAX_WORKERS=2 VITEST_MAX_WORKERS=3 npm test -- --watch=false` | 373 aprovados em 46 arquivos na rodada final, sem falhas. |
| `npx playwright test --config=playwright.eventos.config.ts` | 29 aprovados, sem falhas. Inclui interação por teclado, estado misto e atualização das duas listas após reconciliação. |
| `npx playwright test --config=playwright.eventos.homologacao.config.ts` | 1 teste composto aprovado, com dez cenários reais e verificação de RBAC. |
| `E2E_BROWSER_CHANNEL=chromium npx playwright test --project=pwa --workers=2` | 3 aprovados, sem falhas. |
| `npm run build` | Build de produção aprovado com avisos de orçamento de bundle e SCSS. |
| `npx tsc --noEmit --strict --target es2022 --module NodeNext --moduleResolution nodenext --skipLibCheck --typeRoots <pasta-temporaria>/node_modules/@types e2e/eventos.homologacao.real.spec.ts playwright.eventos.homologacao.config.ts` | Aprovado com tipos Node em pasta temporária. |
| `git diff --check` | Aprovado. |

A primeira suíte unitária completa em paralelo com o navegador teve nove falhas de timeout ou de temporizadores. Uma segunda rodada completa teve cinco falhas no mock de SignalR com `Cannot resolve '/hubs/notificacoes'`. A rodada final sem concorrência com as suítes de navegador passou os 373 testes.

A suíte ampla `E2E_BROWSER_CHANNEL=chromium npx playwright test --project=layout --workers=3` foi interrompida com 2 aprovações, 12 falhas, 1 teste interrompido e 151 sem execução. Os testes que simulam login em `e2e/support.ts` deixaram a negociação do SignalR chegar ao backend, que devolveu 401 para o token fictício. Houve também timeouts enquanto a máquina esgotava memória e swap. O E2E de eventos intercepta seu próprio hub e passou completamente. Em cópia de `881399b2`, o teste da página inicial em 320 px reproduziu o mesmo 401 de SignalR.

A suíte real geral foi repetida com um trabalhador no ambiente isolado (`npx playwright test --config=<configuracao-temporaria>`, URLs ajustadas para 4213). Resultado final de 1 aprovado e 4 falhas. Os dois testes de login e o teste de lançamentos pararam porque o seletor genérico `getByLabel('Senha')` corresponde ao campo e ao botão de visibilidade. O teste RBAC chegou a receber 200 em `/Eventos`, mas o seletor de título encontrou tanto “Eventos” como “Próximos eventos”. Os seletores e as telas que deram origem às ambiguidades também estão presentes no commit base. A primeira execução geral, concorrente com layout, teve cinco falhas incluindo timeouts.

Na primeira rodada da homologação, pagamento integral passou e o roteiro parou ao procurar um evento recém-criado sem recarregar a lista. Na segunda, a navegação por paginação no roteiro excedeu o tempo durante F–H. O roteiro final espera o calendário, seleciona o cadastro pelo ID e abre o detalhe já carregado. A rodada final passou integralmente com nova massa de teste.

## Pendências e parecer

A homologação financeira foi concluída no banco descartável. O caso de DELETE bem-sucedido com resposta perdida seguido de GET 404 foi verificado por teste unitário. O cenário de interrupção da resposta com persistência real foi executado para o POST de estorno.

A suíte ampla de layout ainda requer uma rodada completa em ambiente estável e com os mocks de notificação apropriados. Os seletores dos testes antigos de autenticação, lançamentos e RBAC também precisam de ajuste antes de uma rodada geral verde.

**NÃO APTA PARA MERGE** pelo critério de validação integral solicitado. Os refinamentos de eventos passaram no build, nas suítes de eventos e na homologação financeira real.
