import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthService } from '../services/auth';
import { PermissoesService } from '../services/permissoes';
import { permissaoGuard } from './permissao-guard';

describe('permissaoGuard', () => {
  const auth = { isLoggedIn: () => true, validateSession: vi.fn() };
  const permissoes = { tem: vi.fn(), atualizar: vi.fn() };
  const executar = (data = { permissao: 'autorizacao.consultar' } as Record<string, unknown>) => firstValueFrom(TestBed.runInInjectionContext(() => permissaoGuard(
    { data } as unknown as ActivatedRouteSnapshot,
    {} as RouterStateSnapshot,
  )) as Observable<true | ReturnType<Router['createUrlTree']>>);

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: PermissoesService, useValue: permissoes },
      ],
    });
  });

  it('manda sessão inválida ao login', async () => {
    auth.validateSession.mockReturnValue(of(false));
    expect((await executar()).toString()).toBe('/login');
    expect(permissoes.atualizar).not.toHaveBeenCalled();
  });

  it('verifica a permissão após consultar a revisão atual', async () => {
    auth.validateSession.mockReturnValue(of(true));
    permissoes.atualizar.mockReturnValue(of(null));
    permissoes.tem.mockReturnValue(false);
    expect((await executar()).toString()).toBe('/perfil');
    permissoes.tem.mockReturnValue(true);
    expect(await executar()).toBe(true);
  });
  it('aceita alternativas e exige todas as capacidades adicionais', async () => {
    auth.validateSession.mockReturnValue(of(true));
    permissoes.atualizar.mockReturnValue(of({}));
    permissoes.tem.mockImplementation(chave => chave === 'segunda');
    const data = { permissoes: ['primeira', 'segunda'], exige: ['adicional'] };
    expect((await executar(data)).toString()).toBe('/perfil');
    permissoes.tem.mockImplementation(chave => chave !== 'primeira');
    expect(await executar(data)).toBe(true);
  });
});
