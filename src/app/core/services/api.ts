import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl = this.resolveBaseUrl();
  private http = inject(HttpClient);

  post<T>(url: string, body: any, options?: { headers?: HttpHeaders | Record<string, string | string[]> }): Observable<T> {
    return this.http.post<T>(this.resolveUrl(url), body, options);
  }

  get<T>(url: string): Observable<T> {
    return this.http.get<T>(this.resolveUrl(url));
  }

  private resolveUrl(url: string): string {
    if (url.startsWith('http')) {
      return url;
    }

    return `${this.baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
  }

  private resolveBaseUrl(): string {
    const host = globalThis.location?.hostname ?? '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isCloudflareWorkers = host.endsWith('.workers.dev');

    if (isLocalhost || isCloudflareWorkers) {
      return '/api';
    }

    return 'https://desbravadores-gestao.onrender.com/api';
  }
}
  
