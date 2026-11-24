import { HttpErrorResponse } from '@angular/common/http';
import { A11yModule } from '@angular/cdk/a11y';
import { Component, DestroyRef, ElementRef, afterNextRender, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subscription, of, switchMap } from 'rxjs';
import {
  ConteudoDocumento, DocumentoListagem, DocumentosService, LIMITE_ARQUIVO_DOCUMENTO,
  ModoImportacao, PERMISSAO_DOCUMENTOS, erroImportacaoDocumento,
} from '../../core/services/documentos';
import { PermissoesService } from '../../core/services/permissoes';
import { ToastService } from '../../core/services/toast.service';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';

@Component({
  selector: 'app-criar-documento-dialog',
  imports: [A11yModule, RefreshButton],
  templateUrl: './criar-documento-dialog.html',
  styleUrl: './criar-documento-dialog.scss',
})
export class CriarDocumentoDialog {
  private readonly api = inject(DocumentosService);
  private readonly permissoes = inject(PermissoesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private operacao?: Subscription;
  private selecao = 0;
  private markdownConvertido?: string;
  private readonly chaves = new Map<string, string>();

  readonly cancelar = output<void>();
  readonly criado = output<DocumentoListagem>();
  readonly templatePronto = output<Pick<ConteudoDocumento, 'tipo' | 'markdown'>>();
  readonly modo = signal<ModoImportacao>('documento');
  readonly tiposDocumento = ['Ata', 'Autorização de saída', 'Ficha de cadastro'];
  readonly tipo = signal('');
  readonly titulo = signal('');
  readonly arquivo = signal<File | null>(null);
  readonly etapa = signal<'leitura' | 'importacao' | 'gravacao' | null>(null);
  readonly avisos = signal<string[]>([]);
  readonly erro = signal('');
  readonly erroArquivo = signal('');
  readonly tentouEnviar = signal(false);
  readonly arrastando = signal(false);

  constructor() {
    afterNextRender(() => this.dialogo().nativeElement.showModal());
  }

  trocarModo(modo: ModoImportacao): void {
    if (this.modo() === modo) return;
    this.invalidar();
    this.tipo.set('');
    this.modo.set(modo);
    if (this.arquivo()) this.erroArquivo.set('');
    this.titulo.set(modo === 'documento' ? this.arquivo()?.name ?? '' : '');
    this.tentouEnviar.set(false);
  }

  selecionar(input: HTMLInputElement): void {
    if (input.files?.length) void this.definirArquivo(Array.from(input.files));
    input.value = '';
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando.set(false);
    if (evento.dataTransfer?.files.length) void this.definirArquivo(Array.from(evento.dataTransfer.files));
  }

  remover(): void {
    this.selecao++;
    this.etapa.set(null);
    this.invalidar();
    this.arquivo.set(null);
    this.titulo.set('');
    this.erroArquivo.set('');
  }

  fechar(evento?: Event): void {
    evento?.preventDefault();
    this.remover();
    this.dialogo().nativeElement.close();
    this.cancelar.emit();
  }

  enviar(): void {
    if (this.etapa()) return;
    this.tentouEnviar.set(true);
    this.erro.set('');
    if (!this.verificarPermissao()) return;

    const arquivo = this.arquivo();
    const modo = this.modo();
    const tipo = this.tipo().trim();
    const titulo = this.titulo().trim();
    if (!arquivo && !this.erroArquivo()) this.erroArquivo.set('Selecione um arquivo.');
    if (!arquivo || !tipo || (modo === 'documento' && !titulo)) return;

    this.erroArquivo.set('');
    this.etapa.set('importacao');
    const conversao = this.markdownConvertido === undefined
      ? this.api.importar(arquivo, modo)
      : of({ modo, markdown: this.markdownConvertido, avisos: this.avisos() });

    this.operacao = conversao.pipe(
      switchMap(({ markdown, avisos }) => {
        this.avisos.set(Array.isArray(avisos) ? avisos.filter(aviso => typeof aviso === 'string') : []);
        if (!this.verificarPermissao()) {
          this.etapa.set(null);
          return EMPTY;
        }

        if (modo === 'template') {
          this.dialogo().nativeElement.close();
          this.notificarAvisos();
          this.templatePronto.emit({ tipo, markdown });
          return EMPTY;
        }

        this.markdownConvertido = markdown;
        this.etapa.set('gravacao');
        const conteudo = { tipo, titulo, markdown };
        const identificador = JSON.stringify([tipo, titulo]);
        const chave = this.chaves.get(identificador) ?? crypto.randomUUID();
        this.chaves.set(identificador, chave);
        return this.api.criar(conteudo, chave);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ id }) => {
        this.dialogo().nativeElement.close();
        this.notificarAvisos();
        this.toast.success('Documento criado.');
        this.criado.emit({ id, titulo });
      },
      error: erro => {
        if (this.etapa() === 'gravacao') {
          this.erro.set('Não foi possível salvar o documento. Tente novamente.');
        } else if (erro instanceof HttpErrorResponse && [400, 413, 415, 422].includes(erro.status)) {
          this.erroArquivo.set(erroImportacaoDocumento(erro));
        } else {
          this.erro.set(erroImportacaoDocumento(erro));
        }
        this.etapa.set(null);
      },
    });
  }

  private async definirArquivo(arquivos: File[]): Promise<void> {
    this.remover();
    const selecao = this.selecao;
    const [arquivo] = arquivos;
    if (arquivos.length !== 1) {
      this.erroArquivo.set('Selecione somente um arquivo.');
    } else if (!/\.(docx|xlsx|pdf)$/i.test(arquivo.name)) {
      this.erroArquivo.set('Selecione um arquivo DOCX, XLSX ou PDF.');
    } else if (arquivo.size > LIMITE_ARQUIVO_DOCUMENTO) {
      this.erroArquivo.set('O arquivo excede o limite de 1 MB.');
    } else {
      this.etapa.set('leitura');
      try {
        if (!arquivo.size) throw new Error('Arquivo vazio.');
        await arquivo.arrayBuffer();
        if (this.selecao !== selecao) return;
        this.arquivo.set(arquivo);
        if (this.modo() === 'documento') this.titulo.set(arquivo.name);
      } catch {
        if (this.selecao === selecao) this.erroArquivo.set('Não foi possível ler o arquivo.');
      } finally {
        if (this.selecao === selecao) this.etapa.set(null);
      }
    }
  }

  private verificarPermissao(): boolean {
    if (this.permissoes.tem(PERMISSAO_DOCUMENTOS.criar)) return true;
    this.erro.set('Você não tem permissão para criar documentos.');
    return false;
  }

  private invalidar(): void {
    this.operacao?.unsubscribe();
    if (this.etapa() !== 'leitura') this.etapa.set(null);
    this.markdownConvertido = undefined;
    this.chaves.clear();
    this.avisos.set([]);
    this.erro.set('');
  }

  private notificarAvisos(): void {
    if (this.avisos().length) this.toast.warning(this.avisos().join(' '));
  }
}
