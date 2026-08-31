import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ApiRequestOptions = {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>;
};

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = this.resolveBaseUrl();
  private readonly http = inject(HttpClient);

  post<T>(url: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.post<T>(this.resolveUrl(url), body, options);
  }

  get<T>(url: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.get<T>(this.resolveUrl(url), options);
  }

  put<T>(url: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.put<T>(this.resolveUrl(url), body, options);
  }

  delete<T>(url: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(this.resolveUrl(url), options);
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

