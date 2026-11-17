Validação local da #186 em 17/11/2026.

Checklist da seção 1, exercitado pelo E2E real AUXSEC existente e executado novamente nesta rodada:

- [x] GET /Me/Permissoes com cargo, permissões efetivas, revisão e designação de almoxarifado.
- [x] Catálogo e 403 para usuário sem autorizacao.consultar.
- [x] Criar, editar, desativar/reativar, motivo, senha e conflito de versão.
- [x] Concessões e regras enviadas integralmente, sem aplicação parcial em conjunto inválido e com 409 em versão obsoleta.
- [x] AUXSEC consulta membros/eventos e recebe recusa nas demais operações testadas.
- [x] Revogação produz 403 na próxima requisição e atualiza o menu na mesma sessão.
- [x] Tratamento das respostas 400/401/403/404/409.

A incompatibilidade de GET /Cargos foi reproduzida em fixture isolada — autorizacao.consultar isolada recebeu 403 com a política anterior. A correção usa cargos.consultar OU autorizacao.consultar, mantendo as capacidades de escrita. O teste parametrizado cobre cada capacidade isolada, ausência de ambas, anônimo e recusa de todas as operações administrativas de escrita.

O frontend tem cenário de navegador com API interceptada para autorizacao.consultar isolada, verificando lista, menu, ausência de escrita e bloqueio sem a capacidade. Essa evidência complementa o teste HTTP de integração, e ainda não representa navegador contra uma implantação compartilhada da API corrigida.

Os dez testes de RBAC do backend corrigido passaram, sem ignorados. Build aprovado com avisos de orçamento, 265 unitários aprovados, nove E2E de navegação aprovados e AUXSEC real aprovado. Docker SDK .NET 10 resolveu a limitação de SDK. Comandos e revisões estão em docs/validacao-rbac-186.md.

Pendências de entrega compartilhada — revisão e integração dos dois repositórios, instalação da correção de backend e homologação compartilhada. Alterações permanecem locais, prontas para revisão.
