# Validação da issue #186

A validação usou o Swagger do backend local em `https://localhost:8444/swagger/v1/swagger.json` e o frontend Angular em `https://localhost:4201`. O cenário Playwright cria um cargo com prefixo `AUXSEC_` e um usuário fictício para cada execução. A limpeza revoga a designação temporária, inativa o usuário e o cargo de teste e remove as regras temporárias do administrador pelo fluxo normal da API. O histórico de auditoria permanece no backend.

| Verificação | Cobertura |
| --- | --- |
| Permissões efetivas | Consulta do cargo e da revisão de autorização do próprio usuário, campos da resposta e permissões de almoxarifado por designação. |
| Catálogo | Consulta pelo administrador, campos de reserva e situação e resposta 403 para AUXSEC. |
| Gestão de cargos | Criação com normalização da role, duplicidade no campo, edição, desativação, reativação, bloqueio do perfil protegido e orientação para cargo com usuários ativos. |
| Motivo e senha | Campos obrigatórios na tela, rejeição das requisições sem motivo ou senha e limpeza do campo de senha após envio. |
| Concorrência | A tela oferece recarga após edição concorrente. Concessões e regras rejeitam versões obsoletas e rejeitam conjuntos inválidos sem aplicar parte das mudanças. |
| AUXSEC | Acesso às consultas de membros e eventos, acesso negado ao cadastro completo e à administração, e menu atualizado após 403 na próxima consulta de eventos, na mesma sessão. |
| Erros da API | 400 de validação, 401 sem autenticação, 403 de acesso, 404 para cargo inexistente e 409 de duplicidade, vínculo ativo ou versão obsoleta. |

Para repetir contra um backend de teste local, configure `E2E_EMAIL` e `E2E_PASSWORD` com o administrador de teste antes de executar o comando.

```sh
npm run test:e2e -- --project=real-backend e2e/rbac.real.spec.ts
```

O build de produção e o cenário Playwright da issue passaram. A suíte unitária teve 253 testes aprovados e uma falha na cor esperada do campo RG com CIN ativo. A suíte de navegação teve sete testes aprovados e uma falha no tamanho da área de toque do controle CIN no cadastro.

A homologação compartilhada e o registro no GitHub ficam pendentes.

## Revisão de 17/11/2026

Branch frontend `feature/issue-186-rbac-frontend`, inicialmente limpa. A busca no workspace não encontrou AGENTS.md.

A inspeção do pai de `a5f284e` confirmou a expectativa antiga `#f1f2f5` no teste de RG, enquanto o template já usava `#D9D9D9`. O controle CIN já tinha altura de 1,5 rem. As duas causas antecedem o commit revisado. Essa conclusão vem da inspeção do código do pai, sem execução da suíte naquele checkout.

O teste de RG agora exige exatamente a cor do requisito. O controle CIN ganhou uma área clicável de 2,75 rem, mantendo a trilha visual de 1,5 rem.

Comandos executados com Node 22 via `npx --yes --package=node@22 -- node`:

- `node_modules/@angular/cli/bin/ng.js build` passou com avisos de orçamento de bundles e estilos.
- `node_modules/@angular/cli/bin/ng.js test --watch=false` passou na rodada de 255 testes. Uma rodada adicional cobre os novos casos de guard e ausência de escrita.
- `node_modules/@playwright/test/cli.js test --project=layout e2e/shell.spec.ts`, com `E2E_BROWSER_CHANNEL=chromium`, passou nos oito testes.
- `dotnet test ../backend-issue-186/src/Almirante.Api.Tests --filter FullyQualifiedName~ConsultaCargos_AceitaCadaCapacidadeSemLiberarEscrita` foi bloqueado por NETSDK1045. O projeto exige .NET 10 e o SDK instalado é 8.0.427.

A política de GET /Cargos na develop local exige cargos.consultar. Foi preparada a alternativa cargos.consultar OU autorizacao.consultar em `../backend-issue-186`, branch `fix/issue-186-cargos-consulta`, preservando as policies específicas das ações de escrita. Há teste parametrizado para cada capacidade isolada e para acesso negado, incluindo recusa de criação. A alteração ainda precisa ser compilada, executada e instalada no ambiente de teste. O cenário de autorizacao.consultar isolada ainda precisa ser reproduzido contra essa API.

A busca no código de produção não encontrou listas ADM/SEC/TES usadas para autorização. A referência a cargo/roles na listagem serve à busca e apresentação. A homologação compartilhada permanece pendente. A revisão de segurança e a ampliação de todos os casos solicitados ainda não estão integralmente concluídas.

Resultado final da rodada ampliada: 259 testes unitários aprovados em 42 arquivos, sem ignorados. O E2E real AUXSEC foi executado novamente contra localhost com as credenciais de teste previamente configuradas e a limpeza do próprio teste, passando em 17,8 segundos. A API em execução ainda usa a política anterior de consulta de cargos. O E2E aprovado não comprova a correção dessa política.
