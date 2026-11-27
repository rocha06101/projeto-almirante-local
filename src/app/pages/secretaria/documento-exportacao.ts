import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { DocumentosService, FormatoExportacao } from '../../core/services/documentos';
import { ToastService } from '../../core/services/toast.service';
import { Modal } from '../../shared/components/modal/modal';

const tipos: Record<FormatoExportacao, readonly string[]> = {
  pdf: ['application/pdf'],
  md: ['text/markdown', 'text/plain'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

function nomeArquivo(disposicao: string | null, titulo: string, formato: FormatoExportacao): string {
  const codificado = /(?:^|;)\s*filename\*=UTF-8'[^']*'([^;]+)/i.exec(disposicao ?? '')?.[1];
  const simples = /(?:^|;)\s*filename=(?:"([^"]+)"|([^;]+))/i.exec(disposicao ?? '');
  let nome = simples?.[1] ?? simples?.[2] ?? titulo + '.' + formato;
  if (codificado) {
    try {
      nome = decodeURIComponent(codificado.trim());
    } catch {
      // A API também pode enviar o nome simples como alternativa.
    }
  }
  return nome.replace(/[/\\\u0000-\u001f\u007f]/g, '_').trim() || 'documento.' + formato;
}

@Component({
  selector: 'app-documento-exportacao',
  imports: [Modal],
  template: `
    <button class="exportar" type="button" aria-haspopup="dialog"
      [attr.aria-label]="'Exportar ' + titulo()" (click)="abrir()">
      <ng-content />
    </button>
    @if (aberto()) {
      <app-modal titulo="Exportar documento" (fechar)="aberto.set(false)">
        @if (!id()) {
          <p>Salve o documento antes de exportar.</p>
        } @else {
          @if (alteracoesPendentes()) {
            <p>O download contém a última versão salva. Salve o documento para incluir as alterações.</p>
          }
          @if (carregandoFormatos()) {
            <p role="status">Consultando formatos de exportação…</p>
          } @else if (opcoes().length) {
            <div class="formatos" role="group" aria-label="Formatos de exportação">
              @for (formato of opcoes(); track formato) {
                <button class="exportar" type="button" [disabled]="baixando()" (click)="baixar(formato)">
                  {{ formato.toUpperCase() }}
                </button>
              }
            </div>
          } @else {
            <p>Os formatos de exportação estão indisponíveis para este documento.</p>
          }
          @if (erro()) {
            <p role="alert">{{ erro() }}</p>
          }
          @if (baixando()) {
            <p role="status">Baixando documento…</p>
          }
        }
        <button modal-acoes class="exportar" type="button" (click)="aberto.set(false)">Fechar</button>
      </app-modal>
    }
  `,
  styles: `
    .formatos { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .exportar {
      min-width: var(--tap-target);
      min-height: var(--tap-target);
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
      justify-content: center;
      padding-inline: 0.75rem;
      border: 1px solid var(--theme-control-border);
      border-radius: 0.5rem;
      background: var(--theme-surface);
      color: var(--theme-text);
      font: inherit;
    }
    .exportar:hover { background: var(--theme-surface-secondary); }
    .exportar:focus-visible { outline: 2px solid var(--theme-link); outline-offset: 2px; }
    :host(.editor-exportacao) > .exportar {
      border-color: var(--theme-link);
      color: var(--theme-link);
      font-weight: 600;
    }
  `,
})
export class DocumentoExportacao {
  private readonly api = inject(DocumentosService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string | null>();
  readonly titulo = input.required<string>();
  readonly formatos = input<FormatoExportacao[]>();
  readonly carregandoFormatos = input(false);
  readonly alteracoesPendentes = input(false);

  readonly aberto = signal(false);
  readonly erro = signal('');
  readonly baixando = signal(false);
  readonly opcoes = computed(() => {
    const formatos = this.formatos();
    return Array.isArray(formatos)
      ? [...new Set(formatos.filter(formato => Object.hasOwn(tipos, formato)))]
      : [];
  });

  abrir(): void {
    this.erro.set('');
    this.aberto.set(true);
  }

  baixar(formato: FormatoExportacao): void {
    const id = this.id();
    if (!id || this.baixando() || !this.opcoes().includes(formato)) return;
    this.erro.set('');
    this.baixando.set(true);
    const titulo = this.titulo();

    this.api.exportar(id, formato).pipe(
      map(({ body, headers }) => {
        const mime = (headers.get('Content-Type') ?? body?.type ?? '').split(';')[0].trim().toLowerCase();
        if (!body?.size || !tipos[formato].includes(mime)) {
          throw new Error('Resposta sem arquivo válido.');
        }
        return { arquivo: body, nome: nomeArquivo(headers.get('Content-Disposition'), titulo, formato) };
      }),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.baixando.set(false)),
    ).subscribe({
      next: ({ arquivo, nome }) => {
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = url;
        link.download = nome;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        this.aberto.set(false);
      },
      error: (erro: unknown) => {
        const mensagem = erro instanceof HttpErrorResponse && erro.status === 403
          ? 'Você não tem permissão para exportar este documento.'
          : 'Não foi possível baixar o documento. Tente novamente.';
        this.erro.set(mensagem);
        this.toast.error(mensagem);
      },
    });
  }
}
