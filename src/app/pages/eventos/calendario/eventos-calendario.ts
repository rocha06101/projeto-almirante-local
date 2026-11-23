import { Component, DestroyRef, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild, ViewEncapsulation, afterNextRender, inject, output, signal } from '@angular/core';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import ptBr from '@fullcalendar/core/locales/pt-br';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventoCalendarioItem, PeriodoEventos } from '../../../core/models/evento.model';
import { dataCivil, formatarData, mapearEventos, periodoInclusivo } from '../eventos.utils';

@Component({
  selector: 'app-eventos-calendario',
  imports: [FullCalendarModule],
  template: `
    <nav class="calendar-toolbar" aria-label="Navegação do calendário">
      <div class="month-navigation">
        <button type="button" aria-label="Mês anterior" (click)="calendar.getApi().prev()">←</button>
        <div class="period-picker" #seletor>
          <h2 aria-live="polite">
            <button #mesBotao type="button" [attr.aria-expanded]="painel() === 'mes'"
              (click)="alternar('mes')">{{ meses[mes()] }}</button>
            <span> de </span>
            <button #anoBotao type="button" [attr.aria-expanded]="painel() === 'ano'"
              (click)="alternar('ano')">{{ ano() }}</button>
          </h2>
          @if (painel()) {
            <div class="period-popover" role="group" [attr.aria-label]="painel() === 'mes' ? 'Selecionar mês' : 'Selecionar ano'">
              @if (painel() === 'mes') {
                <div class="period-options">
                  @for (nome of meses; track nome; let i = $index) {
                    <button type="button" [attr.aria-label]="nome" [attr.aria-pressed]="i === mes()"
                      (click)="irPara(i, ano())">{{ nome.slice(0, 3) }}</button>
                  }
                </div>
              } @else {
                <div class="year-range">
                  <button type="button" aria-label="Faixa de anos anterior" [disabled]="inicioFaixa() <= 1" (click)="mudarFaixa(-9)">←</button>
                  <span aria-live="polite">{{ inicioFaixa() }}–{{ anos().at(-1) }}</span>
                  <button type="button" aria-label="Próxima faixa de anos" [disabled]="inicioFaixa() >= 9991" (click)="mudarFaixa(9)">→</button>
                </div>
                <div class="period-options">
                  @for (opcao of anos(); track opcao) {
                    <button type="button" [attr.aria-pressed]="opcao === ano()" (click)="irPara(mes(), opcao)">{{ opcao }}</button>
                  }
                </div>
              }
            </div>
          }
        </div>
        <button type="button" aria-label="Próximo mês" (click)="calendar.getApi().next()">→</button>
      </div>
      <button type="button" class="today-button" (click)="hoje()">Hoje</button>
    </nav>
    <full-calendar #calendar [options]="opcoes" [events]="eventosVisuais">
      <ng-template #dayCellContent let-arg>
        <button type="button" class="day-button" [attr.aria-label]="formatarData(dataCivil(arg.date))"
          [attr.aria-pressed]="selecionada === dataCivil(arg.date)" [attr.aria-current]="arg.isToday ? 'date' : null"
          (click)="$event.stopPropagation(); selecionarDia.emit(dataCivil(arg.date))"><span>{{ arg.dayNumberText }}</span></button>
      </ng-template>
      <ng-template #eventContent let-arg>
        <span class="calendar-event" [title]="arg.event.title">
          <strong>{{ arg.event.title }}</strong>
        </span>
      </ng-template>
    </full-calendar>
  `,
  styleUrl: './eventos-calendario.scss',
  // FullCalendar renderiza descendentes próprios. Todo seletor é limitado ao host desta tela.
  encapsulation: ViewEncapsulation.None,
})
export class EventosCalendario implements OnChanges {
  @Input() eventos: EventoCalendarioItem[] = [];
  @Input() selecionada = '';
  @Input() selectedEventId: string | null = null;
  @ViewChild('calendar') calendar!: FullCalendarComponent;
  readonly periodo = output<PeriodoEventos>();
  readonly selecionarDia = output<string>();
  readonly selecionarEvento = output<string>();
  readonly voltarHoje = output<string>();
  @ViewChild('seletor') seletor!: ElementRef<HTMLElement>;
  @ViewChild('mesBotao') mesBotao!: ElementRef<HTMLButtonElement>;
  @ViewChild('anoBotao') anoBotao!: ElementRef<HTMLButtonElement>;
  readonly painel = signal<'mes' | 'ano' | null>(null);
  readonly mes = signal(new Date().getMonth());
  readonly ano = signal(new Date().getFullYear());
  readonly inicioFaixa = signal(this.ano() - 2);
  readonly meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  alternar(tipo: 'mes' | 'ano'): void {
    if (tipo === 'ano') this.inicioFaixa.set(Math.max(1, Math.min(9991, this.ano() - 2)));
    this.painel.set(this.painel() === tipo ? null : tipo);
  }

  mudarFaixa(delta: number): void {
    this.inicioFaixa.update(inicio => Math.max(1, Math.min(9991, inicio + delta)));
  }

  anos(): number[] {
    return Array.from({ length: 9 }, (_, i) => this.inicioFaixa() + i);
  }

  irPara(mes: number, ano: number): void {
    this.fecharSeletor(true);
    const data = new Date();
    data.setFullYear(ano, mes, 1);
    this.calendar.getApi().gotoDate(data);
  }

  mostrarData(data: string): void {
    const [ano, mes] = data.split('-').map(Number);
    if (ano !== this.ano() || mes - 1 !== this.mes()) this.irPara(mes - 1, ano);
  }

  @HostListener('document:click', ['$event'])
  cliqueFora(evento: MouseEvent): void {
    if (this.painel() && !this.seletor.nativeElement.contains(evento.target as Node)) this.fecharSeletor();
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    this.fecharSeletor(true);
  }

  private fecharSeletor(restaurarFoco = false): void {
    const aberto = this.painel();
    if (!aberto) return;
    this.painel.set(null);
    if (restaurarFoco) (aberto === 'mes' ? this.mesBotao : this.anoBotao).nativeElement.focus();
  }
  readonly dataCivil = dataCivil;
  readonly formatarData = formatarData;
  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      let largura = 0;
      let altura = 0;
      let quadro = 0;
      const observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        if (Math.abs(width - largura) < 1 && Math.abs(height - altura) < 1) return;
        largura = width; altura = height;
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => {
          const desktop = window.matchMedia('(min-width: 992px)').matches;
          const api = this.calendar.getApi();
          api.setOption('height', desktop ? '100%' : 'auto');
          api.setOption('dayMaxEvents', desktop && window.innerHeight < 800 ? 1 : 2);
          api.updateSize();
        });
      });
      observer.observe(host.nativeElement);
      destroyRef.onDestroy(() => { observer.disconnect(); cancelAnimationFrame(quadro); });
    });
  }
  eventosVisuais = mapearEventos([]);
  opcoes: CalendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin], initialView: 'dayGridMonth', locale: ptBr,
    firstDay: 1, fixedWeekCount: false, dayMaxEvents: 2, headerToolbar: false,
    height: 'auto', displayEventTime: false, eventDisplay: 'block', eventInteractive: true,
    dayHeaderFormat: { weekday: 'short' },
    dayHeaderContent: arg => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][arg.dow],
    datesSet: arg => {
      this.mes.set(arg.view.currentStart.getMonth());
      this.ano.set(arg.view.currentStart.getFullYear());
      this.periodo.emit(periodoInclusivo(arg.start, arg.end));
    },
    dateClick: arg => {
      // O botão do dia já trata seu próprio clique, inclusive por teclado.
      const alvo = arg.jsEvent.target;
      if (alvo instanceof Element && alvo.closest('.day-button')) return;
      this.selecionarDia.emit(arg.dateStr);
    },
    eventClick: arg => {
      arg.jsEvent.preventDefault();
      arg.jsEvent.stopPropagation();
      this.selecionarEvento.emit(arg.event.id);
    },
  };
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['eventos']) this.eventosVisuais = mapearEventos(this.eventos);
    this.opcoes = { ...this.opcoes,
      eventClassNames: arg => arg.event.id === this.selectedEventId ? ['selected-event'] : [],
      dayCellClassNames: arg => dataCivil(arg.date) === this.selecionada ? ['selected-day'] : [],
    };
  }
  hoje(): void {
    this.calendar.getApi().today();
    this.voltarHoje.emit(dataCivil(new Date()));
  }
}
