import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap, take, timer } from 'rxjs';
import { Cargo, UserAddress, UserAddressRequest, User as UserModel } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth';
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

type FieldName =
  | 'nome'
  | 'email'
  | 'senha'
  | 'confirmarSenha'
  | 'cargoId'
  | 'tipoSanguineo'
  | 'doencasAlergias';

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

const PERFIS_GESTAO_CADASTROS = new Set(['ADM', 'DIR', 'DIRA', 'SEC', 'TES']);

function descreverErroFoto(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  switch (error.status) {
    case 0:
      return 'Sem conexão com o servidor. Verifique sua conexão e tente novamente.';
    case 400:
    case 413:
    case 415:
    case 422:
      return 'Arquivo inválido ou acima dos limites permitidos. Selecione JPEG, PNG ou WebP dentro do limite de 10 MB.';
    case 401:
      return 'Sua sessão expirou. Entre novamente para continuar.';
    case 403:
      return 'Você não tem permissão para enviar ou visualizar esta foto.';
    case 429:
      return 'Limite de envios atingido. Aguarde alguns minutos antes de tentar novamente.';
    default:
      return error.status >= 500
        ? 'O servidor não conseguiu processar a foto. Tente novamente mais tarde.'
        : fallback;
  }
}

@Component({
  selector: 'app-user-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, PrimaryInput, PrimarySelect, UploadFoto],
  templateUrl: './user-register.html',
  styleUrls: ['./user-register.scss'],
})
export class UserRegister implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);

  readonly senhaMinimo = SENHA_MINIMO;
  readonly senhaMaximo = SENHA_MAXIMO;
  readonly podeGerenciarCadastros = computed(() =>
    PERFIS_GESTAO_CADASTROS.has(this.auth.user()?.cargo.role ?? ''),
  );

  /** Campos aceitos por POST/PUT /api/Usuarios; os dados de saúde são enviados apenas ao endpoint administrativo. */
  form = this.fb.nonNullable.group(
    {
      nome: ['', [notBlank, Validators.maxLength(NOME_MAXIMO)]],
      email: ['', [notBlank, Validators.maxLength(EMAIL_MAXIMO), emailFormatValidator]],
      senha: ['', [Validators.required, Validators.minLength(SENHA_MINIMO), Validators.maxLength(SENHA_MAXIMO)]],
      confirmarSenha: ['', Validators.required],
      cargoId: ['', Validators.required],
      tipoSanguineo: [''],
      doencasAlergias: ['', Validators.maxLength(2000)],
      cep: [''],
      logradouro: [''],
      bairro: [''],
      numero: [''],
      complemento: [''],
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
  readonly fotoEnviando = signal(false);
  readonly usuarioPendenteFoto = signal<UserModel | null>(null);
  readonly fotoAtual = signal<SafeUrl | null>(null);
  readonly fotoPreview = signal<SafeUrl | null>(null);
  readonly errorMessage = signal('');
  readonly submitted = signal(false);
  readonly cepLoading = signal(false);
  readonly cepFeedback = signal('');
  private readonly enderecoReferencia = signal<UserAddress | null>(null);
  private readonly enderecoPreenchidoViaCep = signal<{ logradouro: string; bairro: string } | null>(null);
  private arquivoFoto: File | null = null;
  private fotoObjectUrl: string | null = null;
  private fotoPreviewObjectUrl: string | null = null;
  readonly tipoSanguineoOptions = [
    { label: 'A+', value: 'A+' },
    { label: 'A-', value: 'A-' },
    { label: 'B+', value: 'B+' },
    { label: 'B-', value: 'B-' },
    { label: 'AB+', value: 'AB+' },
    { label: 'AB-', value: 'AB-' },
    { label: 'O+', value: 'O+' },
    { label: 'O-', value: 'O-' },
  ];

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
    this.configurarConsultaCep();
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

    if (this.usuarioPendenteFoto()) {
      if (!this.arquivoFoto) {
        this.errorMessage.set('Selecione uma foto válida antes de reenviar.');
        return;
      }
      this.errorMessage.set('');
      this.enviarFotoPendente();
      return;
    }

    this.submitted.set(true);
    this.errorMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      nome, email, senha, cargoId, tipoSanguineo, doencasAlergias,
      cep, logradouro, bairro, numero, complemento,
    } = this.form.getRawValue();
    const dadosSaude = {
      tipoSanguineo: tipoSanguineo || null,
      doencasAlergias: doencasAlergias.trim() || null,
    };
    const usuario = this.usuarioEmEdicao();
    const endereco = this.criarEndereco(
      cep,
      logradouro,
      bairro,
      numero,
      complemento,
      Boolean(usuario?.endereco),
    );
    const request$ = usuario
      ? this.userService.atualizarUsuario(usuario.id, {
          nome: nome.trim(),
          email: email.trim(),
          cargoId,
          ...dadosSaude,
          ...(endereco ? { endereco } : {}),
        })
      : this.userService.criarUsuario({
          nome: nome.trim(),
          email: email.trim(),
          senha,
          cargoId,
          ...dadosSaude,
          ...(endereco ? { endereco } : {}),
        });

    this.saving.set(true);
    request$
      .pipe(
        take(1),
        finalize(() => {
          if (!this.usuarioPendenteFoto()) {
            this.saving.set(false);
          }
        }),
      )
      .subscribe({
        next: salvo => {
          if (this.arquivoFoto && this.podeGerenciarCadastros()) {
            this.usuarioPendenteFoto.set(salvo);
            this.enviarFotoPendente(Boolean(usuario));
            return;
          }
          this.voltarParaListagem(salvo, Boolean(usuario));
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
        tipoSanguineo: 'Selecione um tipo sanguíneo válido.',
        doencasAlergias: 'Verifique este campo.',
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

  cepFormatoInvalido(): boolean {
    const control = this.form.controls.cep;
    const quantidadeDigitos = control.value.replace(/\D/g, '').length;
    return control.touched && quantidadeDigitos > 0 && quantidadeDigitos !== 8;
  }

  onFotoSelecionada(file: File | null): void {
    this.arquivoFoto = file;
    this.revogarFotoPreview();
    if (file) {
      this.fotoPreviewObjectUrl = URL.createObjectURL(file);
      this.fotoPreview.set(this.sanitizer.bypassSecurityTrustUrl(this.fotoPreviewObjectUrl));
    }
    this.errorMessage.set('');
  }

  ngOnDestroy(): void {
    this.revogarFotoAtual();
    this.revogarFotoPreview();
  }

  private carregarUsuario(usuario: UserModel): void {
    this.usuarioEmEdicao.set(usuario);
    this.form.patchValue({
      nome: usuario.nome,
      email: usuario.email,
      cargoId: usuario.cargo?.id ?? '',
      tipoSanguineo: usuario.tipoSanguineo ?? '',
      doencasAlergias: usuario.doencasAlergias ?? '',
      cep: usuario.endereco?.cep ?? '',
      logradouro: usuario.endereco?.logradouro ?? '',
      bairro: usuario.endereco?.bairro ?? '',
      numero: usuario.endereco?.numero ?? '',
      complemento: usuario.endereco?.complemento ?? '',
    }, { emitEvent: false });
    this.enderecoReferencia.set(usuario.endereco ?? null);
    // PUT /api/Usuarios/{id} não altera senha: os campos continuam na tela, mas desabilitados e fora do payload.
    this.form.controls.senha.disable();
    this.form.controls.confirmarSenha.disable();
    if (usuario.fotoUrl && this.podeGerenciarCadastros()) {
      this.carregarFoto(usuario.id);
    }
  }

  private carregarFoto(usuarioId: string): void {
    this.revogarFotoAtual();
    this.userService
      .obterFoto(usuarioId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: foto => {
          this.revogarFotoAtual();
          this.fotoObjectUrl = URL.createObjectURL(foto);
          this.fotoAtual.set(this.sanitizer.bypassSecurityTrustUrl(this.fotoObjectUrl));
        },
        error: error => {
          this.revogarFotoAtual();
          if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
            this.errorMessage.set(descreverErroFoto(error, 'Não foi possível carregar a foto.'));
          }
        },
      });
  }

  private enviarFotoPendente(cadastroExistente = Boolean(this.usuarioEmEdicao())): void {
    const usuario = this.usuarioPendenteFoto();
    const arquivo = this.arquivoFoto;
    if (!usuario || !arquivo) {
      return;
    }

    this.saving.set(true);
    this.fotoEnviando.set(true);
    this.userService
      .enviarFoto(usuario.id, arquivo)
      .pipe(
        take(1),
        finalize(() => {
          this.saving.set(false);
          this.fotoEnviando.set(false);
        }),
      )
      .subscribe({
        next: atualizado => {
          this.usuarioPendenteFoto.set(null);
          this.arquivoFoto = null;
          this.voltarParaListagem(atualizado, cadastroExistente);
        },
        error: error => {
          this.errorMessage.set(descreverErroFoto(error, 'Não foi possível enviar a foto. Tente novamente.'));
        },
      });
  }

  private voltarParaListagem(usuario: UserModel, cadastroExistente: boolean): void {
    const feedback = cadastroExistente
      ? `Cadastro de ${usuario.nome} atualizado com sucesso.`
      : `${usuario.nome} cadastrado com sucesso.`;
    this.router.navigate(['/desbravadores'], { state: { feedback } satisfies UsuarioNavigationState });
  }

  private revogarFotoAtual(): void {
    if (this.fotoObjectUrl) {
      URL.revokeObjectURL(this.fotoObjectUrl);
      this.fotoObjectUrl = null;
    }
    this.fotoAtual.set(null);
  }

  private revogarFotoPreview(): void {
    if (this.fotoPreviewObjectUrl) {
      URL.revokeObjectURL(this.fotoPreviewObjectUrl);
      this.fotoPreviewObjectUrl = null;
    }
    this.fotoPreview.set(null);
  }

  private configurarConsultaCep(): void {
    this.form.controls.cep.valueChanges
      .pipe(
        map(cep => cep.replace(/\D/g, '')),
        distinctUntilChanged(),
        switchMap(cep => {
          this.cepFeedback.set('');
          if (cep.length !== 8) {
            this.cepLoading.set(false);
            return of(null);
          }

          this.cepLoading.set(true);
          this.cepFeedback.set('Consultando CEP...');
          return timer(350).pipe(
            switchMap(() => this.userService.consultarCep(cep)),
            map(endereco => ({ endereco, erro: null as unknown })),
            catchError(erro => of({ endereco: null, erro })),
            finalize(() => this.cepLoading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(resultado => {
        if (!resultado) {
          return;
        }

        if (resultado.erro) {
          this.cepFeedback.set(
            resultado.erro instanceof HttpErrorResponse && resultado.erro.status === 404
              ? 'CEP não encontrado. Preencha o endereço manualmente.'
              : 'Não foi possível consultar o CEP. Preencha o endereço manualmente.',
          );
          return;
        }

        const endereco = resultado.endereco!;
        if (endereco.erro) {
          this.cepFeedback.set('CEP não encontrado. Preencha o endereço manualmente.');
          return;
        }

        this.enderecoReferencia.set(endereco);
        this.preencherEnderecoConsultado(endereco);
        this.cepFeedback.set('CEP encontrado. Confira o endereço e informe o número.');
      });
  }

  private preencherEnderecoConsultado(endereco: UserAddress): void {
    const anteriores = this.enderecoPreenchidoViaCep();
    const logradouro = this.form.controls.logradouro;
    const bairro = this.form.controls.bairro;
    const ruaAtual = logradouro.value.trim();
    const bairroAtual = bairro.value.trim();
    const ruaRetornada = endereco.logradouro?.trim() ?? '';
    const bairroRetornado = endereco.bairro?.trim() ?? '';

    if (ruaRetornada && (!ruaAtual || ruaAtual === anteriores?.logradouro)) {
      logradouro.setValue(ruaRetornada);
    }
    if (bairroRetornado && (!bairroAtual || bairroAtual === anteriores?.bairro)) {
      bairro.setValue(bairroRetornado);
    }
    this.enderecoPreenchidoViaCep.set({
      logradouro: ruaRetornada,
      bairro: bairroRetornado,
    });
  }

  private criarEndereco(
    cep: string,
    logradouro: string,
    bairro: string,
    numero: string,
    complemento: string,
    manterEndereco: boolean,
  ): UserAddressRequest | null {
    const preenchido = [cep, logradouro, bairro, numero, complemento].some(valor => valor.trim());
    if (!preenchido && !manterEndereco) {
      return null;
    }

    const cepNormalizado = cep.replace(/\D/g, '');
    const referencia = this.enderecoReferencia();
    const camposViaCep = referencia?.cep?.replace(/\D/g, '') === cepNormalizado ? referencia : {};

    return {
      ...camposViaCep,
      cep: cepNormalizado.length === 8 ? cep : '',
      logradouro: logradouro.trim(),
      bairro: bairro.trim(),
      numero: numero.trim(),
      complemento: complemento.trim(),
    };
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
