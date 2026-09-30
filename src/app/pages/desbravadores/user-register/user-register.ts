import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize, take } from 'rxjs';
import { Cargo, User as UserModel } from '../../../core/models/user.model';
import { User as UserService } from '../../../core/services/user';
import { PrimaryInput } from '../../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../../shared/components/primary-select/primary-select';
import { UploadFoto } from '../../../shared/components/upload-foto/upload-foto';
import { emailFormatValidator } from '../../../shared/validators/email.validator';
import { UsuarioNavigationState, readNavigationState } from '../usuario-navigation';
import { describeUsuarioError, usuarioFieldErrors } from '../usuarios-api-errors';

/** Limites de UsuarioConteudoValidator e PasswordPolicy no backend (a API continua sendo a fonte de verdade). */
export const NOME_MAXIMO = 200;
export const EMAIL_MAXIMO = 256;
export const SENHA_MINIMO = 12;
export const SENHA_MAXIMO = 128;

type FieldName = 'nome' | 'email' | 'senha' | 'confirmarSenha' | 'cargoId';

function notBlank(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim() ? null : { required: true };
}

function senhasIguais(group: AbstractControl): ValidationErrors | null {
  const senha = group.get('senha');
  const confirmar = group.get('confirmarSenha');
  if (!senha || !confirmar || senha.disabled || !confirmar.value) {
    return null;
  }
  return senha.value === confirmar.value ? null : { senhasDiferentes: true };
}

@Component({
  selector: 'app-user-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, PrimaryInput, PrimarySelect, UploadFoto],
  templateUrl: './user-register.html',
  styleUrls: ['./user-register.scss'],
})
export class UserRegister implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);

  readonly senhaMinimo = SENHA_MINIMO;
  readonly senhaMaximo = SENHA_MAXIMO;

  /** Somente os campos aceitos por POST/PUT /api/Usuarios; os demais campos da tela são apenas visuais. */
  form = this.fb.nonNullable.group(
    {
      nome: ['', [notBlank, Validators.maxLength(NOME_MAXIMO)]],
      email: ['', [notBlank, Validators.maxLength(EMAIL_MAXIMO), emailFormatValidator]],
      senha: ['', [Validators.required, Validators.minLength(SENHA_MINIMO), Validators.maxLength(SENHA_MAXIMO)]],
      confirmarSenha: ['', Validators.required],
      cargoId: ['', Validators.required],
    },
    { validators: senhasIguais },
  );

  /** Usuário em edição (vem da listagem via estado de navegação). */
  readonly usuarioEmEdicao = signal<UserModel | null>(null);
  readonly isEdicao = computed(() => this.usuarioEmEdicao() !== null);

  readonly cargos = signal<Cargo[]>([]);
  readonly isLoadingCargos = signal(true);
  readonly cargosError = signal('');
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly submitted = signal(false);

  /** Só cargos ativos: a API recusa cargoId inativo. Exibe o nome, nunca a role técnica. */
  readonly cargoOptions = computed(() =>
    this.cargos()
      .filter(cargo => cargo.ativo)
      .map(cargo => ({ label: cargo.nome, value: cargo.id })),
  );

  private readonly edicaoSolicitada: boolean;

  constructor() {
    const state = readNavigationState(this.router);
    this.edicaoSolicitada = this.route.snapshot.data['modo'] === 'editar';
    if (this.edicaoSolicitada && state.usuario) {
      this.carregarUsuario(state.usuario);
    }
  }

  ngOnInit(): void {
    if (this.edicaoSolicitada && !this.usuarioEmEdicao()) {
      this.errorMessage.set('Não foi possível identificar o usuário. Volte à listagem e selecione-o novamente.');
      this.form.disable();
    }
    this.carregarCargos();
  }

  carregarCargos(): void {
    this.isLoadingCargos.set(true);
    this.cargosError.set('');

    this.userService
      .listarCargos()
      .pipe(
        take(1),
        finalize(() => this.isLoadingCargos.set(false)),
      )
      .subscribe({
        next: cargos => this.cargos.set(cargos),
        error: error => this.cargosError.set(describeUsuarioError(error, 'Não foi possível carregar os cargos.')),
      });
  }

  salvar(): void {
    if (this.saving()) {
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { nome, email, senha, cargoId } = this.form.getRawValue();
    const usuario = this.usuarioEmEdicao();
    const request$ = usuario
      ? this.userService.atualizarUsuario(usuario.id, { nome: nome.trim(), email: email.trim(), cargoId })
      : this.userService.criarUsuario({ nome: nome.trim(), email: email.trim(), senha, cargoId });

    this.saving.set(true);
    request$
      .pipe(
        take(1),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: salvo => {
          const feedback = usuario
            ? `Cadastro de ${salvo.nome} atualizado com sucesso.`
            : `${salvo.nome} cadastrado com sucesso.`;
          this.router.navigate(['/desbravadores'], { state: { feedback } satisfies UsuarioNavigationState });
        },
        error: error => this.aplicarErro(error),
      });
  }

  cancelar(): void {
    this.router.navigate(['/desbravadores']);
  }

  fieldError(name: FieldName): string {
    const control = this.form.controls[name];
    const server = control.errors?.['server'] as string | undefined;
    if (server) {
      return server;
    }

    if (control.disabled || (!control.touched && !this.submitted())) {
      return '';
    }

    if (control.hasError('required')) {
      return {
        nome: 'Informe o nome.',
        email: 'Informe o e-mail.',
        senha: 'Informe a senha.',
        confirmarSenha: 'Confirme a senha.',
        cargoId: 'Selecione o cargo.',
      }[name];
    }
    if (control.hasError('emailFormat')) {
      return 'Digite um e-mail válido.';
    }
    if (control.hasError('minlength')) {
      return `A senha deve ter ao menos ${SENHA_MINIMO} caracteres.`;
    }
    if (control.hasError('maxlength')) {
      const max = (control.errors?.['maxlength'] as { requiredLength: number }).requiredLength;
      return `Use no máximo ${max} caracteres.`;
    }
    if (name === 'confirmarSenha' && this.form.hasError('senhasDiferentes')) {
      return 'As senhas não conferem.';
    }
    return '';
  }

  onFotoSelecionada(file: File): void {
    console.log('Foto selecionada:', file);
  }

  private carregarUsuario(usuario: UserModel): void {
    this.usuarioEmEdicao.set(usuario);
    this.form.patchValue({
      nome: usuario.nome,
      email: usuario.email,
      cargoId: usuario.cargo?.id ?? '',
    });
    // PUT /api/Usuarios/{id} não altera senha: os campos continuam na tela, mas desabilitados e fora do payload.
    this.form.controls.senha.disable();
    this.form.controls.confirmarSenha.disable();
  }

  private aplicarErro(error: unknown): void {
    const fields = usuarioFieldErrors(error);
    let naoMapeados = false;
    for (const [name, message] of Object.entries(fields)) {
      const control = this.form.get(name);
      if (control && control.enabled) {
        control.setErrors({ ...control.errors, server: message });
        control.markAsTouched();
      } else {
        naoMapeados = true;
      }
    }

    const hasFieldErrors = Object.keys(fields).length > 0;
    this.errorMessage.set(
      hasFieldErrors && !naoMapeados
        ? 'Verifique os campos destacados.'
        : describeUsuarioError(error, 'Não foi possível salvar o cadastro. Tente novamente.'),
    );
  }
}
