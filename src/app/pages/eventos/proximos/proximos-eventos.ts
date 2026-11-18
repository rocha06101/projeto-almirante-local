import { Component, ElementRef, Input, OnChanges, QueryList, ViewChild, ViewChildren, afterEveryRender, output } from '@angular/core';
import { EventoDto } from '../../../core/models/evento.model';
import { corEvento, dataCivil, grupoEvento, nomeEvento, rotuloData } from '../eventos.utils';

@Component({
  selector: 'app-proximos-eventos',
  template: `
    <aside aria-labelledby="proximos-titulo" [attr.aria-busy]="carregando">
      <h2 id="proximos-titulo">Próximos eventos</h2>
      @if (carregando) { <p role="status">Carregando próximos eventos…</p> }
      @else if (erro) {
        <p role="alert">{{ erro }}</p><button class="retry" type="button" (click)="recarregar.emit()">Tentar novamente</button>
      } @else {
        <div class="upcoming-list" #lista>
          @for (evento of visiveis(); track evento.id) {
            <button #card type="button" [class]="'upcoming-card ' + corEvento(evento)"
              [class.selected]="evento.id === selectedEventId" [attr.aria-pressed]="evento.id === selectedEventId"
              [attr.data-event-id]="evento.id" (click)="selecionarEvento.emit(evento.id)">
              <span class="date-badge" [class.today]="evento.dataEvento === hoje">{{ rotuloData(evento.dataEvento, hoje) }}</span>
              <strong>{{ nomeEvento(evento) }}</strong>
              <span class="meta"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>{{ evento.local }}</span>
              <span class="meta"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8m1 3a6 6 0 0 1 4 6"/></svg>{{ evento.quantidadeMembros }} participantes</span>
              @if (grupoEvento(evento, eventos)) { <small>{{ grupoEvento(evento, eventos) }} · mesmo passeio</small> }
            </button>
          } @empty { <p class="empty">Nenhum evento nos próximos 366 dias.</p> }
        </div>
        @if (eventos.length > tamanho) {
          <nav aria-label="Paginação de próximos eventos">
            <button type="button" aria-label="Eventos anteriores" [disabled]="pagina === 0" (click)="pagina = pagina - 1">‹</button>
            <span aria-live="polite">{{ pagina + 1 }} de {{ totalPaginas() }}</span>
            <button type="button" aria-label="Mais eventos" [disabled]="pagina + 1 >= totalPaginas()" (click)="pagina = pagina + 1">›</button>
          </nav>
        }
      }
    </aside>
  `,
  styleUrl: './proximos-eventos.scss',
})
export class ProximosEventos implements OnChanges {
  @Input() eventos: EventoDto[] = [];
  @Input() selectedEventId: string | null = null;
  @ViewChild('lista') lista?: ElementRef<HTMLElement>;
  @ViewChildren('card') cards!: QueryList<ElementRef<HTMLButtonElement>>;
  private rolarSelecionado = false;
  @Input() carregando = false;
  @Input() erro = '';
  @Input() hoje = dataCivil(new Date());
  readonly selecionarEvento = output<string>();
  readonly recarregar = output<void>();
  readonly tamanho = 3;
  pagina = 0;
  readonly corEvento = corEvento;
  readonly rotuloData = rotuloData;
  readonly nomeEvento = nomeEvento;
  readonly grupoEvento = grupoEvento;
  constructor() {
    afterEveryRender(() => {
      if (!this.rolarSelecionado || !this.lista) return;
      const card = this.cards.find(c => c.nativeElement.dataset['eventId'] === this.selectedEventId)?.nativeElement;
      if (!card) return;
      this.rolarSelecionado = false;
      // Rola apenas o contêiner, sem mover a página ou o foco do calendário.
      const lista = this.lista.nativeElement;
      const item = card.getBoundingClientRect(), area = lista.getBoundingClientRect();
      if (item.top < area.top) lista.scrollTop += item.top - area.top;
      else if (item.bottom > area.bottom) lista.scrollTop += item.bottom - area.bottom;
    });
  }
  ngOnChanges(): void {
    const indice = this.eventos.findIndex(e => e.id === this.selectedEventId);
    this.pagina = indice >= 0 ? Math.floor(indice / this.tamanho) : Math.min(this.pagina, Math.max(0, this.totalPaginas() - 1));
    this.rolarSelecionado = indice >= 0;
  }
  visiveis() { return this.eventos.slice(this.pagina * this.tamanho, (this.pagina + 1) * this.tamanho); }
  totalPaginas() { return Math.ceil(this.eventos.length / this.tamanho); }
}
