import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, map } from 'rxjs';
import { ConteudoDocumento, DocumentosService, PERMISSAO_DOCUMENTOS } from '../../core/services/documentos';
import { PermissoesService } from '../../core/services/permissoes';
import { ToastService } from '../../core/services/toast.service';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';

@Component({
  selector: 'app-documento-editor',
  imports: [RouterLink, RefreshButton],
  templateUrl: './documento-editor.html',
  styleUrl: './documento-editor.scss',
})
export class DocumentoEditor {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(DocumentosService);
  private readonly router = inject(Router);
  private readonly permissoes = inject(PermissoesService);
  private readonly toast = inject(ToastService);
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  private versao = '';
  private tentativa?: { payload: string; chave: string };

  readonly titulo = signal('Novo documento');
  readonly tipo = signal('');
  readonly markdown = signal('');
  readonly carregando = signal(!!this.id);
  readonly salvando = signal(false);
  readonly erro = signal('');

  constructor() {
    if (this.id) {
      this.api.obter(this.id).pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.carregando.set(false)),
      ).subscribe({
        next: ({ titulo, tipo, markdown, versao }) => {
          this.titulo.set(titulo);
          this.tipo.set(tipo);
          this.markdown.set(markdown);
          this.versao = versao;
        },
        error: () => this.erro.set('Não foi possível carregar o documento.'),
      });
      return;
    }
    const template = this.router.currentNavigation()?.extras.info as
      Pick<ConteudoDocumento, 'tipo' | 'markdown'> | undefined;
    this.tipo.set(template?.tipo ?? '');
    this.markdown.set(template?.markdown ?? '');
  }

  salvar(): void {
    if (this.salvando() || this.carregando() || (this.id && !this.versao)) return;
    if (!this.permissoes.tem(this.id ? PERMISSAO_DOCUMENTOS.editar : PERMISSAO_DOCUMENTOS.criar)) {
      this.erro.set('Você não tem permissão para salvar este documento.');
      return;
    }

    const conteudo = { titulo: this.titulo().trim(), tipo: this.tipo().trim(), markdown: this.markdown() };
    if (!conteudo.titulo || !conteudo.tipo || !conteudo.markdown.trim()) {
      this.erro.set('Informe o título, o tipo e o conteúdo do documento.');
      return;
    }
    this.erro.set('');
    this.salvando.set(true);

    const id = this.id;
    const requisicao = id
      ? this.api.editar(id, this.versao, conteudo).pipe(map(({ versao }) => ({ id, versao })))
      : this.api.criar(conteudo, this.chaveCriacao(conteudo));

    requisicao.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.salvando.set(false)),
    ).subscribe({
      next: registro => {
        this.id = registro.id;
        this.versao = registro.versao;
        this.tentativa = undefined;
        this.toast.success('Documento salvo.');
        void this.router.navigate(['/secretaria']);
      },
      error: erro => this.erro.set(erro instanceof HttpErrorResponse && erro.status === 409
        ? 'O documento foi alterado em outra sessão. Seu texto continua disponível nesta tela.'
        : 'Não foi possível salvar o documento. Tente novamente.'),
    });
  }

  private chaveCriacao(conteudo: ConteudoDocumento): string {
    const payload = JSON.stringify(conteudo);
    if (this.tentativa?.payload !== payload) this.tentativa = { payload, chave: crypto.randomUUID() };
    return this.tentativa.chave;
  }
}
