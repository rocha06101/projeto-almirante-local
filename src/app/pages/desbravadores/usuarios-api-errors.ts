import { HttpErrorResponse } from '@angular/common/http';

/** ProblemDetails / ValidationProblemDetails devolvidos por /api/Usuarios. */
interface ProblemBody {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function problem(error: HttpErrorResponse): ProblemBody {
  return typeof error.error === 'object' && error.error !== null ? (error.error as ProblemBody) : {};
}

/**
 * Mensagem para o usuário a partir da resposta da API. Prioriza o `detail`/`title` do backend (regras de negócio
 * como e-mail duplicado ou vínculo com eventos futuros ficam lá); 401 é tratado pelo interceptor e 403 nunca encerra a sessão.
 */
export function describeUsuarioError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = problem(error);
  switch (error.status) {
    case 0:
      return 'Sem conexão com o servidor.';
    case 400: {
      const first = body.errors ? Object.values(body.errors).flat()[0] : undefined;
      return first ?? body.detail ?? body.title ?? 'Dados inválidos.';
    }
    case 401:
      return 'Sua sessão expirou. Entre novamente para continuar.';
    case 403:
      return body.detail ?? 'Você não tem permissão para esta operação.';
    case 404:
      return body.detail ?? body.title ?? 'Usuário não encontrado.';
    case 409:
      return body.detail ?? body.title ?? 'A operação conflita com o estado atual do cadastro.';
    default:
      return fallback;
  }
}

/** Erros por campo de um 400, com a chave normalizada para o nome do controle (Nome → nome, CargoId → cargoId). */
export function usuarioFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(problem(error).errors ?? {})) {
    if (key && messages?.length) {
      result[key.charAt(0).toLowerCase() + key.slice(1)] = messages.join(' ');
    }
  }
  return result;
}
