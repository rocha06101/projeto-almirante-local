import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { PasswordToggleComponent } from '../password-toggle/password-toggle';

@Component({
  selector: 'app-password-change-modal',
  standalone: true,
  templateUrl: './password-change-modal.html',
  styleUrl: './password-change-modal.scss',
  imports: [PasswordToggleComponent],
})
export class PasswordChangeModal implements OnInit {
  @Input() currentEmail = '';
  @Output() closed = new EventEmitter<void>();

  readonly emailChangeStep = signal(false);
  readonly emailForChange = signal('');
  readonly passwordSaveMessage = signal('');
  readonly currentPasswordVisible = signal(false);
  readonly newPasswordVisible = signal(false);
  readonly confirmPasswordVisible = signal(false);

  ngOnInit(): void {
    this.emailForChange.set(this.currentEmail);
  }

  continueToEmailChange(): void {
    this.emailChangeStep.set(true);
    this.passwordSaveMessage.set('');
  }

  returnToPasswordStep(): void {
    this.emailChangeStep.set(false);
    this.passwordSaveMessage.set('');
  }

  submitPasswordChange(): void {
    this.passwordSaveMessage.set(
      'A alteração ainda não foi salva: a integração com a API de alteração de senha não está disponível.',
    );
  }

  close(): void {
    this.closed.emit();
  }
}
