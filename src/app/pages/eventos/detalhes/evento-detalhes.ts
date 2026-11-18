import { A11yModule, CdkTrapFocus } from '@angular/cdk/a11y';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, HostListener, Injector, Input, OnInit, ViewChild, afterNextRender, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, finalize, of, switchMap } from 'rxjs';
import { EventoDto } from '../../../core/models/evento.model';
import { EventosService } from '../../../core/services/eventos';
import { PermissoesService } from '../../../core/services/permissoes';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/services/user';
import { EventoFormulario } from '../formulario/evento-formulario';
import { erroEvento, formatarData, liquidacaoConfirmavel, motivoValido, nomeEvento, respostaIncerta } from '../eventos.utils';

type DestinoSaida = 'fechar' | 'voltar' | 'estorno';

@Component({
  selector: 'app-evento-detalhes', imports: [A11yModule, FormsModule, CurrencyPipe, EventoFormulario],
  templateUrl: './evento-detalhes.html', styleUrl: './evento-detalhes.scss',
})
export class EventoDetalhes implements OnInit {
  @Input() id: string | null = null;
  @Input() data = '';
  @Input() dataMinima = '';
  readonly fechar = output<void>();
  readonly atualizado = output<void>();
  readonly api = inject(EventosService);
  readonly acesso = inject(PermissoesService);
  private readonly usuarios = inject(User);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  @ViewChild(CdkTrapFocus) foco!: CdkTrapFocus;
  @ViewChild(EventoFormulario) formulario?: EventoFormulario;
  @ViewChild('continuarEdicao') continuarEdicao?: ElementRef<HTMLButtonElement>;
  @ViewChild('dialogBody') corpo!: ElementRef<HTMLElement>;
  private readonly consulta = new Subject<string>();
  readonly evento = signal<EventoDto | null>(null);
  readonly relacionados = signal<EventoDto[]>([]);
  readonly nomes = signal<Record<string, string>>({});
  readonly carregando = signal(false);
  readonly ocupado = signal(false);
  readonly erro = signal('');
  readonly erroGrupo = signal('');
  readonly conflito = signal(false);
  readonly incerto = signal(false);
  readonly motivoValido = motivoValido;
  readonly liquidacaoConfirmavel = liquidacaoConfirmavel;
  readonly nomeEvento = nomeEvento;
  readonly formatarData = formatarData;
  modo: 'detalhes' | 'editar' | 'criar' | 'excluir' | 'estornar' = 'detalhes';
  descarte: DestinoSaida | null = null;
  private focoAntesDescarte: HTMLElement | null = null;
  motivo = '';
  confirmaExclusao = false;
  confirmaEstorno = false;
  alvoEstorno: { eventoId: string; membroId: string; versao: string } | null = null;
  private focoAntesEstorno: HTMLElement | null = null;

  ngOnInit(): void {
    this.consulta.pipe(switchMap(id => {
      this.carregando.set(true); this.evento.set(null); this.relacionados.set([]);
      this.erro.set(''); this.erroGrupo.set(''); this.modo = 'detalhes';
      this.alvoEstorno = null; this.motivo = ''; this.confirmaExclusao = false; this.confirmaEstorno = false;
      return this.api.obter(id).pipe(switchMap(evento => {
        this.evento.set(evento); this.conflito.set(false); this.incerto.set(false);
        return this.api.listar({ dataInicial: evento.dataEvento, dataFinal: evento.dataEvento }).pipe(
          catchError(e => { this.erroGrupo.set(erroEvento(e)); return of(null); }),
        );
      }), catchError(e => { this.erro.set(erroEvento(e)); return of(null); }), finalize(() => this.carregando.set(false)));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(r => {
      if (r) {
        this.dataMinima = r.dataMinimaCadastro;
        this.relacionados.set(r.items.filter(e => e.eventoGrupoId === this.evento()?.eventoGrupoId));
      }
    });
    if (this.id) this.carregar(this.id); else this.modo = 'criar';
    if (this.acesso.tem('membros.consultar') && this.id) this.usuarios.listarMembros().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => this.nomes.set(Object.fromEntries(m.map(v => [v.id, v.nome]))),
      // O detalhe continua legível pelos IDs reais quando a consulta de nomes falha.
      error: () => {},
    });
  }
  carregar(id = this.id): void { if (id && !this.ocupado()) { this.id = id; if (this.incerto()) this.atualizado.emit(); this.consulta.next(id); this.focarInicio(); } }
  editar(): void {
    if (this.acesso.tem('eventos.editar') && this.evento() && !this.ocupado() && !this.incerto() && !this.conflito() && !this.carregando() && !this.erroGrupo()) { this.modo = 'editar'; this.focarInicio(); }
  }
  pedirExclusao(): void {
    if (!this.evento() || !this.acesso.tem('eventos.excluir') || this.ocupado() || this.incerto() || this.conflito() || this.exclusaoBloqueada()) return;
    this.erro.set(''); this.motivo = ''; this.confirmaExclusao = false; this.modo = 'excluir';
    this.focarInicio();
  }
  excluir(): void {
    const e = this.evento();
    if (!e || this.modo !== 'excluir' || this.ocupado() || this.conflito() || this.incerto() || !this.confirmaExclusao || !motivoValido(this.motivo) ||
      !this.acesso.tem('eventos.excluir') || this.exclusaoBloqueada()) return;
    this.ocupado.set(true); this.erro.set('');
    this.api.excluir(e.id, e.versao, this.motivo.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.ocupado.set(false))).subscribe({
      next: () => { this.toast.success('Evento excluído. Cobranças em aberto desativadas; histórico de pagamentos preservado.'); this.atualizado.emit(); this.fechar.emit(); },
      error: err => this.falhaFinanceira(err),
    });
  }
  exclusaoBloqueada(): boolean {
    return !this.evento() || liquidacaoConfirmavel(this.evento()!) === false;
  }
  participantesComHistorico(): string[] {
    const e = this.evento();
    return e ? [...new Set([...e.membros, ...e.lancamentos.map(l => l.membroId), ...(e.devolucoes ?? []).map(d => d.membroId)])] : [];
  }
  podeEstornar(membroId: string): boolean {
    const e = this.evento();
    return !!e && Array.isArray(e.devolucoes) && this.acesso.tem('eventos.editar') &&
      e.lancamentos.some(l => l.membroId === membroId && l.status === 'Pago');
  }
  pedirEstorno(membroId: string): void {
    const e = this.evento();
    if (!e || !this.podeEstornar(membroId) || this.ocupado() || this.carregando() || this.incerto() || this.conflito()) return;
    this.focoAntesEstorno = document.activeElement as HTMLElement | null;
    this.alvoEstorno = { eventoId: e.id, membroId, versao: e.versao };
    this.motivo = ''; this.confirmaEstorno = false; this.erro.set(''); this.modo = 'estornar'; this.focarInicio();
  }
  cancelarEstorno(): void {
    if (this.ocupado()) return;
    this.modo = 'detalhes'; this.alvoEstorno = null; this.motivo = ''; this.confirmaEstorno = false;
    afterNextRender(() => {
      const botoes = this.corpo.nativeElement.querySelectorAll<HTMLButtonElement>('[data-estorno]');
      const id = this.focoAntesEstorno?.getAttribute('data-estorno');
      Array.from(botoes).find(b => b.getAttribute('data-estorno') === id)?.focus();
    }, { injector: this.injector });
  }
  estornar(): void {
    const alvo = this.alvoEstorno, e = this.evento();
    if (!alvo || !e || this.modo !== 'estornar' || this.ocupado() || this.incerto() || this.conflito() ||
      !this.confirmaEstorno || !this.podeEstornar(alvo.membroId) || !motivoValido(this.motivo) ||
      alvo.eventoId !== e.id || alvo.versao !== e.versao) return;
    this.ocupado.set(true); this.erro.set('');
    this.api.estornarParticipante(alvo.eventoId, alvo.membroId, { motivo: this.motivo.trim(), versao: alvo.versao })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.ocupado.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Solicitação de estorno registrada. A devolução aguarda processamento pela tesouraria.');
          this.ocupado.set(false); this.atualizado.emit(); this.carregar(alvo.eventoId);
        },
        error: err => this.falhaFinanceira(err),
      });
  }
  private falhaFinanceira(err: unknown): void {
    const mensagem = erroEvento(err);
    this.erro.set(mensagem); this.toast.error(mensagem);
    this.conflito.set(err instanceof HttpErrorResponse && err.status === 409);
    this.incerto.set(respostaIncerta(err));
    this.confirmaEstorno = false; this.confirmaExclusao = false;
  }
  salvo(evento: EventoDto): void {
    this.ocupado.set(false); this.atualizado.emit();
    // Após editar, o GET é a fonte do estado atual dos detalhes.
    if (this.modo === 'criar') this.fechar.emit();
    else this.carregar(evento.id);
  }
  reconciliar(): void {
    if (this.ocupado()) return;
    this.atualizado.emit(); this.carregar();
  }
  nomeMembro(id: string): string { return this.nomes()[id] || `Participante ${id}`; }
  private focarInicio(): void {
    // O botão de origem sai do DOM na troca de modo; preserva o foco dentro do diálogo.
    afterNextRender(() => {
      this.corpo.nativeElement.scrollTop = 0;
      this.foco.focusTrap.focusInitialElement();
    }, { injector: this.injector });
  }
  @HostListener('document:keydown.escape', ['$event'])
  escape(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation();
    if (this.descarte) this.continuarEditando();
    else this.sair();
  }
  cliqueBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.sair(); }
  sair(destino: DestinoSaida = 'fechar'): void {
    if (this.ocupado() || this.descarte) return;
    if (this.formulario?.temAlteracoes() || (this.modo === 'estornar' && !!this.motivo.trim())) {
      this.focoAntesDescarte = document.activeElement as HTMLElement | null;
      this.descarte = destino;
      afterNextRender(() => this.continuarEdicao?.nativeElement.focus(), { injector: this.injector });
    } else this.concluirSaida(destino);
  }
  continuarEditando(): void {
    this.descarte = null;
    afterNextRender(() => this.focoAntesDescarte?.focus(), { injector: this.injector });
  }
  descartar(): void {
    if (!this.descarte || this.ocupado()) return;
    const destino = this.descarte;
    this.descarte = null;
    this.concluirSaida(destino);
  }
  private concluirSaida(destino: DestinoSaida): void {
    if (destino === 'estorno') this.cancelarEstorno();
    else if (destino === 'voltar') this.carregar();
    else this.fechar.emit();
  }
}
