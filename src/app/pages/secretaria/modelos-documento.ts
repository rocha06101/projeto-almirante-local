import type { ConteudoDocumento, TIPOS_DOCUMENTO } from '../../core/services/documentos';

export interface RascunhoDocumentoInicial extends Pick<ConteudoDocumento, 'tipo' | 'markdown'> {
  titulo?: string;
  modeloFixo?: boolean;
}

// Os espaços explícitos preservam as quebras de linha do Markdown na ficha.
const MODELOS_DOCUMENTO: Readonly<Record<string, string | undefined>> = {
  'Ata': `# Ata de Reunião: [Título ou Projeto]

* **Data:** [DD/MM/AAAA]
* **Horário:** [HH:MM] às [HH:MM]
* **Local / Link:** [Sala / Google Meet / Zoom]
* **Facilitador(a):** [Nome]
* **Redator(a):** [Nome]

## Participantes
* **Presentes:** [Nome 1], [Nome 2], [Nome 3]
* **Ausentes:** [Nome 4]

## Pauta
1. [Tópico 1]
2. [Tópico 2]
3. [Tópico 3]

## Resumo das Discussões
### [Tópico 1]
* [Ponto principal discutido]
* [Observação ou dúvida levantada]

### [Tópico 2]
* [Ponto principal discutido]

## Decisões Tomadas
* **[Decisão 1]:** [Resumo do que foi aprovado e o motivo]
* **[Decisão 2]:** [Resumo do que foi aprovado e o motivo]

## Itens de Ação (Action Items)

| Tarefa | Responsável | Prazo | Status |
| :--- | :--- | :--- | :--- |
| [Descrição da ação] | @[Nome] | [DD/MM/AAAA] | Pendente |
| [Descrição da ação] | @[Nome] | [DD/MM/AAAA] | Em andamento |

## Próxima Reunião
* **Data e horário:** [DD/MM/AAAA às HH:MM]
* **Pauta preliminar:** [Assuntos previstos]`,

  'Ficha de cadastro': `# FICHA DE CADASTRO DE MEMBRO — DESBRAVADORES
**Clube de Desbravadores [Nome do Clube]**\x20\x20
*Gestão de Usuários — Cadastro de Novo Membro*

---

## 1. Dados Pessoais do Membro
* **Nome Completo:** _________________________________________________________
* **Documento é CIN (Carteira de Identidade Nacional)?** ( ) Sim  ( ) Não
* **CPF:** _______________________
* **RG:** _______________________ *(Preencher caso não possua CIN)*
* **Data de Nascimento:** ____/____/______
* **Telefone:** (____) _____-_____
* **E-mail:** _________________________________________________________
* **Cargo / Função:** _________________________________________________________

---

## 2. Informações de Saúde
* **Tipo Sanguíneo:** ( ) A+  ( ) A-  ( ) B+  ( ) B-  ( ) AB+  ( ) AB-  ( ) O+  ( ) O-
* **Doenças e Alergias / Observações Importantes:**\x20\x20
  __________________________________________________________________________\x20\x20
  __________________________________________________________________________

---

## 3. Dados do Responsável
* **Nome do Responsável:** _________________________________________________________
* **Telefone do Responsável:** (____) _____-_____
* **E-mail do Responsável:** _________________________________________________________

---

## 4. Endereço
* **CEP:** _____-___
* **Rua:** _________________________________________________________
* **Número:** ___________ | **Complemento:** _______________________
* **Bairro:** _________________________________________________________

---

## 5. Acesso ao Sistema *(Uso Interno / Opcional na ficha impressa)*
* **Senha Provisória:** _______________________\x20\x20
  *(Regras: 8 a 15 caracteres, mín. 1 caractere especial, 1 número, 1 letra maiúscula e sem sequências simples)*

---

**Data de Preenchimento:** ____/____/20____


_________________________________________________________\x20\x20
**Assinatura do Membro ou Responsável Legal**`,

  'Autorização de saída': `# Autorização

Eu, **{{nome_responsavel}}**, portador(a) do RG **{{rg_responsavel}}** e do CPF **{{cpf_responsavel}}**, domiciliado(a) no endereço **{{endereco_responsavel}}**, responsável pelo(a) desbravador(a) **{{nome_desbravador}}**, sob documento de identificação **{{documento_desbravador}}**, o(a) autorizo a participar da saída para o **Acampamento no Sítio do Girassol** com o clube **Almirante Tamandaré**, no dia **{{data_saida}}** às **{{hora_saida}}**, com retorno no dia **{{data_retorno}}** às **{{hora_retorno}}**.

## Estou ciente que:

- O clube é responsável pelo(a) meu(minha) filho(a); objetos pessoais são responsabilidade de cada desbravador.
- O valor do acampamento inclui alimentação e transporte.
- O local é seguro.

---

## Autorização

**Assinatura do responsável:**

\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_

**Número para contato:** {{telefone_contato}}`,
} satisfies Record<(typeof TIPOS_DOCUMENTO)[number], string>;

export function modeloDocumento(tipo: string): string | undefined {
  return Object.hasOwn(MODELOS_DOCUMENTO, tipo) ? MODELOS_DOCUMENTO[tipo] : undefined;
}
