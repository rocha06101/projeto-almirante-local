import { HttpErrorResponse } from '@angular/common/http';
import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subscription, expand, finalize, of, reduce, switchMap, take } from 'rxjs';
import { EventoCalendarioItem } from '../../core/models/evento.model';
import { EventosService } from '../../core/services/eventos';
import { RouterLink } from '@angular/router';
import {
  ConteudoDocumento, DocumentoListagem, DocumentosService, LIMITE_ARQUIVO_DOCUMENTO,
  ModoImportacao, PERMISSAO_DOCUMENTOS, erroImportacaoDocumento,
} from '../../core/services/documentos';
import { Modal } from '../../shared/components/modal/modal';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { ExcluirUsuarioDialog } from '../desbravadores/excluir-usuario-dialog';
import { normalizar, UsuariosListagem } from '../desbravadores/usuarios-listagem';
import { EventoDetalhes } from '../eventos/detalhes/evento-detalhes';
import { dataCivil, erroEvento, somarDias } from '../eventos/eventos.utils';
import { ProximosEventos } from '../eventos/proximos/proximos-eventos';
import { GradeRolavel } from './grade-rolavel';

@Component({
  selector: 'app-secretaria',
  imports: [CdkMenuModule, ExcluirUsuarioDialog, ProximosEventos, EventoDetalhes, RefreshButton, GradeRolavel, RouterLink, Modal],
  templateUrl: './secretaria.html',
  styleUrl: './secretaria.scss',
})
export class Secretaria extends UsuariosListagem implements OnInit {
  private readonly eventosService = inject(EventosService);
  private readonly documentosService = inject(DocumentosService);
  private consultaDocumentos?: Subscription;
  private operacao?: Subscription;
  private selecao = 0;
  private markdownConvertido?: string;
  private readonly chaves = new Map<string, string>();

  readonly criandoDocumento = signal(false);
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


  readonly carregandoDocumentos = signal(false);
  readonly erroDocumentos = signal('');
  readonly podeConsultarDocumentos = computed(() => this.permissoes.tem(PERMISSAO_DOCUMENTOS.consultar));
  readonly podeEditarDocumento = computed(() => this.permissoes.tem(PERMISSAO_DOCUMENTOS.editar));
  private readonly documentos = signal<DocumentoListagem[]>([]);
  readonly buscaDocumentos = signal('');
  readonly documentosFiltrados = computed(() => {
    const busca = normalizar(this.buscaDocumentos().trim());
    return this.documentos().filter(documento => normalizar(documento.titulo).includes(busca));
  });

  readonly hoje = dataCivil(new Date());
  readonly eventos = signal<EventoCalendarioItem[]>([]);
  readonly carregandoEventos = signal(false);
  readonly erroEventos = signal('');
  readonly dataMinimaEvento = signal('');
  readonly eventoSelecionado = signal<string | null>(null);

  constructor() {
    super();
    effect(() => {
      const podeConsultar = this.podeConsultarDocumentos();
      untracked(() => {
        if (podeConsultar) {
          this.carregarDocumentos();
        } else {
          this.consultaDocumentos?.unsubscribe();
          this.documentos.set([]);
          this.erroDocumentos.set('');
        }
      });
    });
  }

  ngOnInit(): void {
    this.carregarEventos();
  }

  abrirCriacao(): void {
    this.criandoDocumento.set(true);
  }

  fecharCriacao(): void {
    this.remover();
    this.modo.set('documento');
    this.tipo.set('');
    this.tentouEnviar.set(false);
    this.arrastando.set(false);
    this.criandoDocumento.set(false);
  }

  private documentoCriado(documento: DocumentoListagem): void {
    this.fecharCriacao();
    this.carregarDocumentos(documento);
  }

  private abrirTemplate(template: Pick<ConteudoDocumento, 'tipo' | 'markdown'>): void {
    this.fecharCriacao();
    void this.router.navigate(['/secretaria/documentos/novo'], { info: template });
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

  enviar(): void {
    if (!this.criandoDocumento() || this.etapa()) return;
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
      ? this.documentosService.importar(arquivo, modo)
      : of({ modo, markdown: this.markdownConvertido, avisos: this.avisos() });

    this.operacao = conversao.pipe(
      switchMap(({ markdown, avisos }) => {
        this.avisos.set(Array.isArray(avisos) ? avisos.filter(aviso => typeof aviso === 'string') : []);
        if (!this.verificarPermissao()) {
          this.etapa.set(null);
          return EMPTY;
        }

        if (modo === 'template') {
          this.notificarAvisos();
          this.abrirTemplate({ tipo, markdown });
          return EMPTY;
        }

        this.markdownConvertido = markdown;
        this.etapa.set('gravacao');
        const conteudo = { tipo, titulo, markdown };
        const identificador = JSON.stringify([tipo, titulo]);
        const chave = this.chaves.get(identificador) ?? crypto.randomUUID();
        this.chaves.set(identificador, chave);
        return this.documentosService.criar(conteudo, chave);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: ({ id }) => {
        this.notificarAvisos();
        this.toast.success('Documento criado.');
        this.documentoCriado({ id, titulo });
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

  carregarDocumentos(criado?: DocumentoListagem): void {
    if (!this.podeConsultarDocumentos()) return;

    this.consultaDocumentos?.unsubscribe();
    this.carregandoDocumentos.set(true);
    this.erroDocumentos.set('');
    const incluirCriado = (items: DocumentoListagem[]) => {
      if (criado && !items.some(item => item.id === criado.id)) return [criado, ...items];
      return items;
    };
    let totalRecebido = 0;
    this.consultaDocumentos = this.documentosService.listar().pipe(
      expand(({ items, total }, pagina) => {
        totalRecebido += items.length;
        return items.length && totalRecebido < total ? this.documentosService.listar(pagina + 2) : EMPTY;
      }),
      reduce((lista, { items }) => lista.concat(items), [] as DocumentoListagem[]),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregandoDocumentos.set(false)),
    ).subscribe({
      next: items => this.documentos.set(incluirCriado(items)),
      error: () => {
        this.documentos.update(incluirCriado);
        this.erroDocumentos.set('Não foi possível atualizar o acervo.');
      },
    });
  }

  carregarEventos(): void {
    if (this.carregandoEventos()) return;

    const dataFinal = somarDias(this.hoje, 365);
    const consulta: Observable<{ items: EventoCalendarioItem[]; dataMinimaCadastro?: string }> = this.permissoes.tem('eventos.consultar')
      ? this.eventosService.listar({ dataInicial: this.hoje, dataFinal })
      : this.eventosService.listarMeusEventos();

    this.carregandoEventos.set(true);
    this.erroEventos.set('');
    consulta.pipe(
      take(1),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregandoEventos.set(false)),
    ).subscribe({
      next: resposta => {
        this.dataMinimaEvento.set(resposta.dataMinimaCadastro ?? '');
        this.eventos.set(resposta.items.filter(evento =>
          evento.dataEvento >= this.hoje && evento.dataEvento <= dataFinal,
        ).sort((a, b) => a.dataEvento.localeCompare(b.dataEvento) || a.id.localeCompare(b.id)));
      },
      error: erro => this.erroEventos.set(erroEvento(erro)),
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
    this.operacao = undefined;
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
