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

  it('abre o modal de alteração de senha e fecha pelo botão cancelar', () => {
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.container-down-button button')?.click();
    fixture.detectChanges();

    const dialog = page.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Alterar senha');
    expect(dialog?.querySelectorAll('input[type="password"]')).toHaveLength(3);
    expect(dialog?.textContent).toContain('Salvar');

    page.querySelector<HTMLButtonElement>('.password-modal-cancel')?.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });

  it('avança para a etapa de e-mail opcional e informa que a gravação não está conectada', () => {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.container-down-button button')?.click();
    fixture.detectChanges();

    page.querySelector<HTMLButtonElement>('.password-modal-save')?.click();
    fixture.detectChanges();

    const emailInput = page.querySelector<HTMLInputElement>('#profile-email');
    expect(emailInput?.type).toBe('email');
    expect(emailInput?.value).toBe('ana@example.com');
    expect(page.textContent).toContain('Se não alterar o e-mail, o atual será mantido.');

    page.querySelector<HTMLButtonElement>('.password-modal-save')?.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('a integração com a API');
  });

  it('volta para a Home ao clicar em Cancelar', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
