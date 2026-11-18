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
import { custosBloqueados, erroEvento, formatarData, nomeEvento } from '../eventos.utils';

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
  readonly custosBloqueados = custosBloqueados;
  readonly nomeEvento = nomeEvento;
  readonly formatarData = formatarData;
  modo: 'detalhes' | 'editar' | 'criar' | 'excluir' = 'detalhes';
  descarte: 'fechar' | 'voltar' | null = null;
  private focoAntesDescarte: HTMLElement | null = null;
  motivo = '';
  confirmaExclusao = false;

  ngOnInit(): void {
    this.consulta.pipe(switchMap(id => {
      this.carregando.set(true); this.evento.set(null); this.relacionados.set([]);
      this.erro.set(''); this.erroGrupo.set(''); this.conflito.set(false); this.modo = 'detalhes';
      return this.api.obter(id).pipe(switchMap(evento => {
        this.evento.set(evento);
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
  carregar(id = this.id): void { if (id && !this.ocupado()) { this.id = id; this.consulta.next(id); this.focarInicio(); } }
  editar(): void {
    if (this.acesso.tem('eventos.editar') && !this.carregando() && !this.erroGrupo()) { this.modo = 'editar'; this.focarInicio(); }
  }
  pedirExclusao(): void {
    if (!this.acesso.tem('eventos.excluir') || custosBloqueados(this.evento())) return;
    this.erro.set(''); this.motivo = ''; this.confirmaExclusao = false; this.modo = 'excluir';
    this.focarInicio();
  }
  excluir(): void {
    const e = this.evento();
    if (!e || this.ocupado() || this.conflito() || !this.confirmaExclusao || !this.motivo.trim() || this.motivo.trim().length > 255 ||
      !this.acesso.tem('eventos.excluir') || custosBloqueados(e)) return;
    this.ocupado.set(true); this.erro.set('');
    this.api.excluir(e.id, e.versao, this.motivo.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.ocupado.set(false))).subscribe({
      next: () => { this.toast.success('Evento excluído. Lançamentos pendentes desativados.'); this.atualizado.emit(); this.fechar.emit(); },
      error: (err: HttpErrorResponse) => { const mensagem = erroEvento(err); this.erro.set(mensagem); this.conflito.set(err.status === 409); this.toast.error(mensagem); },
    });
  }
  salvo(evento: EventoDto): void {
    this.ocupado.set(false); this.atualizado.emit();
    // Após editar, o GET é a fonte do estado atual dos detalhes.
    if (this.modo === 'criar') this.fechar.emit();
    else this.carregar(evento.id);
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
  sair(destino: 'fechar' | 'voltar' = 'fechar'): void {
    if (this.ocupado() || this.descarte) return;
    if (this.formulario?.temAlteracoes()) {
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
  private concluirSaida(destino: 'fechar' | 'voltar'): void {
    if (destino === 'voltar') this.carregar();
    else this.fechar.emit();
  }
}
