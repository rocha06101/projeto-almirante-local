import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { AuthService, PasswordChangeFailure } from '../../../core/services/auth';
import { ToastService } from '../../../core/services/toast.service';
import { PasswordToggleComponent } from '../password-toggle/password-toggle';

type PasswordRule = 'length' | 'sequence' | 'diversity' | 'repetition' | 'placeholder';
type RuleStatus = 'neutral' | 'valid' | 'invalid';

const passwordRules: ReadonlyArray<{ key: PasswordRule; label: string }> = [
  { key: 'length', label: '15 a 128 pontos de código.' },
  { key: 'sequence', label: 'Não pode ser uma sequência simples.' },
  { key: 'diversity', label: 'Não pode usar apenas um ou dois caracteres diferentes.' },
  { key: 'repetition', label: 'Não pode ser formada por um trecho repetido.' },
  { key: 'placeholder', label: 'Não pode conter texto de exemplo ou placeholder.' },
];

const passwordValidators: ValidatorFn[] = passwordRules.map(({ key }) => control =>
  passesRule(key, String(control.value ?? '')) ? null : { [key]: true },
);

@Component({
  selector: 'app-password-change-modal',
  standalone: true,
  templateUrl: './password-change-modal.html',
  styleUrl: './password-change-modal.scss',
  imports: [ReactiveFormsModule, PasswordToggleComponent],
})
export class PasswordChangeModal implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @Input() targetUserId = '';
  @Input() isOwnAccount = true;
  @Output() closed = new EventEmitter<void>();

  readonly currentPasswordVisible = signal(false);
  readonly newPasswordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);
  readonly isSaving = signal(false);
  readonly passwordForm = this.fb.nonNullable.group({
    senhaAtualSolicitante: ['', [Validators.required, Validators.maxLength(1024)]],
    novaSenha: this.fb.nonNullable.control('', passwordValidators),
    confirmacaoNovaSenha: ['', Validators.required],
  });

  readonly passwordRules = passwordRules;
  private completionTimer?: ReturnType<typeof setTimeout>;
  private pendingToastId?: string;

  ngOnDestroy(): void {
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }
    this.dismissPendingToast();
  }

  ruleStatus(rule: PasswordRule): RuleStatus {
    const control = this.passwordForm.controls.novaSenha;
    if (!control.value) {
      return 'neutral';
    }
    return control.hasError(rule) ? 'invalid' : 'valid';
  }

  get canSave(): boolean {
    return !this.isSaving();
  }

  get confirmationStatus(): RuleStatus {
    const { novaSenha, confirmacaoNovaSenha } = this.passwordForm.getRawValue();
    if (!confirmacaoNovaSenha) {
      return 'neutral';
    }
    return novaSenha === confirmacaoNovaSenha ? 'valid' : 'invalid';
  }

  submitPasswordChange(): void {
    if (this.isSaving()) {
      return;
    }

    this.passwordForm.markAllAsTouched();
    const request = this.passwordForm.getRawValue();
    const errors = passwordFormErrors(request, this.passwordForm.controls.novaSenha.errors);
    if (errors.length) {
      this.showError(`Revise os campos da senha: ${errors.join(' ')}`);
      return;
    }

    if (!this.isOwnAccount && !this.targetUserId) {
      this.showError('Não foi possível identificar o usuário cuja senha será alterada.');
      return;
    }

    this.dismissPendingToast();
    this.isSaving.set(true);
    const change$ = this.isOwnAccount
      ? this.auth.alterarMinhaSenha(request)
      : this.auth.alterarSenhaDeUsuario(this.targetUserId, request);

    change$
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.finishSaving(),
        error: (error: unknown) => {
          this.isSaving.set(false);
          this.showError(passwordChangeError(error, this.isOwnAccount));
        },
      });
  }

  close(): void {
    if (this.isSaving() || this.completionTimer) {
      return;
    }
    this.passwordForm.reset();
    this.dismissPendingToast();
    this.closed.emit();
  }

  private finishSaving(): void {
    this.isSaving.set(false);
    this.passwordForm.reset();
    this.dismissPendingToast();
    this.pendingToastId = this.toast.success('Dados alterados', { duration: 2000 });
    this.completionTimer = setTimeout(() => {
      this.completionTimer = undefined;
      this.closed.emit();
      if (this.isOwnAccount) {
        this.auth.expireSession();
      } else {
        void this.router.navigate(['/desbravadores']);
      }
    }, 2000);
  }

  private showError(message: string): void {
    this.dismissPendingToast();
    this.pendingToastId = this.toast.error(message);
  }

  private dismissPendingToast(): void {
    if (this.pendingToastId) {
      this.toast.dismiss(this.pendingToastId);
      this.pendingToastId = undefined;
    }
  }
}

function passwordFormErrors(
  request: { senhaAtualSolicitante: string; novaSenha: string; confirmacaoNovaSenha: string },
  newPasswordErrors: Record<string, unknown> | null,
): string[] {
  const errors: string[] = [];
  if (!request.senhaAtualSolicitante) {
    errors.push('Informe a senha atual.');
  } else if (request.senhaAtualSolicitante.length > 1024) {
    errors.push('A senha atual é longa demais.');
  }
  if (!request.novaSenha || passwordRules.some(({ key }) => newPasswordErrors?.[key])) {
    errors.push('A nova senha não atende à política.');
  }
  if (!request.confirmacaoNovaSenha) {
    errors.push('Informe a confirmação da nova senha.');
  } else if (request.novaSenha !== request.confirmacaoNovaSenha) {
    errors.push('A confirmação deve ser idêntica à nova senha.');
  }
  return errors;
}

function isSimpleSequence(password: string): boolean {
  const characters = [...password];
  if (characters.length < 3) {
    return false;
  }
  const step = (characters[1].codePointAt(0) ?? 0) - (characters[0].codePointAt(0) ?? 0);
  return (
    Math.abs(step) === 1 &&
    characters.every(
      (character, index) =>
        index < 2 ||
        (character.codePointAt(0) ?? 0) - (characters[index - 1].codePointAt(0) ?? 0) === step,
    )
  );
}

function isRepeatedSubstring(password: string): boolean {
  const normalized = password.toLowerCase();
  for (let blockLength = 1; blockLength <= Math.floor(normalized.length / 2); blockLength++) {
    if (normalized.length % blockLength !== 0) {
      continue;
    }
    const block = normalized.slice(0, blockLength);
    if (block.repeat(normalized.length / blockLength) === normalized) {
      return true;
    }
  }
  return false;
}

function containsPlaceholder(password: string): boolean {
  return ['DEFINA', 'TROQUE', 'SUBSTITUA', 'CHANGE_ME', 'CHANGEME', 'PLACEHOLDER', 'BASE64_DE', 'EXEMPLO']
    .some(marker => password.toUpperCase().includes(marker));
}

function passesRule(rule: PasswordRule, password: string): boolean {
  switch (rule) {
    case 'length':
      return [...password].length >= 15 && [...password].length <= 128;
    case 'sequence':
      return !isSimpleSequence(password);
    case 'diversity':
      return new Set([...password]).size > 2;
    case 'repetition':
      return !isRepeatedSubstring(password);
    case 'placeholder':
      return !containsPlaceholder(password);
  }
}

function passwordChangeError(error: unknown, isOwnAccount: boolean): string {
  const failure = error instanceof PasswordChangeFailure ? error : undefined;
  const response = failure?.originalError instanceof HttpErrorResponse ? failure.originalError : error;
  const stage = failure?.stage ?? 'password';

  if (!(response instanceof HttpErrorResponse)) {
    return 'Falha inesperada ao alterar a senha. Tente novamente.';
  }
  if (response.status === 0) {
    return stage === 'csrf'
      ? 'Falha de rede ao obter o token CSRF. Verifique a conexão e o proxy da API.'
      : 'Falha de rede ao enviar a alteração de senha. Verifique a conexão e o proxy da API.';
  }
  if (response.status === 401) {
    return stage === 'csrf'
      ? 'Sessão inválida ou expirada ao obter o token CSRF. Entre novamente.'
      : 'Sessão inválida ou expirada. Entre novamente.';
  }
  if (response.status === 403) {
    return stage === 'csrf'
      ? 'A API recusou a emissão do token CSRF. Verifique a sessão e tente novamente.'
      : 'Você não tem permissão para alterar a senha deste usuário.';
  }
  if (response.status === 404) {
    if (stage === 'csrf' || isOwnAccount || isMissingRoute(response.error)) {
      return stage === 'csrf'
        ? 'Rota GET /api/Auth/csrf não encontrada no backend.'
        : 'Rota POST de alteração de senha não encontrada no backend.';
    }
    return 'Usuário alvo não encontrado para alteração de senha.';
  }
  if (response.status === 409) {
    return 'Conflito: a conta ou o usuário alvo foi alterado ou desativado. Atualize os dados e tente novamente.';
  }
  if (response.status === 429) {
    return 'Limite de tentativas excedido. Aguarde antes de tentar novamente.';
  }
  if (response.status === 400) {
    if (stage === 'csrf') {
      return 'O backend recusou a emissão do token CSRF. Verifique o cookie e a configuração HTTPS.';
    }
    return validationProblemMessage(response.error);
  }
  if (response.status >= 500) {
    return `Erro ${response.status} no backend ao ${stage === 'csrf' ? 'obter o token CSRF' : 'alterar a senha'}. Tente novamente.`;
  }
  return `Falha HTTP ${response.status} ao ${stage === 'csrf' ? 'obter o token CSRF' : 'alterar a senha'}.`;
}

function validationProblemMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('errors' in body)) {
    return 'Dados inválidos ou senha atual incorreta. Confira os campos e tente novamente.';
  }

  const errors = (body as { errors?: Record<string, unknown> }).errors;
  const entries = Object.entries(errors ?? {});
  const field = entries.map(([key]) => key.toLowerCase());
  const messages = entries.flatMap(([, value]) => Array.isArray(value) ? value : []);
  if (!messages.length) {
    return 'Dados inválidos. Confira os campos e tente novamente.';
  }

  const detail = messages.filter((value): value is string => typeof value === 'string').join(' ');
  if (field.some(key => key.includes('senhaatual')) || /senha atual|senhaAtualSolicitante/i.test(detail)) {
    return 'A senha atual não confere ou está inválida.';
  }
  if (field.some(key => key === 'novasenha') || /nova senha|novaSenha/i.test(detail)) {
    return `A nova senha não atende à política. ${detail}`;
  }
  if (field.some(key => key.includes('confirmacao')) || /confirmacaoNovaSenha|confirmação/i.test(detail)) {
    return 'A confirmação não corresponde à nova senha.';
  }
  return `Dados inválidos. ${detail}`;
}

function isMissingRoute(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const problem = body as { title?: unknown; detail?: unknown };
  const message = `${String(problem.title ?? '')} ${String(problem.detail ?? '')}`;
  return /no route|not found|não existe|rota/i.test(message);
}
