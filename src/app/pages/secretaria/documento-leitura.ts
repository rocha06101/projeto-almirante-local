import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Documento, DocumentosService } from '../../core/services/documentos';
import { DocumentoMarkdown } from './documento-markdown';

type EstadoLeitura = { carregando: true } | { documento: Documento } | { erro: string };

@Component({
  selector: 'app-documento-leitura',
  imports: [RouterLink, DocumentoMarkdown],
  template: `
    <a class="editor-voltar" routerLink="/secretaria" aria-label="Voltar à Secretaria"><span aria-hidden="true">←</span></a>
    @if (estado(); as atual) {
      @if ('carregando' in atual) {
        <p role="status">Carregando documento…</p>
      } @else if ('erro' in atual) {
        <p class="erro" role="alert">{{ atual.erro }}</p>
      } @else if ('documento' in atual) {
        <article aria-labelledby="documento-titulo">
          <h1 id="documento-titulo">{{ atual.documento.titulo }}</h1>
          <p>Tipo de documento: {{ atual.documento.tipo }}</p>
          <div appDocumentoMarkdown class="editor-previa" [markdown]="atual.documento.markdown"
            tabindex="0" role="region" aria-labelledby="documento-titulo"></div>
        </article>
      }
    }
  `,
  styleUrl: './documento-editor.scss',
})
export class DocumentoLeitura {
  private readonly api = inject(DocumentosService);
  readonly estado = toSignal(inject(ActivatedRoute).paramMap.pipe(
    switchMap(params => this.api.obter(params.get('id')!).pipe(
      map((documento): EstadoLeitura => ({ documento })),
      catchError((erro: unknown) => of<EstadoLeitura>({
        erro: erro instanceof HttpErrorResponse && erro.status === 404
          ? 'Documento não encontrado.'
          : 'Não foi possível carregar o documento.',
      })),
      startWith<EstadoLeitura>({ carregando: true }),
    )),
  ), { initialValue: { carregando: true } as EstadoLeitura });
}
