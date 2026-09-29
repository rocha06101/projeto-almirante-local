import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { throwError, of } from 'rxjs';

import { Login } from './login';
import { AuthService } from '../../core/services/auth';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let auth: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('não chama a API com formulário inválido', () => {
    const login = vi.spyOn(auth, 'login');
    component.submit();
    expect(login).not.toHaveBeenCalled();
  });

  it('navega para a raiz após login bem-sucedido', () => {
    vi.spyOn(auth, 'login').mockReturnValue(of({ id: '1', nome: 'N', email: 'a@b.co', cargo: { id: 'c', nome: 'C', role: 'R' } }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.form.setValue({ email: 'a@b.co', password: 'x' });

    component.submit();

    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it.each([
    [401, 'E-mail ou senha inválidos.'],
    [0, 'Não foi possível conectar ao servidor. Verifique sua conexão.'],
    [500, 'Não foi possível entrar agora. Tente novamente em instantes.'],
  ])('mostra mensagem apropriada para status %i', (status, message) => {
    vi.spyOn(auth, 'login').mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    component.form.setValue({ email: 'a@b.co', password: 'x' });

    component.submit();

    expect(component.error()).toBe(message);
    expect(component.loading()).toBe(false);
  });

  it('429 informa o Retry-After', () => {
    const headers = new HttpHeaders({ 'Retry-After': '42' });
    vi.spyOn(auth, 'login').mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429, headers })));
    component.form.setValue({ email: 'a@b.co', password: 'x' });

    component.submit();

    expect(component.error()).toContain('42 segundos');
  });
});
