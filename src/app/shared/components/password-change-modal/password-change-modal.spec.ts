import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { User as UserService } from '../../../core/services/user';
import { PasswordChangeModal } from './password-change-modal';

const validPassword = 'VidaNova!2026Claro';

describe('PasswordChangeModal', () => {
  let fixture: ComponentFixture<PasswordChangeModal>;
  let auth: {
    alterarMinhaSenha: ReturnType<typeof vi.fn>;
    alterarSenhaDeUsuario: ReturnType<typeof vi.fn>;
    expireSession: ReturnType<typeof vi.fn>;
  };
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  let userService: { atualizarUsuario: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    auth = {
      alterarMinhaSenha: vi.fn().mockReturnValue(of(void 0)),
      alterarSenhaDeUsuario: vi.fn().mockReturnValue(of(void 0)),
      expireSession: vi.fn(),
    };
    toast = {
      success: vi.fn().mockReturnValue('success-toast'),
      error: vi.fn().mockReturnValue('error-toast'),
      dismiss: vi.fn(),
    };
    userService = {
      atualizarUsuario: vi.fn().mockReturnValue(of({})),
    };
    router = { navigate: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PasswordChangeModal],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
        { provide: UserService, useValue: userService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PasswordChangeModal);
    fixture.componentRef.setInput('targetUserId', 'target-1');
    fixture.componentRef.setInput('originalEmail', 'ana@example.com');
    fixture.componentRef.setInput('targetUserName', 'Ana Silva');
    fixture.componentRef.setInput('targetUserCargoId', 'cargo-1');
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('mantém o feedback de validação da senha em tempo real e permite avançar com os campos vazios', () => {
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const ruleRows = () => [...page.querySelectorAll('.password-rules li')];

    expect(ruleRows().every(row => row.classList.contains('neutral'))).toBe(true);
    expect(component.canAdvance).toBe(true);
    component.advanceToEmail();
    expect(component.step()).toBe('email');

    component.changePassword();
    component.passwordForm.controls.novaSenha.setValue(validPassword);
    component.passwordForm.controls.confirmacaoNovaSenha.setValue(validPassword);
    fixture.detectChanges();
    expect(ruleRows().every(row => row.classList.contains('valid'))).toBe(true);
    expect(page.querySelector('.password-modal-input.valid')).not.toBeNull();
    expect(component.canAdvance).toBe(false);

    component.passwordForm.controls.senhaAtualSolicitante.setValue('senha atual');
    expect(component.canAdvance).toBe(true);
    component.passwordForm.controls.novaSenha.setValue('abcdefghijklmno');
    fixture.detectChanges();
    expect(ruleRows()[1].classList.contains('invalid')).toBe(true);
    expect(component.confirmationStatus).toBe('invalid');
    expect(component.canAdvance).toBe(false);
  });

  it('valida e-mail obrigatório, formato, ASCII e limite de 100 caracteres', () => {
    const email = fixture.componentInstance.emailForm.controls.email;
    email.setValue('');
    expect(email.hasError('required')).toBe(true);
    email.setValue('email-invalido');
    expect(email.hasError('email')).toBe(true);
    email.setValue('anã@example.com');
    expect(email.hasError('ascii')).toBe(true);
    email.setValue(`${'a'.repeat(90)}@example.com`);
    expect(email.hasError('maxlength')).toBe(true);
    email.setValue('ana@example.com');
    expect(email.valid).toBe(true);
  });

  it('informa que nada mudou quando os dois valores continuam iguais aos originais', () => {
    const component = fixture.componentInstance;
    component.advanceToEmail();
    component.submitChanges();

    expect(toast.error).toHaveBeenCalledWith(
      'Nenhum dado foi alterado.',
      expect.objectContaining({ duration: 0 }),
    );
    expect(userService.atualizarUsuario).not.toHaveBeenCalled();
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
  });

  it('bloqueia e-mail próprio sem gravar parcialmente uma senha também alterada', () => {
    const component = fixture.componentInstance;
    component.emailForm.controls.email.setValue('novo@example.com');
    component.passwordForm.setValue({
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });
    component.advanceToEmail();
    component.submitChanges();

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('a API local não oferece uma rota'),
      expect.objectContaining({ duration: 0 }),
    );
    expect(userService.atualizarUsuario).not.toHaveBeenCalled();
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
  });

  it('mostra o toast de e-mail exclusivo e grava somente o e-mail após confirmação', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('isOwnAccount', false);
    component.emailForm.controls.email.setValue('  novo@example.com ');
    component.advanceToEmail();
    component.submitChanges();

    expect(toast.error).toHaveBeenCalledWith(
      'Somente o email foi alterado.',
      expect.objectContaining({ duration: 0, actions: expect.any(Array) }),
    );
    expect(userService.atualizarUsuario).not.toHaveBeenCalled();
    const actions = toast.error.mock.calls.at(-1)?.[1].actions;
    actions[1].onClick();

    expect(userService.atualizarUsuario).toHaveBeenCalledWith('target-1', {
      nome: 'Ana Silva',
      email: 'novo@example.com',
      cargoId: 'cargo-1',
    });
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Dados alterados', { duration: 2000 });
    vi.advanceTimersByTime(2000);
    expect(router.navigate).toHaveBeenCalledWith(['/desbravadores']);
  });

  it('mostra o toast de senha exclusiva e salva somente a senha própria', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    component.passwordForm.setValue({
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });
    component.advanceToEmail();
    component.submitChanges();

    expect(toast.error).toHaveBeenCalledWith(
      'Somente a senha foi alterada',
      expect.objectContaining({ duration: 0, actions: expect.any(Array) }),
    );
    const actions = toast.error.mock.calls.at(-1)?.[1].actions;
    actions[1].onClick();

    expect(auth.alterarMinhaSenha).toHaveBeenCalledWith({
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });
    expect(userService.atualizarUsuario).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(auth.expireSession).toHaveBeenCalledOnce();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('grava e-mail antes da senha e, se a senha falhar, permite repetir só a chamada pendente', () => {
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('isOwnAccount', false);
    const calls: string[] = [];
    userService.atualizarUsuario.mockImplementation(() => {
      calls.push('email');
      return of({});
    });
    auth.alterarSenhaDeUsuario
      .mockImplementationOnce(() => {
        calls.push('password');
        return throwError(() => new HttpErrorResponse({ status: 400 }));
      })
      .mockImplementationOnce(() => {
        calls.push('password-retry');
        return of(void 0);
      });
    component.emailForm.controls.email.setValue('novo@example.com');
    component.passwordForm.setValue({
      senhaAtualSolicitante: 'senha do operador',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });
    component.advanceToEmail();
    component.submitChanges();

    expect(calls).toEqual(['email', 'password']);
    expect(userService.atualizarUsuario).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('O e-mail foi alterado, mas a senha não.'),
      expect.objectContaining({ duration: 0 }),
    );
    const retry = toast.error.mock.calls.at(-1)?.[1].actions[0];
    expect(retry.label).toBe('Repetir só a senha');
    retry.onClick();

    expect(calls).toEqual(['email', 'password', 'password-retry']);
    expect(userService.atualizarUsuario).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('Dados alterados', { duration: 2000 });
  });

  it('impede envio duplicado, mantém o rascunho após erro e descarta toast ao cancelar', () => {
    const pending = new Subject<void>();
    auth.alterarMinhaSenha.mockReturnValue(pending);
    const component = fixture.componentInstance;
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.passwordForm.setValue({
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });
    component.advanceToEmail();
    component.submitChanges();
    const confirmSave = toast.error.mock.calls.at(-1)?.[1].actions[1];
    confirmSave.onClick();
    component.submitChanges();
    expect(auth.alterarMinhaSenha).toHaveBeenCalledOnce();
    expect(component.isSaving()).toBe(true);
    pending.error(new HttpErrorResponse({ status: 400 }));
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(component.passwordForm.controls.senhaAtualSolicitante.value).toBe('senha atual');
    component.close();
    expect(closed).toHaveBeenCalledOnce();
    expect(toast.dismiss).toHaveBeenCalledWith('error-toast');
  });
});
