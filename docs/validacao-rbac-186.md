# Validação da issue #186

Validação local em 17/11/2026. Frontend em feature/issue-186-rbac-frontend, base 27217305fe1ed8dccc6cc7594e45506af185cf45. Backend em ../backend-issue-186, branch fix/issue-186-cargos-consulta, base 27f4af4adade9de7d3593ff50f048986e2b385ed com alterações locais. Nenhum AGENTS.md foi encontrado nos repositórios.

## Reprodução e correção

GET /api/Cargos aceita cargos.consultar OU autorizacao.consultar. RequerQualquerPermissao gera um único requisito cuja avaliação usa Any. As exigências individuais de escrita permanecem nas actions. A rota/menu administrativos continuam exigindo autorizacao.consultar.

O teste ConsultaCargos_AceitaCadaCapacidadeSemLiberarEscrita usa AlmiranteApiFactory com EF InMemory isolado. O cargo protegido da fixture recebe cada permissão isoladamente. Confirma leitura com cada capacidade, 403 sem ambas, 401 anônimo e 403 para criar, editar, desativar, reativar, alterar concessões e regras. Nenhuma permissão do administrador compartilhado foi alterada para esse cenário.

Com a política anterior, dois casos passaram e o caso autorizacao.consultar falhou, recebendo Forbidden em vez de OK. A política corrigida foi restaurada após a reprodução.

O cenário de navegador em shell.spec.ts intercepta a API com apenas autorizacao.consultar. Confirma lista carregada, menu presente, escrita ausente e bloqueio da rota/menu quando a permissão é retirada. A validação HTTP real dessa capacidade ocorre na fixture de integração do backend. O cenário completo de navegador contra a nova API instalada permanece pendente.

## Comandos e resultados

O Docker com mcr.microsoft.com/dotnet/sdk:10.0 resolveu NETSDK1045, preservando o SDK global e net10.0.

```sh
docker run --rm -v "$(realpath ../backend-issue-186):/src" -w /src \
  mcr.microsoft.com/dotnet/sdk:10.0 \
  dotnet test src/Almirante.Api.Tests --filter FullyQualifiedName~RbacDinamicoTests
npx --yes --package=node@22 -- node node_modules/@angular/cli/bin/ng.js build
npx --yes --package=node@22 -- node node_modules/@angular/cli/bin/ng.js test --watch=false
E2E_BROWSER_CHANNEL=chromium npx --yes --package=node@22 -- node \
  node_modules/@playwright/test/cli.js test --project=layout e2e/shell.spec.ts
```

- Backend corrigido — dez testes de RbacDinamicoTests aprovados, zero falhas e zero ignorados, em 15 segundos. A rodada com política anterior teve a única falha esperada no acesso por autorizacao.consultar.
- Build aprovado, com avisos de orçamento de bundle/estilos.
- 265 testes unitários aprovados em 42 arquivos, zero ignorados.
- Nove E2E de navegação aprovados, zero ignorados.
- Um E2E AUXSEC real aprovado em 16,2 segundos, zero ignorados. Executado com --project=real-backend e2e/rbac.real.spec.ts, em localhost:8444 via frontend localhost:4201, usando credenciais de teste previamente configuradas sem impressão.

AUXSEC preserva sua limpeza de usuário, cargo, designação e regras temporárias. O histórico de auditoria permanece. A API local usada pelo AUXSEC ainda é a imagem almirante-api existente, sem instalação da correção deste worktree.

## Cobertura e limites

Os testes de Cargos cobrem criação normalizada, edição, duplicidade, desativação/reativação, protegido, motivo/senha obrigatórios, limpeza após sucesso/erro, ausência de capacidade, resumo e substituição integral de regras e concessões com versão e bloqueio após 409 até recarga.

As causas das falhas de CIN já existiam no pai do commit revisado, conforme inspeção do código. O teste de RG agora exige #D9D9D9 e a área clicável oferece 44 px. Os testes correspondentes passaram.

O código do backend está preparado e validado em fixture isolada, sem merge ou instalação na API compartilhada. Homologação compartilhada, suíte completa do backend e testes SQL Server permanecem não executados nesta rodada. A revisão/publicação das alterações nos dois repositórios e a instalação da API corrigida continuam necessárias para a entrega compartilhada.
