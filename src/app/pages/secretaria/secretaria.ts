import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subscription, expand, finalize, reduce, take } from 'rxjs';
import { EventoCalendarioItem } from '../../core/models/evento.model';
import { EventosService } from '../../core/services/eventos';
import { RouterLink } from '@angular/router';
import { ConteudoDocumento, DocumentoListagem, DocumentosService, PERMISSAO_DOCUMENTOS } from '../../core/services/documentos';
import { CriarDocumentoDialog } from './criar-documento-dialog';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { ExcluirUsuarioDialog } from '../desbravadores/excluir-usuario-dialog';
import { normalizar, UsuariosListagem } from '../desbravadores/usuarios-listagem';
import { EventoDetalhes } from '../eventos/detalhes/evento-detalhes';
import { dataCivil, erroEvento, somarDias } from '../eventos/eventos.utils';
import { ProximosEventos } from '../eventos/proximos/proximos-eventos';
import { GradeRolavel } from './grade-rolavel';

@Component({
  selector: 'app-secretaria',
  imports: [CdkMenuModule, ExcluirUsuarioDialog, ProximosEventos, EventoDetalhes, RefreshButton, GradeRolavel, RouterLink, CriarDocumentoDialog],
  templateUrl: './secretaria.html',
  styleUrl: './secretaria.scss',
})
export class Secretaria extends UsuariosListagem implements OnInit {
  private readonly eventosService = inject(EventosService);
  private readonly documentosService = inject(DocumentosService);
  private consultaDocumentos?: Subscription;
  readonly criandoDocumento = signal(false);
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

  documentoCriado(documento: DocumentoListagem): void {
    this.criandoDocumento.set(false);
    this.carregarDocumentos(documento);
  }

  abrirTemplate(template: Pick<ConteudoDocumento, 'tipo' | 'markdown'>): void {
    this.criandoDocumento.set(false);
    void this.router.navigate(['/secretaria/documentos/novo'], { info: template });
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
}
