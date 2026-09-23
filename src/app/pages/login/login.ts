import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth';
import { Component, inject, signal } from '@angular/core';
import { InputComponent } from '../../shared/components/input/input';
import { ButtonComponent } from '../../shared/components/button/button';
import { emailFormatValidator } from '../../shared/validators/email.validator';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, InputComponent, ButtonComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})


export class Login {

 private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  // Signals: o app é zoneless, então o estado atualizado em callbacks HTTP precisa ser reativo.
  loading = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, emailFormatValidator]],
    password: ['', Validators.required]
  });

  get emailControl() {
    return this.form.controls.email;
  }

  get emailErrorMessage(): string {
    if (!this.emailControl.dirty && !this.emailControl.touched) {
      return '';
    }

    if (this.emailControl.hasError('required')) {
      return 'Informe o e-mail.';
    }

    if (this.emailControl.hasError('emailFormat')) {
      return 'Digite um e-mail valido.';
    }

    return '';
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();

    this.loading.set(true);
    this.error.set('');

    this.authService.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/']);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'E-mail ou senha inválidos.';
      }

      if (err.status === 429) {
        const seconds = Number(err.headers.get('Retry-After'));
        return seconds > 0
          ? `Muitas tentativas. Tente novamente em ${seconds} segundos.`
          : 'Muitas tentativas. Aguarde um instante e tente novamente.';
      }

      if (err.status === 0) {
        return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
      }
    }

    return 'Não foi possível entrar agora. Tente novamente em instantes.';
  }
}
