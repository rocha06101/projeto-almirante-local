import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, map } from 'rxjs';
import { ConteudoDocumento, DocumentosService, PERMISSAO_DOCUMENTOS } from '../../core/services/documentos';
import { PermissoesService } from '../../core/services/permissoes';
import { ToastService } from '../../core/services/toast.service';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { marked } from 'marked';

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
  private readonly painelPrevia =
    viewChild<ElementRef<HTMLDivElement>>('painelPrevia');

  private readonly configurarLinksDaPrevia = afterRenderEffect({
    write: () => {
      // Reaplica os atributos quando a edição recria os links da prévia.
      this.previaHtml();

      const painel = this.painelPrevia()?.nativeElement;
      painel?.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    },
  });

  readonly titulo = signal('Novo documento');
  readonly tipo = signal('');
  readonly markdown = signal('');
  readonly previaVisivel = signal(true);

  alternarPrevia(): void {
    this.previaVisivel.update(visivel => !visivel);
  }

  readonly linhasMarkdown = computed(() => this.markdown().split('\n'));
  readonly previaHtml = computed(() =>
    marked.parse(this.markdown(), { async: false, gfm: true })
  );
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

  inserirLink(campo: HTMLTextAreaElement): void {
    const inicio = campo.selectionStart;
    const fim = campo.selectionEnd;
    const selecao = campo.value.slice(inicio, fim);
    const rotulo = (selecao || 'Texto do link')
      .replace(/\\/g, '\\\\')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    const url = 'https://exemplo.com';
    const prefixo = `[${rotulo}](`;
    const link = `${prefixo}${url})`;

    campo.setRangeText(link, inicio, fim, 'end');
    this.markdown.set(campo.value);

    const inicioUrl = inicio + prefixo.length;
    campo.focus();
    campo.setSelectionRange(inicioUrl, inicioUrl + url.length);
  }

  aplicarBlocoCodigo(campo: HTMLTextAreaElement): void {
    const valor = campo.value;
    const inicioSelecao = campo.selectionStart;
    const fimSelecao = campo.selectionEnd;
    const inicio = valor.slice(0, inicioSelecao).lastIndexOf('\n') + 1;
    const ultimoCaractere = Math.max(inicioSelecao, fimSelecao - 1);
    const proximaQuebra = valor.indexOf('\n', ultimoCaractere);
    const fim = proximaQuebra === -1 ? valor.length : proximaQuebra;

    const conteudo = valor.slice(inicio, fim) || 'código';

    // A cerca precisa ser maior que qualquer sequência de crases do conteúdo.
    const sequencias = conteudo.match(/`+/g) ?? [];
    const tamanhoCerca = sequencias.reduce(
      (tamanho, sequencia) => Math.max(tamanho, sequencia.length + 1),
      3,
    );
    const cerca = '`'.repeat(tamanhoCerca);
    const bloco = `${cerca}\n${conteudo}\n${cerca}`;

    campo.setRangeText(bloco, inicio, fim, 'end');
    this.markdown.set(campo.value);

    const inicioConteudo = inicio + cerca.length + 1;
    campo.focus();
    campo.setSelectionRange(inicioConteudo, inicioConteudo + conteudo.length);
  }

  aplicarCitacao(campo: HTMLTextAreaElement): void {
    const valor = campo.value;
    const inicioSelecao = campo.selectionStart;
    const fimSelecao = campo.selectionEnd;
    const inicio = valor.slice(0, inicioSelecao).lastIndexOf('\n') + 1;

    const ultimoCaractere = Math.max(inicioSelecao, fimSelecao - 1);
    const proximaQuebra = valor.indexOf('\n', ultimoCaractere);
    const fim = proximaQuebra === -1 ? valor.length : proximaQuebra;

    const trecho = valor.slice(inicio, fim);
    const citacao = trecho === ''
      ? '> Citação'
      : trecho.split('\n').map(linha => {
        if (/^ {0,3}>/.test(linha)) return linha;
        return linha ? `> ${linha}` : '>';
      }).join('\n');

    campo.setRangeText(citacao, inicio, fim, 'end');
    this.markdown.set(campo.value);
    campo.focus();

    if (trecho === '') {
      campo.setSelectionRange(inicio + 2, inicio + citacao.length);
    }
  }

  aplicarLista(
    campo: HTMLTextAreaElement,
    tipo: 'marcadores' | 'numerada',
  ): void {
    const valor = campo.value;
    const inicioSelecao = campo.selectionStart;
    const fimSelecao = campo.selectionEnd;
    const inicio = valor.slice(0, inicioSelecao).lastIndexOf('\n') + 1;

    // Se a seleção termina no início da próxima linha, ela fica fora da lista.
    const ultimoCaractere = Math.max(inicioSelecao, fimSelecao - 1);
    const proximaQuebra = valor.indexOf('\n', ultimoCaractere);
    const fim = proximaQuebra === -1 ? valor.length : proximaQuebra;

    const linhas = valor.slice(inicio, fim).split('\n');
    const lista = linhas.map((linha, indice) => {
      const [, recuo, conteudo] = /^([ \t]*)(.*)$/.exec(linha)!;
      const item = conteudo.replace(/^(?:[-+*]|\d+[.)])(?:[ \t]+|$)/, '');
      const marcador = tipo === 'numerada' ? `${indice + 1}. ` : '- ';
      return `${recuo}${marcador}${item || 'Item'}`;
    }).join('\n');

    campo.setRangeText(lista, inicio, fim, 'end');
    this.markdown.set(campo.value);

    campo.focus();
    if (linhas.length === 1 && !linhas[0].trim()) {
      const fimItem = inicio + lista.length;
      campo.setSelectionRange(fimItem - 'Item'.length, fimItem);
    }
  }

  aplicarTitulo(campo: HTMLTextAreaElement): void {
    const valor = campo.value;
    const cursor = campo.selectionStart;
    const inicio = valor.slice(0, cursor).lastIndexOf('\n') + 1;
    const proximaQuebra = valor.indexOf('\n', cursor);
    const fim = proximaQuebra === -1 ? valor.length : proximaQuebra;

    const linha = valor.slice(inicio, fim);
    const texto = linha.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '') || 'Título';

    campo.setRangeText(`## ${texto}`, inicio, fim, 'end');
    this.markdown.set(campo.value);

    campo.focus();
    campo.setSelectionRange(inicio + 3, inicio + 3 + texto.length);
  }

  aplicarEnfase(campo: HTMLTextAreaElement, marcador: '*' | '**'): void {
    const inicio = campo.selectionStart;
    const fim = campo.selectionEnd;
    const texto = campo.value.slice(inicio, fim) || 'texto';

    campo.setRangeText(`${marcador}${texto}${marcador}`, inicio, fim, 'end');
    this.markdown.set(campo.value);

    const inicioTexto = inicio + marcador.length;
    campo.focus();
    campo.setSelectionRange(inicioTexto, inicioTexto + texto.length);
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

        if (!id) {
          void this.router.navigate(['/secretaria']);
        }
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
