import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subscription, catchError, finalize, map, switchMap } from 'rxjs';
import { ConteudoDocumento, Documento, DocumentosService, FormatoExportacao } from '../../core/services/documentos';
import { ToastService } from '../../core/services/toast.service';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { DocumentoExportacao } from './documento-exportacao';
import { DocumentoMarkdown } from './documento-markdown';

class TransicaoDocumentoCriado {
  constructor(
    readonly salvo: Documento,
    readonly obterRascunho: () => ConteudoDocumento,
    readonly previaVisivel: boolean,
  ) {}
}

@Component({
  selector: 'app-documento-editor',
  imports: [RouterLink, RefreshButton, DocumentoMarkdown, DocumentoExportacao],
  templateUrl: './documento-editor.html',
  styleUrl: './documento-editor.scss',
})
export class DocumentoEditor {
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(DocumentosService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rota = inject(ActivatedRoute);
  private transicao?: TransicaoDocumentoCriado;
  private consultaFormatos?: Subscription;
  readonly id = signal(this.rota.snapshot.paramMap.get('id'));
  private versao = '';
  private tentativa?: { payload: string; chave: string };

  readonly titulo = signal('Novo documento');
  readonly tipo = signal('');
  readonly markdown = signal('');
  readonly previaVisivel = signal(true);

  alternarPrevia(): void {
    this.previaVisivel.update(visivel => !visivel);
  }

  readonly linhasMarkdown = computed(() => this.markdown().split('\n'));
  readonly carregando = signal(!!this.id());
  readonly salvando = signal(false);
  readonly documentoConfirmado = signal(false);
  readonly erro = signal('');

  readonly formatos = signal<FormatoExportacao[] | undefined>(undefined);
  readonly carregandoFormatos = signal(false);
  private readonly ultimaVersaoSalva = signal<ConteudoDocumento>({
    titulo: 'Novo documento',
    tipo: '',
    markdown: '',
  });
  readonly tituloSalvo = computed(() => this.ultimaVersaoSalva().titulo);
  readonly temAlteracoesPendentes = computed(() => {
    const salvo = this.ultimaVersaoSalva();
    const atual = this.conteudoAtual();
    return atual.titulo.trim() !== salvo.titulo.trim()
      || atual.tipo.trim() !== salvo.tipo.trim()
      || atual.markdown !== salvo.markdown;
  });

  constructor() {
    const info = this.router.currentNavigation()?.extras.info;
    this.rota.paramMap.pipe(
      switchMap(params => {
        const id = params.get('id');
        this.id.set(id);
        this.erro.set('');
        this.consultaFormatos?.unsubscribe();
        this.formatos.set(undefined);
        this.versao = '';
        this.documentoConfirmado.set(false);
        this.carregando.set(!!id);

        if (!id) {
          const template = info as Pick<ConteudoDocumento, 'tipo' | 'markdown'> | undefined;
          this.tipo.set(template?.tipo ?? '');
          this.markdown.set(template?.markdown ?? '');
          return EMPTY;
        }

        if (info instanceof TransicaoDocumentoCriado && info.salvo.id === id) {
          this.confirmar(info.salvo);
          this.preencher(info.obterRascunho());
          this.previaVisivel.set(info.previaVisivel);
          this.carregando.set(false);
          this.atualizarFormatos(id);
          return EMPTY;
        }

        this.preencher({ titulo: '', tipo: '', markdown: '' });
        this.ultimaVersaoSalva.set(this.conteudoAtual());
        return this.api.obter(id).pipe(
          catchError((erro: unknown) => {
            this.erro.set(erro instanceof HttpErrorResponse && erro.status === 404
              ? 'Documento não encontrado.'
              : 'Não foi possível carregar o documento.');
            return EMPTY;
          }),
          finalize(() => this.carregando.set(false)),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(documento => {
      this.preencher(documento);
      this.confirmar(documento);
    });
  }

  private conteudoAtual(): ConteudoDocumento {
    return { titulo: this.titulo(), tipo: this.tipo(), markdown: this.markdown() };
  }

  private preencher({ titulo, tipo, markdown }: ConteudoDocumento): void {
    this.titulo.set(titulo);
    this.tipo.set(tipo);
    this.markdown.set(markdown);
  }

  private confirmar(documento: Documento): void {
    const { titulo, tipo, markdown, versao, formatosExportacao } = documento;
    this.versao = versao;
    this.ultimaVersaoSalva.set({ titulo, tipo, markdown });
    this.formatos.set(formatosExportacao);
    this.documentoConfirmado.set(true);
  }

  private atualizarFormatos(id: string): void {
    this.consultaFormatos?.unsubscribe();
    this.carregandoFormatos.set(true);
    this.consultaFormatos = this.api.obter(id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregandoFormatos.set(false)),
    ).subscribe({
      next: documento => this.formatos.set(documento.formatosExportacao),
      error: () => this.formatos.set(undefined),
    });
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

  @HostListener('window:beforeunload', ['$event'])
  avisarAntesDeFechar(evento: BeforeUnloadEvent): void {
    if (this.temAlteracoesPendentes()) evento.preventDefault();
  }

  podeSair(): boolean {
    if (this.transicao && this.router.currentNavigation()?.extras.info === this.transicao) return true;
    if (this.salvando()) return false;
    return !this.temAlteracoesPendentes()
      || window.confirm('Há alterações não salvas. Deseja sair e descartá-las?');
  }

  salvar(): void {
    const id = this.id();
    if (this.salvando() || this.carregando() || this.transicao || (id && !this.versao)) return;

    const enviado = this.conteudoAtual();
    const conteudo = { ...enviado, titulo: enviado.titulo.trim(), tipo: enviado.tipo.trim() };
    if (!conteudo.titulo || !conteudo.tipo || !conteudo.markdown.trim()) {
      this.falhaAoSalvar('Informe o título, o tipo e o conteúdo do documento.');
      return;
    }
    this.erro.set('');
    this.salvando.set(true);

    const requisicao = id
      ? this.api.editar(id, this.versao, conteudo).pipe(map(({ versao }) => ({ id, versao })))
      : this.api.criar(conteudo, this.chaveCriacao(conteudo));

    requisicao.pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.salvando.set(false)),
    ).subscribe({
      next: ({ id: salvoId, versao }) => {
        const salvo = { ...conteudo, id: salvoId, versao };
        this.id.set(salvoId);
        this.confirmar(salvo);
        if (this.titulo() === enviado.titulo) this.titulo.set(conteudo.titulo);
        if (this.tipo() === enviado.tipo) this.tipo.set(conteudo.tipo);
        this.tentativa = undefined;
        this.toast.success('Documento salvo.');

        if (id) {
          this.atualizarFormatos(id);
        } else {
          this.abrirEdicao(salvo);
        }
      },
      error: (erro: unknown) => {
        const status = erro instanceof HttpErrorResponse ? erro.status : undefined;
        switch (status) {
          case 409:
            this.falhaAoSalvar('O documento foi alterado em outra sessão. Seu rascunho continua nesta tela.');
            break;
          case 403:
            this.falhaAoSalvar('Você não tem permissão para salvar este documento.');
            break;
          case 400:
          case 422:
            this.falhaAoSalvar('A API recusou os dados do documento. Revise os campos e tente novamente.');
            break;
          default:
            this.falhaAoSalvar('Não foi possível salvar o documento. Seu rascunho continua nesta tela.');
        }
      },
    });
  }

  private abrirEdicao(salvo: Documento): void {
    const transicao = new TransicaoDocumentoCriado(
      salvo, () => this.conteudoAtual(), this.previaVisivel(),
    );
    this.transicao = transicao;
    const falha = () => {
      if (this.destroyRef.destroyed) return;
      this.atualizarFormatos(salvo.id);
      this.toast.warning('Documento salvo. Não foi possível abrir a URL de edição.');
    };

    void this.router.navigate(['/secretaria', 'documentos', salvo.id, 'editar'], {
      info: transicao,
      replaceUrl: true,
    }).then(abriu => {
      if (!abriu) falha();
    }, falha).finally(() => {
      this.transicao = undefined;
    });
  }

  private falhaAoSalvar(mensagem: string): void {
    this.erro.set(mensagem);
    this.toast.error(mensagem);
  }

  private chaveCriacao(conteudo: ConteudoDocumento): string {
    const payload = JSON.stringify(conteudo);
    if (this.tentativa?.payload !== payload) this.tentativa = { payload, chave: crypto.randomUUID() };
    return this.tentativa.chave;
  }
}
