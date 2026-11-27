import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { ApiService } from './api';

export type ModoImportacao = 'documento' | 'template';

export type FormatoExportacao = 'pdf' | 'md' | 'docx' | 'xlsx';

export interface DocumentoListagem {
  id: string;
  titulo: string;
  formatosExportacao?: FormatoExportacao[];
}

export interface ConteudoDocumento {
  titulo: string;
  tipo: string;
  markdown: string;
}

export interface Documento extends ConteudoDocumento, DocumentoListagem {
  versao: string;
}

interface ImportacaoDocumento {
  modo: ModoImportacao;
  markdown: string;
  avisos: string[];
}

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
    return this.api.get<Documento>(this.caminhoDocumento(id)).pipe(
      map(documento => {
        if (documento?.id !== id || typeof documento.titulo !== 'string' ||
            typeof documento.tipo !== 'string' || typeof documento.markdown !== 'string' ||
            typeof documento.versao !== 'string' || !documento.versao) {
          throw new Error('Dados do documento inválidos.');
        }
        return documento;
      }),
    );
  }

  editar(id: string, versao: string, conteudo: ConteudoDocumento) {
    return this.api.put<Pick<Documento, 'versao'>>(this.caminhoDocumento(id), { ...conteudo, versao }).pipe(
      map(resposta => {
        if (!resposta?.versao) throw new Error('Edição sem confirmação da API.');
        return resposta;
      }),
    );
  }

  exportar(id: string, formato: FormatoExportacao) {
    return this.api.getBlobResponse(this.caminhoDocumento(id) + '/exportar', { params: { formato } });
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
