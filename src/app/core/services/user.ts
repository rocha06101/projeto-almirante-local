import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { User as UserModel } from '../models/user.model';
import { ApiService } from './api';

@Injectable({
  providedIn: 'root',
})
export class User {
  private api = inject(ApiService);

  listarUsuarios(): Observable<UserModel[]> {
    return this.api.get<UserModel[]>('/Usuarios');
  }
}
