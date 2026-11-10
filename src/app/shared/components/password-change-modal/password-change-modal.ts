import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { User as UserService } from '../../../core/services/user';
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

type ModalStep = 'password' | 'email';

const requiredEmailValidator: ValidatorFn = control =>
  String(control.value ?? '').trim() ? null : { required: true };

const emailFormatValidator: ValidatorFn = control => {
  const email = String(control.value ?? '').trim();
  return email ? Validators.email(new FormControl(email)) : null;
};

const asciiEmailValidator: ValidatorFn = control =>
  /^[\x00-\x7F]*$/.test(String(control.value ?? '')) ? null : { ascii: true };

@Component({
  selector: 'app-password-change-modal',
  standalone: true,
  templateUrl: './password-change-modal.html',
  styleUrl: './password-change-modal.scss',
  imports: [ReactiveFormsModule, PasswordToggleComponent],
})
export class PasswordChangeModal implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  @Input() targetUserId = '';
  @Input() isOwnAccount = true;
  @Input() originalEmail = '';
  @Input() targetUserName = '';
  @Input() targetUserCargoId = '';
  @Output() closed = new EventEmitter<void>();

  @ViewChild('emailInput') private emailInput?: ElementRef<HTMLInputElement>;

  readonly currentPasswordVisible = signal(false);
  readonly newPasswordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);
  readonly isSaving = signal(false);
  readonly step = signal<ModalStep>('password');
  readonly passwordForm = this.fb.nonNullable.group({
    senhaAtualSolicitante: '',
    novaSenha: this.fb.nonNullable.control('', passwordValidators),
    confirmacaoNovaSenha: '',
  });
  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [requiredEmailValidator, emailFormatValidator, asciiEmailValidator, Validators.maxLength(100)]],
  });

  readonly passwordRules = passwordRules;
  private emailPending = false;
  private passwordPending = false;
  private emailWasSaved = false;
  private pendingToastId?: string;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private completionTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.emailForm.controls.email.setValue(this.originalEmail);
  }

  ngOnDestroy(): void {
    this.clearTimer('focus');
    this.clearTimer('completion');
    this.dismissPendingToast();
  }

  ruleStatus(rule: PasswordRule): RuleStatus {
    const control = this.passwordForm.controls.novaSenha;
    const password = control.value;
    if (!password) {
      return 'neutral';
    }
    return control.hasError(rule) ? 'invalid' : 'valid';
  }

  get canAdvance(): boolean {
    const { senhaAtualSolicitante, novaSenha, confirmacaoNovaSenha } = this.passwordForm.getRawValue();
    const hasPassword = !!senhaAtualSolicitante || !!novaSenha || !!confirmacaoNovaSenha;
    return !this.isSaving() && (!hasPassword || this.isPasswordChangeValid);
  }

  get canSave(): boolean {
    return !this.isSaving() && this.emailForm.valid;
  }

  get isPasswordChangeValid(): boolean {
    const { senhaAtualSolicitante, novaSenha, confirmacaoNovaSenha } = this.passwordForm.getRawValue();
    return (
      !!senhaAtualSolicitante &&
      this.passwordRules.every(rule => this.ruleStatus(rule.key) === 'valid') &&
      !!confirmacaoNovaSenha &&
      novaSenha === confirmacaoNovaSenha
    );
  }

  get emailChanged(): boolean {
    return normalizeEmail(this.emailForm.controls.email.value) !== normalizeEmail(this.originalEmail);
  }

  get confirmationStatus(): RuleStatus {
    const { novaSenha, confirmacaoNovaSenha } = this.passwordForm.getRawValue();
    if (!confirmacaoNovaSenha) {
      return 'neutral';
    }
    return novaSenha === confirmacaoNovaSenha ? 'valid' : 'invalid';
  }

  advanceToEmail(): void {
    if (!this.canAdvance) {
      return;
    }
    this.step.set('email');
  }

  changePassword(): void {
    this.step.set('password');
  }

  focusEmail(): void {
    this.step.set('email');
    this.clearTimer('focus');
    this.focusTimer = setTimeout(() => this.emailInput?.nativeElement.focus(), 0);
  }

  submitChanges(): void {
    if (!this.canSave || this.isSaving()) {
      return;
    }

    const passwordChanged = this.isPasswordChangeValid;
    const emailChanged = this.emailChanged;
    if (!emailChanged && !passwordChanged) {
      this.showToast('Nenhum dado foi alterado.');
      return;
    }

    if (this.isOwnAccount && emailChanged) {
      this.showToast(
        'Não foi possível alterar o e-mail próprio: a API local não oferece uma rota para isso. Nenhuma alteração foi gravada.',
      );
      return;
    }

    if (emailChanged && passwordChanged) {
      this.startSaving(true, true);
      return;
    }

    if (emailChanged) {
      this.showToast('Somente o email foi alterado.', [
        { label: 'Alterar senha', onClick: () => this.changePassword() },
        { label: 'Salvar mesmo assim', onClick: () => this.startSaving(true, false) },
      ]);
      return;
    }

    this.showToast('Somente a senha foi alterada', [
      { label: 'Alterar e-mail', onClick: () => this.focusEmail() },
      { label: 'Salvar assim mesmo', onClick: () => this.startSaving(false, true) },
    ]);
  }

  close(): void {
    if (this.isSaving() || this.completionTimer) {
      return;
    }
    this.passwordForm.reset();
    this.emailForm.reset({ email: this.originalEmail });
    this.dismissPendingToast();
    this.closed.emit();
  }

  private startSaving(saveEmail: boolean, savePassword: boolean): void {
    if (this.isSaving() || this.completionTimer) {
      return;
    }
    this.dismissPendingToast();
    this.emailPending = saveEmail;
    this.passwordPending = savePassword;
    this.emailWasSaved = false;
    this.isSaving.set(true);
    this.saveNextPendingChange();
  }

  private saveNextPendingChange(): void {
    if (this.emailPending) {
      if (!this.targetUserId || !this.targetUserName || !this.targetUserCargoId) {
        this.handleSaveError('email', new Error('Dados do usuário incompletos para salvar o e-mail.'));
        return;
      }

      this.userService
        .atualizarUsuario(this.targetUserId, {
          nome: this.targetUserName,
          email: this.emailForm.controls.email.value.trim(),
          cargoId: this.targetUserCargoId,
        })
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.emailPending = false;
            this.emailWasSaved = true;
            this.saveNextPendingChange();
          },
          error: (error: unknown) => this.handleSaveError('email', error),
        });
      return;
    }

    if (this.passwordPending) {
      if (!this.targetUserId) {
        this.handleSaveError('password', new Error('Não foi possível identificar o usuário.'));
        return;
      }
      const request = this.passwordForm.getRawValue();
      const change$ = this.isOwnAccount
        ? this.auth.alterarMinhaSenha(request)
        : this.auth.alterarSenhaDeUsuario(this.targetUserId, request);
      change$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.passwordPending = false;
          this.finishSaving();
        },
        error: (error: unknown) => this.handleSaveError('password', error),
      });
      return;
    }

    this.finishSaving();
  }

  private handleSaveError(operation: 'email' | 'password', error: unknown): void {
    this.isSaving.set(false);
    const details =
      operation === 'email' ? emailChangeError(error) : passwordChangeError(error);
    const message = this.emailWasSaved
      ? `O e-mail foi alterado, mas a senha não. ${details}`
      : this.emailPending && this.passwordPending
        ? `Não foi possível alterar o e-mail. A senha não foi enviada. ${details}`
        : details;
    this.showToast(message, [
      {
        label: this.emailWasSaved ? 'Repetir só a senha' : 'Tentar novamente',
        onClick: () => this.retryPendingChanges(),
      },
    ]);
  }

  private retryPendingChanges(): void {
    if (this.isSaving() || (!this.emailPending && !this.passwordPending)) {
      return;
    }
    this.isSaving.set(true);
    this.saveNextPendingChange();
  }

  private finishSaving(): void {
    this.isSaving.set(false);
    this.dismissPendingToast();
    this.pendingToastId = this.toast.success('Dados alterados', { duration: 2000 });
    this.completionTimer = setTimeout(() => {
      this.completionTimer = undefined;
      this.passwordForm.reset();
      this.emailForm.reset({ email: this.originalEmail });
      this.closed.emit();
      if (this.isOwnAccount && !this.emailPending) {
        this.auth.expireSession();
      } else {
        void this.router.navigate(['/desbravadores']);
      }
    }, 2000);
  }

  private showToast(
    message: string,
    actions: { label: string; onClick: () => void }[] = [],
  ): void {
    this.dismissPendingToast();
    this.pendingToastId = this.toast.error(message, { actions, duration: 0 });
  }

  private dismissPendingToast(): void {
    if (this.pendingToastId) {
      this.toast.dismiss(this.pendingToastId);
      this.pendingToastId = undefined;
    }
  }

  private clearTimer(timer: 'focus' | 'completion'): void {
    if (timer === 'focus' && this.focusTimer) {
      clearTimeout(this.focusTimer);
      this.focusTimer = undefined;
    } else if (timer === 'completion' && this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = undefined;
    }
  }
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

function passwordChangeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) {
      return 'Você não tem permissão para alterar a senha deste usuário.';
    }
    if (error.status === 429) {
      return 'Muitas tentativas de alteração de senha. Aguarde e tente novamente.';
    }
    if (error.status === 400) {
      return 'A senha atual pode estar incorreta ou a nova senha não atende à política do servidor.';
    }
  }
  return 'Não foi possível alterar a senha. Tente novamente.';
}

function emailChangeError(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 409) {
    return 'Este e-mail já está sendo usado por outro usuário.';
  }
  return 'Não foi possível alterar o e-mail. Tente novamente.';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
