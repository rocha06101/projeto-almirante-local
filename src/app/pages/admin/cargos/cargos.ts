import { A11yModule } from '@angular/cdk/a11y';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable, finalize, forkJoin, map } from 'rxjs';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { PermissoesService } from '../../../core/services/permissoes';
import { PasswordToggleComponent } from '../../../shared/components/password-toggle/password-toggle';

export interface Cargo {
  id: string;
  role: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  sistemaProtegido: boolean;
  versao: number;
}

export interface Permissao {
  chave: string;
  modulo: string;
  descricao: string;
  escrita: boolean;
  ativo: boolean;
  reservadaSistema: boolean;
  exigeRegraAlvo: boolean;
}

interface RegrasCargo {
  versao: number;
  regras: (Regra & { cargoAlvoRole: string })[];
}

interface Regra {
  permissao: string;
  cargoAlvoId: string;
}

type Editor =
  | { tipo: 'criar' }
  | { tipo: 'editar' | 'situacao' | 'permissoes' | 'regras'; cargo: Cargo };

const capacidades = {
  criar: 'autorizacao.cargos.gerenciar',
  editar: 'autorizacao.cargos.gerenciar',
  situacao: 'autorizacao.cargos.gerenciar',
  permissoes: 'autorizacao.concessoes.gerenciar',
  regras: 'autorizacao.regras-alvo.gerenciar',
};

@Component({
  imports: [FormsModule, A11yModule, PasswordToggleComponent, RouterLink],
  templateUrl: './cargos.html',
  styleUrl: './cargos.scss',
})
export class Cargos implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly acesso = inject(PermissoesService);

  readonly cargos = signal<Cargo[]>([]);
  readonly catalogo = signal<Permissao[]>([]);
  readonly carregando = signal(false);
  readonly salvando = signal(false);
  readonly carregandoEditor = signal(false);
  readonly erroLista = signal('');
  readonly erro = signal('');
  readonly erroRole = signal('');
  readonly falhaCarga = signal<{ mensagem: string; acao: 'tentar' | 'login' | 'fechar' | 'lista' } | null>(null);
  readonly conflito = signal(false);
  readonly sucesso = signal('');
  readonly editor = signal<Editor | null>(null);
  readonly busca = signal('');
  readonly situacao = signal('todos');
  readonly original = signal(new Map<string, string>());
  readonly selecao = signal(new Map<string, string>());
  readonly adicionadas = computed(() => this.diferenca(this.selecao(), this.original()));
  readonly removidas = computed(() => this.diferenca(this.original(), this.selecao()));

  readonly cargosFiltrados = computed(() => {
    const busca = this.busca().trim().toLocaleLowerCase('pt-BR');
    return this.cargos().filter(cargo =>
      (this.situacao() === 'todos' || cargo.ativo === (this.situacao() === 'ativos')) &&
      `${cargo.nome} ${cargo.role}`.toLocaleLowerCase('pt-BR').includes(busca),
    );
  });

  readonly grupos = computed(() => {
    const grupos = new Map<string, Permissao[]>();
    for (const permissao of this.catalogo()) {
      const rotulo = `${permissao.modulo} · ${permissao.escrita ? 'Escrita' : 'Leitura'}`;
      const grupo = grupos.get(rotulo) ?? [];
      grupo.push(permissao);
      grupos.set(rotulo, grupo);
    }
    return [...grupos];
  });

  private readonly escopoExecutor = signal(new Set<string>());
  readonly operacoes = computed(() => this.catalogo().filter(p => p.exigeRegraAlvo));
  role = '';
  nome = '';
  descricao = '';
  motivo = '';
  senha = '';
  mostrarSenha = false;
  confirmando = false;
  private versao = 0;

  ngOnInit(): void {
    this.carregar();
  }

  pode(tipo: Editor['tipo']): boolean {
    return this.acesso.tem(capacidades[tipo]);
  }

  carregar(): void {
    this.erroLista.set('');
    this.carregando.set(true);
    forkJoin({
      cargos: this.api.get<Cargo[]>('/Cargos'),
      catalogo: this.api.get<Permissao[]>('/Permissoes'),
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregando.set(false)),
    ).subscribe({
      next: ({ cargos, catalogo }) => {
        this.cargos.set(cargos);
        this.catalogo.set(catalogo);
      },
      error: erro => this.erroLista.set(this.mensagem(erro)),
    });
  }

  abrir(editor: Editor): void {
    if (this.carregandoEditor() || this.salvando()) return;
    this.editor.set(editor);
    this.sucesso.set('');
    this.erro.set('');
    this.erroRole.set('');
    this.conflito.set(false);
    this.falhaCarga.set(null);
    this.confirmando = false;
    this.motivo = '';
    this.senha = '';
    this.mostrarSenha = false;
    this.definirSelecao(new Map());
    if (editor.tipo === 'criar') {
      this.role = this.nome = this.descricao = '';
      return;
    }
    const cargo = editor.cargo;
    this.role = cargo.role;
    this.nome = cargo.nome;
    this.descricao = cargo.descricao;
    this.versao = cargo.versao;
    const url = `/Cargos/${cargo.id}`;
    if (editor.tipo === 'permissoes') {
      this.carregarEditor(
        this.api.get<{ versao: number; permissoes: string[] }>(`${url}/Permissoes`),
        dados => ({ versao: dados.versao, selecao: new Map(dados.permissoes.map(chave => [chave, chave])) }),
      );
    }
    if (editor.tipo === 'regras') {
      const regras = this.api.get<RegrasCargo>(`${url}/RegrasAlvo`);
      const cargoExecutor = this.acesso.cargo();
      const dados = cargoExecutor && cargoExecutor.id !== cargo.id && this.pode('regras')
        ? forkJoin({ regras, escopo: this.api.get<RegrasCargo>(`/Cargos/${cargoExecutor.id}/RegrasAlvo`) })
        : regras.pipe(map(regras => ({ regras, escopo: regras })));
      this.carregarEditor(dados, ({ regras, escopo }) => {
        this.escopoExecutor.set(new Set(escopo.regras.map(r => this.chaveRegra(r.permissao, r.cargoAlvoId))));
        return { versao: regras.versao, selecao: new Map(regras.regras.map(regra => [
          this.chaveRegra(regra.permissao, regra.cargoAlvoId),
          `${regra.permissao} → ${regra.cargoAlvoRole}`,
        ])) };
      });
    }
  }

  fechar(): void {
    if (this.salvando() || this.carregandoEditor()) return;
    this.senha = '';
    this.editor.set(null);
  }

  voltarLista(): void {
    this.fechar();
    this.carregar();
  }

  recarregar(): void {
    const editor = this.editor();
    if (!editor || editor.tipo === 'criar') return;
    if (editor.tipo === 'permissoes' || editor.tipo === 'regras') {
      this.abrir(editor);
    } else {
      this.voltarLista();
    }
  }

  alternar(chave: string, rotulo: string, marcada: boolean): void {
    this.selecao.update(atual => {
      const selecao = new Map(atual);
      if (marcada) selecao.set(chave, rotulo);
      else selecao.delete(chave);
      return selecao;
    });
  }

  chaveRegra(permissao: string, cargoAlvoId: string): string {
    return `${permissao}:${cargoAlvoId}`;
  }

  bloqueioPermissao(permissao: Permissao): string {
    if (permissao.reservadaSistema) return 'Reservada ao perfil de sistema protegido.';
    if (!permissao.ativo && !this.selecao().has(permissao.chave)) return 'Permissão inativa no catálogo.';
    if (!this.original().has(permissao.chave) && !this.acesso.tem(permissao.chave)) {
      return 'Para conceder esta permissão, seu cargo precisa possuí-la.';
    }
    return '';
  }

  bloqueioRegra(permissao: Permissao, alvo: Cargo): string {
    const chave = this.chaveRegra(permissao.chave, alvo.id);
    if (!permissao.ativo && !this.selecao().has(chave)) return 'Operação inativa no catálogo.';
    if (this.original().has(chave)) return '';
    if (!this.acesso.tem(permissao.chave)) return 'Seu cargo precisa possuir esta permissão.';
    if (alvo.sistemaProtegido && !this.escopoExecutor().has(chave)) {
      return 'Seu cargo precisa possuir esta regra sobre o perfil de sistema protegido.';
    }
    return '';
  }

  salvar(): void {
    const editor = this.editor();
    if (editor?.tipo === 'situacao' && editor.cargo.ativo && editor.cargo.sistemaProtegido) return;
    if ((editor?.tipo === 'permissoes' || editor?.tipo === 'regras') && !this.confirmando) return;
    if (!editor || this.carregandoEditor() || !this.pode(editor.tipo) || this.salvando() || this.conflito() || this.falhaCarga() ||
        !this.motivo.trim() || !this.senha) return;

    const confirmacao = { motivo: this.motivo.trim(), senhaAtualSolicitante: this.senha };
    const dados = { nome: this.nome.trim(), descricao: this.descricao.trim() };
    const role = this.role.trim().toUpperCase();
    if (editor.tipo === 'criar' && !/^[A-Z][A-Z0-9_]{1,19}$/.test(role)) {
      this.erroRole.set('Use de 2 a 20 letras sem acento, dígitos ou _, começando por letra.');
      return;
    }
    if ((editor.tipo === 'criar' || editor.tipo === 'editar') && (!dados.nome || !dados.descricao)) {
      this.erro.set('Preencha o nome e a descrição do cargo.');
      return;
    }

    this.senha = '';
    this.mostrarSenha = false;
    this.erro.set('');
    this.erroRole.set('');
    this.salvando.set(true);
    const versao = this.versao;
    const chaves = [...this.selecao().keys()];
    this.auth.comCsrf<unknown>(headers => {
      const opcoes = { headers };
      if (editor.tipo === 'criar') {
        return this.api.post('/Cargos', { ...dados, role, ...confirmacao }, opcoes);
      }
      const url = `/Cargos/${editor.cargo.id}`;
      const base = { versao, ...confirmacao };
      switch (editor.tipo) {
        case 'editar':
          return this.api.put(url, { ...base, ...dados }, opcoes);
        case 'situacao':
          return this.api.post(`${url}/${editor.cargo.ativo ? 'Desativar' : 'Reativar'}`, base, opcoes);
        case 'permissoes':
          return this.api.put(`${url}/Permissoes`, { ...base, permissoes: chaves }, opcoes);
        case 'regras': {
          const regras = chaves.map(chave => {
            const [permissao, cargoAlvoId] = chave.split(':');
            return { permissao, cargoAlvoId };
          });
          return this.api.put(`${url}/RegrasAlvo`, { ...base, regras }, opcoes);
        }
      }
    }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.salvando.set(false)),
    ).subscribe({
      next: () => {
        this.editor.set(null);
        this.sucesso.set('Alteração salva.');
        this.carregar();
        this.acesso.atualizar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      },
      error: erro => {
        if (erro instanceof HttpErrorResponse && erro.status === 409) {
          const role = erro.error?.errors?.role?.[0];
          if (role) {
            this.erroRole.set(role);
            return;
          }
          this.conflito.set(erro.error?.title === 'Versão obsoleta.' || erro.error?.versaoAtual != null);
        }
        this.erro.set(this.mensagem(erro));
      },
    });
  }

  private carregarEditor<T>(
    fonte: Observable<T>, mapear: (dados: T) => { versao: number; selecao: Map<string, string> },
  ): void {
    this.carregandoEditor.set(true);
    fonte.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregandoEditor.set(false)),
    ).subscribe({
      next: dados => {
        const { versao, selecao } = mapear(dados);
        this.versao = versao;
        this.definirSelecao(selecao);
      },
      error: (erro: unknown) => {
        switch (erro instanceof HttpErrorResponse ? erro.status : undefined) {
          case 401:
            this.falhaCarga.set({ mensagem: 'Sessão expirada. Entre novamente.', acao: 'login' });
            break;
          case 403:
            this.falhaCarga.set({ mensagem: 'Você não tem permissão para consultar estes dados.', acao: 'fechar' });
            break;
          case 404:
            this.falhaCarga.set({ mensagem: 'Cargo não encontrado. Atualize a lista de cargos.', acao: 'lista' });
            break;
          case 0:
            this.falhaCarga.set({ mensagem: 'Falha de conexão ao carregar os dados do cargo.', acao: 'tentar' });
            break;
          default:
            this.falhaCarga.set({ mensagem: 'Não foi possível carregar os dados do cargo.', acao: 'tentar' });
        }
      },
    });
  }

  private definirSelecao(selecao: Map<string, string>): void {
    this.original.set(selecao);
    this.selecao.set(selecao);
  }

  private diferenca(a: Map<string, string>, b: Map<string, string>): string[] {
    return [...a].filter(([chave]) => !b.has(chave)).map(([, rotulo]) => rotulo);
  }

  private mensagem(erro: unknown): string {
    if (erro instanceof HttpErrorResponse) {
      const problema = erro.error;
      const campo = Object.values(problema?.errors ?? {}).flat()[0];
      if (typeof campo === 'string') return campo;
      if (problema?.detail || problema?.title) return problema.detail ?? problema.title;
      if (erro.status === 401) return 'Sessão expirada. Entre novamente.';
      if (erro.status === 403) return 'Você não tem permissão para esta operação.';
      if (erro.status === 404) return 'Cargo não encontrado.';
      if (erro.status === 409) return 'A operação conflita com o estado atual. Recarregue os dados.';
    }
    return 'Não foi possível concluir a operação.';
  }
}
