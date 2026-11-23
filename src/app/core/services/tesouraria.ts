
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from './api';
import { TesourariaResumoResponse } from '../models/tesouraria.model';

@Injectable({
  providedIn: 'root',
})
export class TesourariaService {
  private readonly api = inject(ApiService);

  obterResumo(): Observable<TesourariaResumoResponse> {
    return this.api.get<TesourariaResumoResponse>(
      '/Tesouraria/Resumo'
    );
  }
}
