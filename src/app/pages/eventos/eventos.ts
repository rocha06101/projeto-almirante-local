import { Component, DestroyRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, finalize, of, map, startWith, switchMap } from 'rxjs';
import { EventoDto, PeriodoEventos } from '../../core/models/evento.model';
import { EventosService } from '../../core/services/eventos';
import { PermissoesService } from '../../core/services/permissoes';
import { EventosCalendario } from './calendario/eventos-calendario';
import { ProximosEventos } from './proximos/proximos-eventos';
import { EventoDetalhes } from './detalhes/evento-detalhes';
import { dataCivil, erroEvento, somarDias } from './eventos.utils';

@Component({
  selector: 'app-eventos', imports: [EventosCalendario, ProximosEventos, EventoDetalhes],
  providers: [EventosService],
  templateUrl: './eventos.html', styleUrl: './eventos.scss',
})
export class Eventos implements OnInit {
  private readonly api = inject(EventosService);
  readonly acesso = inject(PermissoesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly periodos = new Subject<PeriodoEventos>();
  private readonly atualizarProximos = new Subject<void>();
  private periodoAtual: PeriodoEventos | null = null;
  readonly hoje = dataCivil(new Date());
  readonly selecionada = signal(this.hoje);
  readonly eventos = signal<EventoDto[]>([]);
  readonly proximos = signal<EventoDto[]>([]);
  readonly carregando = signal(false);
  readonly carregandoProximos = signal(false);
  readonly erro = signal('');
  readonly erroProximos = signal('');
  readonly dataMinima = signal('');
  readonly modal = signal<{ id: string | null; data: string } | null>(null);
  readonly selectedEventId = signal<string | null>(null);
  readonly pedidoDeRolagem = signal(0);
  private diaSelecionadoPorClique = false;
  @ViewChild(EventosCalendario) private calendario?: EventosCalendario;

  ngOnInit(): void {
    this.periodos.pipe(switchMap(periodo => {
      this.carregando.set(true); this.erro.set('');
      return this.api.listar(periodo).pipe(catchError(e => { this.erro.set(erroEvento(e)); return of(null); }), finalize(() => this.carregando.set(false)), map(resposta => ({ resposta, periodo })));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ resposta: r, periodo }) => {
      if (r) { this.validarSelecao(r.items, periodo); this.eventos.set(r.items); this.dataMinima.set(r.dataMinimaCadastro); }
    });
    this.atualizarProximos.pipe(startWith(undefined), switchMap(() => {
      if (!this.acesso.tem('eventos.consultar')) return of(null);
      this.carregandoProximos.set(true); this.erroProximos.set('');
      return this.api.listar({ dataInicial: this.hoje, dataFinal: somarDias(this.hoje, 365) }).pipe(
        catchError(e => { this.erroProximos.set(erroEvento(e)); return of(null); }), finalize(() => this.carregandoProximos.set(false)),
      );
    }), takeUntilDestroyed(this.destroyRef)).subscribe(r => {
      if (r) {
        this.validarSelecao(r.items, { dataInicial: this.hoje, dataFinal: somarDias(this.hoje, 365) }, this.eventos());
        this.proximos.set(r.items.filter(e => e.dataEvento >= this.hoje).sort((a, b) => a.dataEvento.localeCompare(b.dataEvento) || a.id.localeCompare(b.id)));
        this.dataMinima.set(r.dataMinimaCadastro);
      }
    });
  }
  mudarPeriodo(periodo: PeriodoEventos): void {
    if (!this.acesso.tem('eventos.consultar') || (this.periodoAtual?.dataInicial === periodo.dataInicial && this.periodoAtual?.dataFinal === periodo.dataFinal)) return;
    this.periodoAtual = periodo;
    if (this.selecionada() < periodo.dataInicial || this.selecionada() > periodo.dataFinal) {
      this.limparSelecao();
      this.selecionada.set('');
    }
    this.periodos.next(periodo);
  }
  recarregar(): void {
    if (!this.acesso.tem('eventos.consultar')) return;
    if (this.periodoAtual) this.periodos.next(this.periodoAtual);
    this.atualizarProximos.next();
  }
  recarregarProximos(): void { if (this.acesso.tem('eventos.consultar')) this.atualizarProximos.next(); }
  selecionarEvento(id: string, noCalendario = false): void {
    if (!this.acesso.tem('eventos.consultar') || this.modal()) return;
    const evento = this.eventos().find(e => e.id === id) ?? this.proximos().find(e => e.id === id);
    if (!evento) return;
    if (this.selectedEventId() === id) this.modal.set({ id, data: '' });
    this.selectedEventId.set(id);
    this.selecionada.set(evento.dataEvento);
    this.diaSelecionadoPorClique = false;
    if (noCalendario) this.pedidoDeRolagem.update(pedido => pedido + 1);
    else this.calendario?.mostrarData(evento.dataEvento);
  }
  private limparSelecao(): void {
    this.selectedEventId.set(null);
    this.diaSelecionadoPorClique = false;
  }
  private validarSelecao(items: EventoDto[], periodo: PeriodoEventos, eventosVisiveis: EventoDto[] = []): void {
    const id = this.selectedEventId();
    if (!id) return;
    const selecionado = items.find(e => e.id === id);
    if (selecionado) this.selecionada.set(selecionado.dataEvento);
    else if (this.selecionada() >= periodo.dataInicial && this.selecionada() <= periodo.dataFinal &&
        !eventosVisiveis.some(e => e.id === id)) this.limparSelecao();
  }
  voltarHoje(data: string): void { this.limparSelecao(); this.selecionada.set(data); }
  selecionarDia(data: string): void {
    if (!this.acesso.tem('eventos.consultar') || this.modal()) return;
    const repetirSelecao = this.diaSelecionadoPorClique && this.selecionada() === data;
    this.limparSelecao();
    this.selecionada.set(data);
    this.diaSelecionadoPorClique = true;
    if (repetirSelecao && this.acesso.tem('eventos.criar')) {
      this.modal.set({ id: null, data });
    }
  }
}
