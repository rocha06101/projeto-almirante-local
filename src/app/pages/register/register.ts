import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputComponent } from '../../shared/components/input/input';
import { ButtonComponent } from '../../shared/components/button/button';
import { SelectComponent } from '../../shared/components/select/select';
import { emailFormatValidator } from '../../shared/validators/email.validator';
import { inject } from '@angular/core';


@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule, InputComponent, ButtonComponent, SelectComponent],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, emailFormatValidator]],
    password: ['', Validators.required],
    confirmPassword: ['', Validators.required],
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
    }
  }
}
