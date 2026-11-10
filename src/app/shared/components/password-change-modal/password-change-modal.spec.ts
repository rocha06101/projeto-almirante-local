import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService, PasswordChangeFailure } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
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
    router = { navigate: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PasswordChangeModal],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PasswordChangeModal);
    fixture.componentRef.setInput('targetUserId', 'target-1');
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('mantém as validações em tempo real e exibe uma única etapa com Cancelar e Salvar', () => {
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const ruleRows = () => [...page.querySelectorAll('.password-rules li')];

    expect(ruleRows().every(row => row.classList.contains('neutral'))).toBe(true);
    expect(page.textContent).toContain('Cancelar');
    expect(page.textContent).toContain('Salvar');
    expect(page.textContent).not.toContain('Próximo');
    expect(page.querySelector('input[type="email"]')).toBeNull();

    component.passwordForm.controls.novaSenha.setValue(validPassword);
    component.passwordForm.controls.confirmacaoNovaSenha.setValue(validPassword);
    fixture.detectChanges();
    expect(ruleRows().every(row => row.classList.contains('valid'))).toBe(true);
    expect(component.confirmationStatus).toBe('valid');

    component.passwordForm.controls.novaSenha.setValue('abcdefghijklmno');
    fixture.detectChanges();
    expect(ruleRows()[1].classList.contains('invalid')).toBe(true);
    expect(component.confirmationStatus).toBe('invalid');
  });

  it('gera toast vermelho e não chama a API para campos inválidos', () => {
    const component = fixture.componentInstance;
    component.passwordForm.setValue({
      senhaAtualSolicitante: '',
      novaSenha: 'invalida',
      confirmacaoNovaSenha: 'diferente',
    });

    component.submitPasswordChange();

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Informe a senha atual.'),
    );
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
    expect(auth.alterarSenhaDeUsuario).not.toHaveBeenCalled();
  });

  it('cancela e descarta os campos', () => {
    const component = fixture.componentInstance;
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.passwordForm.setValue({
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    });

    component.close();

    expect(component.passwordForm.getRawValue()).toEqual({
      senhaAtualSolicitante: '',
      novaSenha: '',
      confirmacaoNovaSenha: '',
    });
    expect(closed).toHaveBeenCalledOnce();
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
  });

  it('salva a própria senha sem exigir ID, envia os campos sem alterar e encerra a sessão após 2 s', () => {
    vi.useFakeTimers();
    fixture.componentRef.setInput('targetUserId', '');
    const component = fixture.componentInstance;
    const closed = vi.fn();
    component.closed.subscribe(closed);
    const request = {
      senhaAtualSolicitante: ' senha atual ',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    };
    component.passwordForm.setValue(request);

    component.submitPasswordChange();
    component.submitPasswordChange();

    expect(auth.alterarMinhaSenha).toHaveBeenCalledOnce();
    expect(auth.alterarMinhaSenha).toHaveBeenCalledWith(request);
    expect(auth.alterarSenhaDeUsuario).not.toHaveBeenCalled();
    expect(component.passwordForm.getRawValue()).toEqual({
      senhaAtualSolicitante: '',
      novaSenha: '',
      confirmacaoNovaSenha: '',
    });
    expect(toast.success).toHaveBeenCalledWith('Dados alterados', { duration: 2000 });
    expect(closed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(closed).toHaveBeenCalledOnce();
    expect(auth.expireSession).toHaveBeenCalledOnce();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('altera senha de terceiro com o ID alvo, preservando a sessão do operador', () => {
    vi.useFakeTimers();
    fixture.componentRef.setInput('isOwnAccount', false);
    const component = fixture.componentInstance;
    const request = {
      senhaAtualSolicitante: 'senha do operador',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    };
    component.passwordForm.setValue(request);

    component.submitPasswordChange();
    vi.advanceTimersByTime(2000);

    expect(auth.alterarSenhaDeUsuario).toHaveBeenCalledWith('target-1', request);
    expect(auth.alterarMinhaSenha).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/desbravadores']);
    expect(auth.expireSession).not.toHaveBeenCalled();
  });

  it('mantém o formulário em falha 400 e distingue o campo ProblemDetails.errors', () => {
    auth.alterarMinhaSenha.mockReturnValue(
      throwError(() => new PasswordChangeFailure(
        'password',
        new HttpErrorResponse({
          status: 400,
          error: {
            title: 'Dados inválidos.',
            errors: { senhaAtualSolicitante: ['A senha atual informada não confere.'] },
          },
        }),
      )),
    );
    const component = fixture.componentInstance;
    const request = {
      senhaAtualSolicitante: 'senha atual',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    };
    component.passwordForm.setValue(request);

    component.submitPasswordChange();

    expect(toast.error).toHaveBeenCalledWith('A senha atual não confere ou está inválida.');
    expect(component.passwordForm.getRawValue()).toEqual(request);
    expect(component.isSaving()).toBe(false);
  });

  it('distingue falha do GET CSRF, permissão, conflito, limite e rede nos toasts', () => {
    const component = fixture.componentInstance;
    const cases: Array<[number, string]> = [
      [401, 'Sessão inválida ou expirada ao obter o token CSRF. Entre novamente.'],
      [403, 'A API recusou a emissão do token CSRF. Verifique a sessão e tente novamente.'],
      [409, 'Conflito: a conta ou o usuário alvo foi alterado ou desativado. Atualize os dados e tente novamente.'],
      [429, 'Limite de tentativas excedido. Aguarde antes de tentar novamente.'],
      [0, 'Falha de rede ao obter o token CSRF. Verifique a conexão e o proxy da API.'],
    ];

    for (const [status, message] of cases) {
      auth.alterarMinhaSenha.mockReturnValue(
        throwError(() => new PasswordChangeFailure('csrf', new HttpErrorResponse({ status }))),
      );
      component.passwordForm.setValue({
        senhaAtualSolicitante: 'senha atual',
        novaSenha: validPassword,
        confirmacaoNovaSenha: validPassword,
      });
      component.submitPasswordChange();
      expect(toast.error).toHaveBeenLastCalledWith(message);
    }
  });

  it('bloqueia envio duplicado e preserva o rascunho quando o POST está pendente', () => {
    const pending = new Subject<void>();
    auth.alterarSenhaDeUsuario.mockReturnValue(pending);
    fixture.componentRef.setInput('isOwnAccount', false);
    const component = fixture.componentInstance;
    const request = {
      senhaAtualSolicitante: 'senha do operador',
      novaSenha: validPassword,
      confirmacaoNovaSenha: validPassword,
    };
    component.passwordForm.setValue(request);

    component.submitPasswordChange();
    component.submitPasswordChange();

    expect(auth.alterarSenhaDeUsuario).toHaveBeenCalledOnce();
    expect(component.isSaving()).toBe(true);
    pending.error(new HttpErrorResponse({ status: 403 }));
    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para alterar a senha deste usuário.');
    expect(component.passwordForm.getRawValue()).toEqual(request);
    expect(component.isSaving()).toBe(false);
  });
});
