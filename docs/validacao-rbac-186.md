# Validação da issue #186

Revisão local em 17/11/2026. Escopo conforme a [issue #186](https://github.com/LucasDevolps/Desbravadores.Backend/issues/186).

## Estado Git e arquivos da revisão

- Frontend `rocha06101/projeto-almirante-local`, branch `feature/issue-186-rbac-frontend`, HEAD `867fb61c`, igual à referência remota local. A árvore começou limpa. Esta revisão deixa alterações locais em `src/app/core/services/permissoes{,.spec}.ts`, `src/app/core/guards/permissao-guard{,.spec}.ts`, `src/app/pages/admin/cargos/cargos{.ts,.html,.spec.ts}` e neste relatório.
- Backend `LucasDevolps/Desbravadores.Backend`, worktree `../backend-issue-186`, branch `fix/issue-186-cargos-consulta`, HEAD `27f4af4`, igual à referência remota local de `develop`. A correção de leitura já estava em `src/Almirante.Api/Controllers/CargosController.cs` e `src/Almirante.Api/Security/PermissoesService.cs`, com teste em `src/Almirante.Api.Tests/RbacDinamicoTests.cs`. Esta revisão ajusta o atributo em `PermissoesService.cs` para expor as chaves e atualiza `src/Almirante.Api.Tests/PermissoesUnitTests.cs`.
- Todos os arquivos com alterações locais nos dois worktrees pertencem à #186. No histórico do frontend, o diff `git diff --name-status main...HEAD` inclui a implementação RBAC e correções anteriores. O ajuste visual em `toggle-switch.scss` e a mudança isolada da expectativa de cor do RG em `user-register.spec.ts` são anteriores a esta revisão e alheios à autorização.
- Alterações mantidas locais, sem commit, push, merge ou encerramento da issue. As referências remotas citadas são as já disponíveis no Git local.

## Comportamento revisado

- `PermissoesService.atualizar()` distingue permissão validada com lista vazia, falha com o erro original e consulta cancelada por fim da sessão. Uma falha invalida as permissões em memória. O guard exige validação antes de consultar as chaves, redireciona para o perfil com aviso quando a API falha e mantém o redirecionamento habitual ao perfil quando a lista válida não contém as chaves exigidas. Sessão encerrada redireciona ao login.
- O editor de concessões e regras por alvo bloqueia seleção e escrita quando a leitura falha. Rede e erro genérico oferecem nova tentativa, 401 oferece login, 403 orienta sobre o acesso e permite fechar, 404 oferece atualizar a lista. Conflito de versão 409 ao salvar bloqueia novo envio até recarregar. Duplicidade de role e restrições de desativação continuam seguindo o ProblemDetails da API.
- O GET `/api/Cargos` aceita `cargos.consultar` ou `autorizacao.consultar`. A API avalia as alternativas em um único requisito. Criar, editar, desativar e reativar continuam exigindo `autorizacao.cargos.gerenciar`. Alterar concessões exige `autorizacao.concessoes.gerenciar` e alterar regras exige `autorizacao.regras-alvo.gerenciar`. A rota administrativa do frontend exige `autorizacao.consultar`.
- A integração RBAC testa cada capacidade de leitura isoladamente, 403 sem as duas, 401 anônimo e 403 para todas as escritas com apenas capacidade de consulta. O teste estrutural valida as chaves do requisito alternativo no catálogo e a ausência de requisitos acumulados.

## Comandos e resultados

Os comandos Angular e Playwright foram executados com Node 22 via `npx --yes --package=node@22 -- node`. O backend foi compilado e testado no contêiner `mcr.microsoft.com/dotnet/sdk:10.0` (SDK 10.0.404), pois o host tem só o SDK 8. O navegador foi Chromium.

| Validação | Resultado |
| --- | --- |
| `ng build` | Aprovado, com avisos de orçamento do bundle inicial e de estilos. |
| `ng test --watch=false` | 274 testes aprovados em 42 arquivos. |
| `playwright test --project=pwa` | 3 testes aprovados. |
| `dotnet build src/Almirante.slnx` | Aprovado. O restore reportou avisos NU1903 para dependências Aspire do AppHost. |
| `dotnet test src/Almirante.Api.Tests --no-build --filter 'Category!=RequiresSqlServer'` | 1.509 aprovados e 1 falha em 1.510. O teste de corrida entre refresh e logout esperava 401 e recebeu 200. |
| Filtro `RbacDinamicoTests\|PermissoesUnitTests\|RefreshQuePerdeACorridaParaUmLogout` | 22 aprovados. A falha de corrida da suíte ampla não se repetiu nesta rodada. |
| `dotnet test src/Almirante.Api.Tests --no-build --filter Category=RequiresSqlServer` | Rodada ampla interrompida após perda da instância temporária, com falhas de handshake e conexão e sem total final. |
| `dotnet vstest …/Almirante.Api.Tests.dll --TestCaseFilter:FullyQualifiedName~AutorizacaoSqlServerTests` | 4 aprovados em SQL Server 2022, em nova instância isolada com limite de memória e CPU. |
| `playwright test --project=layout --workers=1 e2e/shell.spec.ts` | 9 aprovados, incluindo a interface com `autorizacao.consultar` isolada e a perda de acesso. |
| `playwright test --project=real-backend --workers=1` | 2 aprovados, incluindo AUXSEC, e 3 falhas nos testes de login e tesouraria por seletor de senha ambíguo. |

A primeira rodada sem SQL identificou que `PermissoesUnitTests` classificava a política alternativa do GET como fora do catálogo. O teste estrutural foi corrigido e passou no filtro dedicado. A matriz ampla de navegador foi interrompida após a troca do proxy local e falhas de conexão e carregamento, de modo que a rodada independente de `shell.spec.ts` é a evidência para navegação.

O E2E AUXSEC passou em 13,2 segundos contra a API compilada deste worktree, com migrations e SQL Server 2022 em contêiner isolado. O frontend usou HTTPS em `localhost:4201` com proxy para a API HTTPS de teste. O cenário confirmou criação e alterações de cargo, concessões, regras, conflito de versão, designação de almoxarifado, acesso do auxiliar e 403 na próxima consulta depois da revogação. A limpeza prevista pelo teste também concluiu.

Os três testes E2E de login e tesouraria pararam em `getByLabel('Senha')`, que também encontra o controle de visibilidade da senha. As chamadas ambíguas já estavam em `main`. A automação desses outros fluxos fica fora desta correção.


## Pendências para encerramento

- Revisar e publicar as mudanças dos dois repositórios com autorização, instalar a versão corrigida na homologação compartilhada e registrar o checklist e estes resultados na #186.
- Completar a suíte SQL ampla em uma instância estável. A execução focada cobre autorização e migrations. A execução no navegador cobre o fluxo AUXSEC na API corrigida em ambiente local isolado.
- Acompanhar a falha intermitente no teste de corrida entre refresh e logout e corrigir os seletores dos E2E de login e tesouraria se essas suítes forem exigidas para o aceite.
