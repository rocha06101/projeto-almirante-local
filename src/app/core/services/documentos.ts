import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiService } from './api';

export type ModoImportacao = 'documento' | 'template';

export interface DocumentoListagem {
  id: string;
  titulo: string;
}

export interface ConteudoDocumento {
  titulo: string;
  tipo: string;
  markdown: string;
}

export interface Documento extends ConteudoDocumento {
  id: string;
  versao: string;
}

interface ImportacaoDocumento {
  modo: ModoImportacao;
  markdown: string;
  avisos: string[];
}

export const PERMISSAO_DOCUMENTOS = {
  consultar: 'secretaria.documentos.consultar',
  criar: 'secretaria.documentos.criar',
  editar: 'secretaria.documentos.editar',
} as const;

// O nginx atual usa 1 MiB nas rotas gerais. Reserve espaço para o multipart.
export const LIMITE_ARQUIVO_DOCUMENTO = 1_000_000;

const caminho = '/Secretaria/Documentos';

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly api = inject(ApiService);

  listar(page = 1) {
    return this.api.get<{ items: DocumentoListagem[]; total: number }>(caminho, {
      params: { page, pageSize: 50 },
    });
  }

  importar(arquivo: File, modo: ModoImportacao) {
    const dados = new FormData();
    dados.append('arquivo', arquivo);
    dados.append('modo', modo);
    return this.api.post<ImportacaoDocumento>(caminho + '/Importacao', dados).pipe(
      map(resposta => {
        if (resposta?.modo !== modo || typeof resposta.markdown !== 'string' || !resposta.markdown.trim()) {
          throw new Error('Importação sem Markdown válido.');
        }
        return resposta;
      }),
    );
  }

  criar(conteudo: ConteudoDocumento, chave: string) {
    return this.api.post<Pick<Documento, 'id' | 'versao'>>(caminho, conteudo, {
      headers: { 'Idempotency-Key': chave },
    }).pipe(map(resposta => {
      if (!resposta?.id || !resposta.versao) throw new Error('Criação sem confirmação da API.');
      return resposta;
    }));
  }

  obter(id: string) {
    return this.api.get<Documento>(this.caminhoDocumento(id));
  }

  editar(id: string, versao: string, conteudo: ConteudoDocumento) {
    return this.api.put<Pick<Documento, 'versao'>>(this.caminhoDocumento(id), { ...conteudo, versao });
  }

  private caminhoDocumento(id: string): string {
    return caminho + '/' + encodeURIComponent(id);
  }
}

export function erroImportacaoDocumento(erro: unknown): string {
  if (erro instanceof HttpErrorResponse) {
    switch (erro.status) {
      case 403: return 'Você não tem permissão para importar documentos.';
      case 413: return 'O arquivo excede o limite de upload da API.';
      case 415: return 'O formato do arquivo não é compatível.';
      case 400:
      case 422: return 'Não foi possível ler o arquivo. Confira se ele está íntegro e sem proteção.';
    }
  }
  return 'Não foi possível importar o arquivo. Tente novamente.';
}
