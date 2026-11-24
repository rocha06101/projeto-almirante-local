import { ChangeDetectorRef, Component, DestroyRef, ElementRef, Input, OnChanges, QueryList, SimpleChanges, ViewChildren, afterEveryRender, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, interval } from 'rxjs';
import { EventoCalendarioItem } from '../../../core/models/evento.model';
import { corEvento, dataCivil, grupoEvento, nomeEvento, rotuloData } from '../eventos.utils';

@Component({
  selector: 'app-proximos-eventos',
  template: `
    <aside [class.cards-grid]="emGrade" aria-labelledby="proximos-titulo" [attr.aria-busy]="carregando">
      <header class="section-header">
        <h2 id="proximos-titulo">{{ titulo }}</h2>
        <ng-content select="[acoes-cabecalho]" />
      </header>
      @if (carregando) { <p role="status">Carregando próximos eventos…</p> }
      @else if (erro) {
        <p role="alert">{{ erro }}</p><button class="retry" type="button" (click)="recarregar.emit()">Tentar novamente</button>
      } @else {
        <div class="cards-viewport" [class.em-transicao]="transicao"
          [style.--direcao]="transicao?.direcao"
          [style.--cards-por-pagina]="tamanhoPagina"
          [style.--linhas-extras]="linhasExtras">
          @for (paginaCards of paginasRenderizadas(); track paginaCards) {
            <div class="upcoming-list"
              [class.saindo]="transicao && paginaCards === pagina"
              [class.entrando]="paginaCards === transicao?.destino"
              [class.paginada]="emGrade && totalPaginas() > 1"
              [attr.inert]="transicao && paginaCards === pagina ? '' : null"
              [attr.aria-hidden]="transicao && paginaCards === pagina ? 'true' : null">
              @for (evento of eventosDaPagina(paginaCards); track evento.id; let indice = $index) {
                <button #card type="button" [class]="'upcoming-card ' + corEvento(evento)"
                  [class.selected]="evento.id === selectedEventId" [attr.aria-pressed]="emGrade ? null : evento.id === selectedEventId"
                  [attr.aria-haspopup]="emGrade ? 'dialog' : null"
                  [style.--atraso]="atrasoCard(indice)"
                  (animationend)="concluirTransicao(paginaCards, indice)"
                  (animationcancel)="concluirTransicao(paginaCards, indice)"
                  [attr.data-event-id]="evento.id" (click)="selecionarEvento.emit(evento.id)">
                  <span class="date-badge" [class.today]="evento.dataEvento === hoje">{{ rotuloData(evento.dataEvento, hoje) }}</span>
                  <strong [attr.title]="emGrade ? nomeEvento(evento) : null">{{ nomeEvento(evento) }}</strong>
                  <span class="meta"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span class="meta-text" [attr.title]="emGrade ? evento.local : null">{{ evento.local }}</span></span>
                  @if (evento.quantidadeMembros != null) {
                    <span class="meta"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m1 3a6 6 0 0 1 4 6"/></svg><span class="meta-text">{{ evento.quantidadeMembros }} participantes</span></span>
                  }
                  @if (grupoEvento(evento, eventos)) { <small>{{ grupoEvento(evento, eventos) }} · mesmo passeio</small> }
                </button>
              } @empty { <p class="empty">Nenhum evento nos próximos 366 dias.</p> }
              @for (espaco of espacosVazios(paginaCards); track espaco) {
                <span class="card-slot" aria-hidden="true"></span>
              }
            </div>
          }
        </div>
        @if (totalPaginas() > 1) {
          <nav aria-label="Paginação de próximos eventos">
            <button type="button" aria-label="Eventos anteriores" [disabled]="pagina === 0" [attr.aria-disabled]="transicao ? true : null" (click)="mudarPagina(pagina - 1, -1)">‹</button>
            <span [attr.aria-live]="intervaloRotacao ? 'off' : 'polite'">
              {{ pagina + 1 }} de {{ totalPaginas() }}
            </span>
            <button type="button" aria-label="Mais eventos" [disabled]="pagina + 1 >= totalPaginas()" [attr.aria-disabled]="transicao ? true : null" (click)="mudarPagina(pagina + 1, 1)">›</button>
          </nav>
        }
      }
    </aside>
  `,
  styleUrl: './proximos-eventos.scss',
})
export class ProximosEventos implements OnChanges {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetector = inject(ChangeDetectorRef);

  @Input() intervaloRotacao = 0;
  @Input() detalhesAbertos = false;
  @Input() emGrade = false;
  @Input() tamanhoPagina = 5;
  @Input() titulo = 'Próximos eventos';
  @Input() eventos: EventoCalendarioItem[] = [];
  @Input() selectedEventId: string | null = null;
  @Input() pedidoDeRolagem = 0;
  @ViewChildren('card') cards!: QueryList<ElementRef<HTMLButtonElement>>;
  private rolarSelecionado = false;
  private rotacao?: Subscription;
  @Input() carregando = false;
  @Input() erro = '';
  @Input() hoje = dataCivil(new Date());
  readonly selecionarEvento = output<string>();
  readonly recarregar = output<void>();
  pagina = 0;
  transicao: { destino: number; direcao: 1 | -1; quantidadeSaida: number; ultimoDaEntrada: number } | null = null;
  linhasExtras = 0;
  readonly corEvento = corEvento;
  readonly rotuloData = rotuloData;
  readonly nomeEvento = nomeEvento;
  readonly grupoEvento = grupoEvento;

  constructor() {
    afterEveryRender({
      write: () => {
        if (!this.rolarSelecionado || this.carregando) return;
        this.rolarSelecionado = false;
        const card = this.cards.find(c => c.nativeElement.dataset['eventId'] === this.selectedEventId);
        card?.nativeElement.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      },
    });
  }

  private configurarRotacao(): void {
    this.rotacao?.unsubscribe();
    if (this.intervaloRotacao <= 0 || this.totalPaginas() < 2 || this.carregando || this.erro) return;

    this.rotacao = interval(this.intervaloRotacao).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const elemento = this.host.nativeElement;
      const paginas = this.totalPaginas();
      if (this.detalhesAbertos || elemento.ownerDocument.hidden ||
          elemento.matches(':hover, :focus-within')) return;

      this.mudarPagina((this.pagina + 1) % paginas, 1);
      this.changeDetector.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['eventos'] || changes['tamanhoPagina'] || changes['carregando'] || changes['erro']) {
      this.transicao = null;
    }
    if (changes['eventos'] && this.emGrade) {
      this.linhasExtras = Number(this.eventos.some(evento => evento.quantidadeMembros != null)) +
        Number(this.eventos.some(evento => evento.eventoGrupoId));
    }
    this.pagina = Math.min(this.pagina, Math.max(0, this.totalPaginas() - 1));
    if (changes['intervaloRotacao'] || changes['eventos'] || changes['tamanhoPagina'] ||
        changes['carregando'] || changes['erro']) {
      this.configurarRotacao();
    }
    if (changes['pedidoDeRolagem'] && !changes['pedidoDeRolagem'].firstChange) this.rolarSelecionado = true;
    else if (changes['selectedEventId']) this.rolarSelecionado = false;
    if (!this.rolarSelecionado || this.carregando) return;

    const indice = this.erro ? -1 : this.eventos.findIndex(e => e.id === this.selectedEventId);
    if (indice < 0) {
      this.rolarSelecionado = false;
      return;
    }
    this.pagina = Math.floor(indice / this.tamanhoPagina);
  }

  mudarPagina(destino: number, direcao: 1 | -1): void {
    if (this.transicao || destino === this.pagina || destino < 0 || destino >= this.totalPaginas()) return;

    this.rolarSelecionado = false;
    if (!this.emGrade || this.host.nativeElement.ownerDocument.defaultView
      ?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.pagina = destino;
      return;
    }

    this.transicao = {
      destino,
      direcao,
      quantidadeSaida: this.eventosDaPagina(this.pagina).length,
      ultimoDaEntrada: direcao === 1 ? 0 : this.eventosDaPagina(destino).length - 1,
    };
  }

  concluirTransicao(paginaCards: number, indice: number): void {
    if (!this.transicao || paginaCards !== this.transicao.destino || indice !== this.transicao.ultimoDaEntrada) return;
    this.pagina = this.transicao.destino;
    this.transicao = null;
  }

  atrasoCard(indice: number): string | null {
    if (!this.transicao) return null;
    const { direcao, quantidadeSaida } = this.transicao;
    // Na entrada, as posições compartilhadas mantêm o atraso da saída correspondente.
    return `${42 * (direcao === 1 ? quantidadeSaida - 1 - indice : indice)}ms`;
  }

  paginasRenderizadas(): number[] {
    return this.transicao ? [this.pagina, this.transicao.destino] : [this.pagina];
  }

  eventosDaPagina(pagina: number): EventoCalendarioItem[] {
    const inicio = pagina * this.tamanhoPagina;
    return this.eventos.slice(inicio, inicio + this.tamanhoPagina);
  }

  espacosVazios(pagina: number): number[] {
    if (!this.emGrade || this.totalPaginas() < 2) return [];
    const total = this.tamanhoPagina - this.eventosDaPagina(pagina).length;
    return Array.from({ length: total }, (_, indice) => indice);
  }

  totalPaginas() {
    return Math.ceil(this.eventos.length / this.tamanhoPagina);
  }
}
