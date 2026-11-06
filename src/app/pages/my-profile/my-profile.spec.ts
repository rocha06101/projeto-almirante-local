import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { MyProfile } from './my-profile';

describe('MyProfile', () => {
  let fixture: ComponentFixture<MyProfile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfile],
      providers: [
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 'user-1',
              nome: 'Ana Silva',
              email: 'ana@example.com',
              cargo: { id: 'cargo-1', nome: 'Administrador', role: 'Admin' },
            }),
          },
        },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyProfile);
    await fixture.whenStable();
  });

  it('exibe as seções do perfil', () => {
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Meu Perfil');
    expect(page.textContent).toContain('Credenciais');
    expect(page.textContent).toContain('Informações Pessoais');
  });

  it('ativa os campos de informações pessoais ao clicar em Editar', () => {
    const page = fixture.nativeElement as HTMLElement;
    const controls = page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '.container-rigth input, .container-rigth select, .container-rigth textarea',
    );

    expect(controls.length).toBe(12);
    controls.forEach(control => expect(control.disabled).toBe(true));

    page.querySelector<HTMLButtonElement>('.profile-edit-button button')?.click();
    fixture.detectChanges();

    controls.forEach(control => expect(control.disabled).toBe(false));
    expect(fixture.componentInstance.personalInfoInactive()).toBe(false);
  });

  it('volta para a Home ao clicar em Cancelar', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
