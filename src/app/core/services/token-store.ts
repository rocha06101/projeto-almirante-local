import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TokenStore {
  private accessToken = signal<string | null>(null);
  private expiresAtUtc = signal<string | null>(null);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  setToken(token: string, expiresAtUtc: string): void {
    this.accessToken.set(token);
    this.expiresAtUtc.set(expiresAtUtc);
  }

  getToken(): string | null {
    return this.accessToken();
  }

  getExpiresAtUtc(): string | null {
    return this.expiresAtUtc();
  }

  isExpired(): boolean {
    const exp = this.expiresAtUtc();
    if (!exp) return true;
    return new Date(exp).getTime() <= Date.now();
  }

  clear(): void {
    this.accessToken.set(null);
    this.expiresAtUtc.set(null);
  }
}