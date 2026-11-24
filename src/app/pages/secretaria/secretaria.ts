import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, finalize, take } from 'rxjs';
import { EventoCalendarioItem } from '../../core/models/evento.model';
import { EventosService } from '../../core/services/eventos';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { ExcluirUsuarioDialog } from '../desbravadores/excluir-usuario-dialog';
import { normalizar, UsuariosListagem } from '../desbravadores/usuarios-listagem';
import { EventoDetalhes } from '../eventos/detalhes/evento-detalhes';
import { dataCivil, erroEvento, somarDias } from '../eventos/eventos.utils';
import { ProximosEventos } from '../eventos/proximos/proximos-eventos';
import { GradeRolavel } from './grade-rolavel';

interface DocumentoListagem {
  id: string;
  titulo: string;
}

@Component({
  selector: 'app-secretaria',
  imports: [CdkMenuModule, ExcluirUsuarioDialog, ProximosEventos, EventoDetalhes, RefreshButton, GradeRolavel],
  templateUrl: './secretaria.html',
  styleUrl: './secretaria.scss',
})
export class Secretaria extends UsuariosListagem implements OnInit {
  private readonly eventosService = inject(EventosService);
  // A fonte de documentos será integrada quando o cadastro estiver disponível.
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

  ngOnInit(): void {
    this.carregarEventos();
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
