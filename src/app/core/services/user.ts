import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Cargo,
  CreateUserRequest,
  ListUsersOptions,
  UpdateUserRequest,
  User as UserModel,
} from '../models/user.model';
import { ApiService } from './api';

@Injectable({
  providedIn: 'root',
})
export class User {
  private api = inject(ApiService);

  /** Por padrão a API retorna somente os ativos. */
  listarUsuarios(options: ListUsersOptions = {}): Observable<UserModel[]> {
    return this.api.get<UserModel[]>(
      '/Usuarios',
      options.includeInactive ? { params: { includeInactive: true } } : undefined,
    );
  }

  /** 201 com o usuário criado; 409 se o e-mail já existir (inclusive entre inativos). */
  criarUsuario(payload: CreateUserRequest): Observable<UserModel> {
    return this.api.post<UserModel>('/Usuarios', payload);
  }

  /** Altera nome, e-mail e cargo de um usuário ativo. */
  atualizarUsuario(id: string, payload: UpdateUserRequest): Observable<UserModel> {
    return this.api.put<UserModel>(`/Usuarios/${encodeURIComponent(id)}`, payload);
  }

  /** Exclusão lógica (204). 409 se o usuário estiver vinculado a eventos futuros, já inativo ou for o próprio solicitante. */
  excluirUsuario(id: string): Observable<void> {
    return this.api.delete<void>(`/Usuarios/${encodeURIComponent(id)}`);
  }

  listarCargos(): Observable<Cargo[]> {
    return this.api.get<Cargo[]>('/Cargos');
  }
}
