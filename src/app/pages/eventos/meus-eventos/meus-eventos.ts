import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, startWith, switchMap } from 'rxjs';
import { EventoParticipante, MinhaDevolucao } from '../../../core/models/evento.model';
import { EventosService } from '../../../core/services/eventos';
import { formatarData } from '../eventos.utils';

type Consulta =
  | { estado: 'carregando' | 'erro' }
  | { estado: 'pronta'; eventos: EventoParticipante[] };

@Component({
  selector: 'app-meus-eventos',
  imports: [CurrencyPipe],
  templateUrl: './meus-eventos.html',
  styleUrl: './meus-eventos.scss',
})
export class MeusEventos {
  private readonly api = inject(EventosService);
  private readonly atualizar = new Subject<void>();
  readonly consulta = signal<Consulta>({ estado: 'carregando' });
  readonly formatarData = formatarData;
  readonly statusDevolucao: Record<MinhaDevolucao['status'], string> = {
    Pendente: 'Pendente',
    Pago: 'Paga',
    Atrasado: 'Atrasada',
  };

  constructor() {
    this.atualizar.pipe(
      startWith(undefined),
      switchMap(() => {
        this.consulta.set({ estado: 'carregando' });
        return this.api.listarMeusEventos().pipe(catchError(() => {
          this.consulta.set({ estado: 'erro' });
          return EMPTY;
        }));
      }),
      takeUntilDestroyed(),
    ).subscribe(({ items }) => this.consulta.set({ estado: 'pronta', eventos: items }));
  }

  recarregar(): void {
    this.atualizar.next();
  }
}
