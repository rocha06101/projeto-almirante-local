Atualização da validação frontend da #186, em ambiente local.

- [x] GET /Me/Permissoes com cargo, permissões efetivas, revisão e designação de almoxarifado coberto pelo E2E existente.
- [x] Catálogo e recusa 403 para AUXSEC cobertos pelo E2E existente.
- [x] Criar, editar, desativar e reativar, motivo, senha e conflitos cobertos pelo E2E existente.
- [x] Substituição integral e conflitos de concessões/regras cobertos pelo E2E existente.
- [x] Cenário AUXSEC de consultas coberto pelo E2E existente.
- [x] Revogação na próxima requisição e atualização do menu na mesma sessão cobertas pelo E2E existente.
- [x] Respostas 400/401/403/404/409 cobertas pelo E2E existente.

Foi identificada uma dependência adicional. GET /Cargos precisa aceitar cargos.consultar OU autorizacao.consultar para permitir os dois usos previstos. A correção e o teste de política estão preparados em worktree de backend, mas a execução foi bloqueada pela ausência do SDK .NET 10. A integração dessa correção permanece pendente.

As falhas do CIN tinham causas presentes no pai do commit revisado. A expectativa de RG foi alinhada ao requisito #D9D9D9 e a área de toque passou a 44 px. Os oito testes de navegação passaram. Build passou com avisos de orçamento. Consulte docs/validacao-rbac-186.md para comandos e limitações.

Homologação compartilhada ainda pendente. Este comentário é um rascunho para publicação após a conclusão das verificações pendentes.
