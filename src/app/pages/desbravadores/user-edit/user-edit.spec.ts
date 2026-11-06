import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserEdit } from './user-edit';

describe('UserEdit', () => {
  let fixture: ComponentFixture<UserEdit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserEdit],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UserEdit);
    await fixture.whenStable();
  });

  it('renders the profile layout sections and fields', () => {
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Editar Usuário');
    expect(page.textContent).toContain('Credenciais');
    expect(page.textContent).toContain('Informações Pessoais');
    expect(page.querySelectorAll('.inputs-left app-primary-input').length).toBe(7);
    expect(page.querySelectorAll('.inputs-rigth app-primary-input').length).toBe(3);
    expect(page.querySelector('app-primary-select')).not.toBeNull();
    expect(page.querySelector('app-primary-textarea')).not.toBeNull();
  });

  it('enables personal information fields when Editar is clicked', () => {
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

  it('opens the shared password and optional email change flow', () => {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.container-down-button button')?.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar senha');
    expect(page.querySelectorAll('[role="dialog"] input[type="password"]')).toHaveLength(3);

    page.querySelector<HTMLButtonElement>('.password-modal-save')?.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar e-mail');
    expect(page.querySelector('#profile-email')).not.toBeNull();
    expect(page.textContent).toContain('Se não alterar o e-mail, o atual será mantido.');
  });

  it('navigates back to the users list when Cancelar is clicked', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();

    expect(navigateSpy).toHaveBeenCalledWith(['/desbravadores']);
  });
});
