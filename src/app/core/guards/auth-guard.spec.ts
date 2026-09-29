import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import { authGuard } from './auth-guard';
import { AuthService } from '../services/auth';

describe('authGuard', () => {
  const run = () =>
    TestBed.runInInjectionContext(() =>
      (authGuard as CanActivateFn)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;

  const withSession = (valid: boolean) =>
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { validateSession: () => of(valid) } }],
    });

  it('libera a rota com sessão válida', () => {
    withSession(true);
    let result: boolean | UrlTree | undefined;
    run().subscribe(value => (result = value));
    expect(result).toBe(true);
  });

  it('redireciona para /login sem sessão', () => {
    withSession(false);
    let result: boolean | UrlTree | undefined;
    run().subscribe(value => (result = value));
    expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/login']));
  });
});
