import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth';
import { Component, inject } from '@angular/core';
import { InputComponent } from '../../shared/components/input/input';
import { ButtonComponent } from '../../shared/components/button/button';
import { emailFormatValidator } from '../../shared/validators/email.validator';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputComponent, ButtonComponent],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  loading = false;
  error = '';

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, emailFormatValidator]],
    password: ['', Validators.required]
  });

  get emailControl() {
    return this.form.controls.email;
  }

  get emailErrorMessage(): string {
    if (!this.emailControl.dirty && !this.emailControl.touched) return '';
    if (this.emailControl.hasError('required')) return 'Informe o e-mail.';
    if (this.emailControl.hasError('emailFormat')) return 'Digite um e-mail valido.';
    return '';
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading = true;
    this.error = '';

    this.authService.login(email, password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/home']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading = false;

        switch (err.status) {
          case 400:
            this.error = 'Não foi possível processar a solicitação. Verifique os dados e tente novamente.';
            break;

          case 401:
            this.error = 'E-mail ou senha inválidos.';
            break;

          case 403:
            this.error = 'Você não tem permissão para realizar esta ação.';
            break;

          case 429:
            this.error = 'Muitas tentativas de login. Aguarde um momento e tente novamente.';
            break;

          default:
            this.error = 'Não foi possível realizar o login. Tente novamente.';
            break;
        }
      }
    });
  }
}
