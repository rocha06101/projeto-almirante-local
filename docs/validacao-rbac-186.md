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
