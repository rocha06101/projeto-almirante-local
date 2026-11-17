import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api';

interface Evento {
  id: string;
  local: string;
  dataEvento: string;
  quantidadeMembros: number;
}

@Component({
  imports: [DatePipe],
  template: `
    <section class="container-fluid py-4">
      <header class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 class="mb-0">Eventos</h1>
        <button type="button" class="btn btn-outline-primary" [disabled]="carregando()" (click)="carregar()">
          Atualizar eventos
        </button>
      </header>
      @if (carregando()) {
        <p role="status">Carregando eventos…</p>
      } @else if (erro()) {
        <p role="alert">{{ erro() }}</p>
      } @else {
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th scope="col">Data</th><th scope="col">Local</th><th scope="col">Participantes</th></tr></thead>
            <tbody>
              @for (evento of eventos(); track evento.id) {
                <tr>
                  <td>{{ evento.dataEvento | date:'dd/MM/yyyy':'UTC' }}</td>
                  <td>{{ evento.local }}</td>
                  <td>{{ evento.quantidadeMembros }}</td>
                </tr>
              } @empty {
                <tr><td colspan="3">Nenhum evento encontrado.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class Eventos implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly carregando = signal(false);
  readonly erro = signal('');
  readonly eventos = signal<Evento[]>([]);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set('');
    this.api.get<{ items: Evento[] }>('/Eventos').pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.carregando.set(false)),
    ).subscribe({
      next: resposta => this.eventos.set(resposta.items ?? []),
      error: erro => {
        this.eventos.set([]);
        this.erro.set(erro.error?.detail ?? (erro.status === 403
          ? 'Você não tem permissão para consultar eventos.'
          : 'Não foi possível consultar os eventos.'));
      },
    });
  }
}
