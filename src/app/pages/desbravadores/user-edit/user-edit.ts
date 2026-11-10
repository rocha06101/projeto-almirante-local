import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  EMPTY,
  catchError,
  concatMap,
  distinctUntilChanged,
  finalize,
  map,
  merge,
  of,
  switchMap,
  take,
  tap,
  timer,
  Subject,
} from 'rxjs';
import { User as UserModel } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth';
import { User as UserService } from '../../../core/services/user';
import { UserAvatarService } from '../../../core/services/user-avatar.service';
import { ToastService } from '../../../core/services/toast.service';
import { PasswordChangeModal } from '../../../shared/components/password-change-modal/password-change-modal';
import { PrimaryInput } from '../../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../../shared/components/primary-select/primary-select';
import { PrimaryTextarea } from '../../../shared/components/primary-textarea/primary-textarea';
import { RefreshButton } from '../../../shared/components/refresh-button/refresh-button';
import { cpfValidator } from '../../../shared/validators/cpf.validator';
import { apiDateToForm, formDateToApi, isValidFormDate } from '../../../shared/utils/profile-form';
import { onlyDigits } from '../../../shared/utils/masks';
import { readNavigationState } from '../usuario-navigation';
import { describeUsuarioError, usuarioFieldErrors } from '../usuarios-api-errors';

const isValidSelectedUser = (value: UserModel | undefined): value is UserModel =>
  !!value &&
  typeof value.id === 'string' &&
  !!value.id.trim() &&
  typeof value.nome === 'string' &&
  !!value.nome.trim() &&
  typeof value.email === 'string' &&
  !!value.email.trim() &&
  typeof (value.cargo?.id ?? value.cargoId) === 'string' &&
  !!(value.cargo?.id ?? value.cargoId)?.trim();

type CepFeedbackStatus = 'neutral' | 'loading' | 'success' | 'error';

interface CepFeedback {
  status: CepFeedbackStatus;
  message: string;
}

@Component({
  selector: 'app-user-edit',
  standalone: true,
  templateUrl: './user-edit.html',
  styleUrl: './user-edit.scss',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RefreshButton,
    PrimaryInput,
    PrimarySelect,
    PrimaryTextarea,
    PasswordChangeModal,
  ],
})
export class UserEdit implements OnDestroy {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly userAvatar = inject(UserAvatarService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly usuario = signal<UserModel | null>(null);
  readonly isLoaded = signal(false);
  readonly personalInfoInactive = signal(true);
  readonly responsibleInfoInactive = signal(true);
  readonly addressInfoInactive = signal(true);
  readonly cpfEditable = signal(false);
  readonly rgEditable = signal(false);
  readonly passwordModalOpen = signal(false);
  readonly saving = signal(false);
  readonly redirecting = signal(false);
  readonly photoSaving = signal(false);
  readonly photoLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly cepFeedback = signal<CepFeedback>({ status: 'neutral', message: '' });
  readonly fotoAtual = signal<string | null>(null);
  readonly pendingPhoto = signal<File | null>(null);
  readonly hasPendingPhoto = computed(() => this.pendingPhoto() !== null);
  private readonly cepRetry$ = new Subject<string>();
  private readonly cepReset$ = new Subject<void>();
  private fotoObjectUrl: string | null = null;
  private pendingPhotoObjectUrl: string | null = null;
  private readonly retiredPhotoObjectUrls = new Set<string>();

  readonly cargoResumo = new FormControl('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    nome: ['', [Validators.required, Validators.maxLength(200)]],
    cpf: ['', cpfValidator],
    rg: ['', [Validators.maxLength(20), Validators.pattern(/\d/)]],
    dataNascimento: ['', [Validators.maxLength(10), (control: AbstractControl) =>
      isValidFormDate(String(control.value ?? '')) ? null : { dateInvalid: true }]],
    responsavelNome: ['', Validators.maxLength(200)],
    responsavelTelefone: [''],
    responsavelEmail: ['', Validators.email],
    telefone: [''],
    tipoSanguineo: [''],
    doencasAlergias: ['', Validators.maxLength(2000)],
    cep: ['', Validators.pattern(/^\d{5}-?\d{3}$/)],
    bairro: [''],
    logradouro: [''],
    numero: [''],
    complemento: [''],
  });

  readonly nomeResumo = this.form.controls.nome;
  readonly emailResumo = new FormControl('', { nonNullable: true });
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

  constructor() {
    const candidate = readNavigationState(this.router).usuario;
    if (isValidSelectedUser(candidate)) {
      this.usuario.set(candidate);
      this.isLoaded.set(true);
      this.setRgValidators();
      this.patchUsuario(candidate);
      this.loadPhoto(candidate);
    } else {
      this.errorMessage.set(
        'Não foi possível identificar o usuário selecionado. Volte à listagem e selecione-o novamente.',
      );
    }

    this.configureCepLookup();
  }

  get currentEmail(): string {
    return this.usuario()?.email ?? '';
  }

  get isOwnAccount(): boolean {
    const userId = this.usuario()?.id;
    return !!userId && userId === this.auth.user()?.id;
  }

  enablePersonalInfoEditing(): void {
    if (this.canEditSection()) {
      this.personalInfoInactive.set(false);
      this.errorMessage.set('');
      this.successMessage.set('');
    }
  }

  enableResponsibleInfoEditing(): void {
    if (this.canEditSection()) {
      this.responsibleInfoInactive.set(false);
      this.errorMessage.set('');
      this.successMessage.set('');
    }
  }

  enableAddressEditing(): void {
    if (this.canEditSection()) {
      this.addressInfoInactive.set(false);
      this.errorMessage.set('');
      this.successMessage.set('');
    }
  }

  salvar(): void {
    this.salvarAlteracoes(false);
  }

  private salvarAlteracoes(ignorarDocumentosVazios: boolean): void {
    const usuario = this.usuario();
    if (!usuario || !this.isLoaded() || this.saving() || this.redirecting()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    const values = this.form.getRawValue();
    const hasDataChanges = this.hasDataChanges(usuario, values);
    const pendingPhoto = this.pendingPhoto();
    if (pendingPhoto && !this.isValidPhotoFile(pendingPhoto)) {
      const message = 'Selecione uma foto JPEG, PNG ou WebP de até 10 MB.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }
    const documentosVazios = this.documentosObrigatoriosVazios(usuario, values);
    if (documentosVazios.length && !ignorarDocumentosVazios) {
      this.confirmarDocumentosVazios(documentosVazios);
      return;
    }
    if (hasDataChanges && this.form.invalid) {
      this.form.markAllAsTouched();
      const message = this.validationMessage();
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }

    if (hasDataChanges && this.addressChanged(usuario, values) && this.addressNeedsCep(values)) {
      this.form.controls.cep.markAsTouched();
      const message = 'Informe um CEP válido antes de atualizar o endereço.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }
    if (!hasDataChanges && !pendingPhoto) {
      this.setSectionsInactive();
      this.form.markAsPristine();
      this.toast.error('Nenhuma alteração foi feita. Edite alguma informação antes de salvar.');
      return;
    }

    const payload = hasDataChanges ? this.createUserPayload(usuario, values) : null;
    let dataWasSaved = false;
    let photoUploadStarted = false;
    this.saving.set(true);
    const dataSave$ = payload
      ? this.userService.atualizarUsuario(usuario.id, payload).pipe(
          take(1),
          tap(updated => {
            dataWasSaved = true;
            this.commitUsuario(updated);
          }),
        )
      : of(usuario);

    dataSave$
      .pipe(
        concatMap(() => {
          if (!pendingPhoto) {
            return of(null);
          }
          photoUploadStarted = true;
          this.photoSaving.set(true);
          return this.userService.enviarFoto(usuario.id, pendingPhoto).pipe(
            take(1),
            tap(updated => {
              this.commitUsuario(updated);
              this.commitPendingPhoto();
              if (this.auth.user()?.id === updated.id) {
                this.userAvatar.reloadCurrentUserPhoto();
              }
            }),
          );
        }),
        catchError((error: unknown) => {
          if (photoUploadStarted && dataWasSaved) {
            const message =
              'Os dados foram salvos, mas a foto não pôde ser enviada. Clique em Salvar para tentar novamente.';
            this.errorMessage.set(message);
            this.toast.error(message);
          } else if (photoUploadStarted) {
            const message = describeUsuarioError(error, 'Não foi possível enviar a foto.');
            this.errorMessage.set(message);
            this.toast.error(message);
          } else {
            this.handleSaveError(error);
          }
          return EMPTY;
        }),
        finalize(() => {
          this.photoSaving.set(false);
          this.saving.set(false);
        }),
      )
      .subscribe({
        next: () => this.finishSaveSuccess(),
      });
  }

  openPasswordModal(): void {
    if (this.canEditSection()) {
      this.passwordModalOpen.set(true);
    }
  }

  closePasswordModal(): void {
    this.passwordModalOpen.set(false);
  }

  onPhotoError(): void {
    if (this.fotoAtual() === this.fotoObjectUrl) {
      this.revokeCurrentPhoto();
    } else {
      this.fotoAtual.set(null);
    }
  }

  selecionarFoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const usuario = this.usuario();
    if (!file || !usuario || this.saving() || this.photoLoading()) {
      return;
    }
    if (!this.isValidPhotoFile(file)) {
      const message = 'Selecione uma foto JPEG, PNG ou WebP de até 10 MB.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }

    let previewUrl: string;
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      const message = 'Não foi possível preparar a prévia da foto. Tente novamente.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }
    this.errorMessage.set('');
    const previousPreviewUrl = this.pendingPhotoObjectUrl;
    this.pendingPhotoObjectUrl = previewUrl;
    this.pendingPhoto.set(file);
    this.fotoAtual.set(this.pendingPhotoObjectUrl);
    this.retirePhotoObjectUrl(previousPreviewUrl);
  }

  cancel(): void {
    if (this.saving() || this.redirecting()) {
      return;
    }
    this.discardPendingPhoto();
    void this.router.navigate(['/desbravadores']);
  }

  ngOnDestroy(): void {
    this.revokeCurrentPhoto();
    this.revokePendingPhoto();
    for (const url of this.retiredPhotoObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.retiredPhotoObjectUrls.clear();
  }

  private patchUsuario(usuario: UserModel): void {
    const endereco = usuario.endereco;
    this.setCepValidators(Boolean(endereco?.cep));
    this.form.reset(
      {
        nome: usuario.nome ?? '',
        cpf: usuario.cpf ?? '',
        rg: usuario.rg ?? '',
        dataNascimento: apiDateToForm(usuario.dataNascimento),
        responsavelNome: usuario.responsavelNome ?? '',
        responsavelTelefone: usuario.responsavelTelefone ?? '',
        responsavelEmail: usuario.responsavelEmail ?? '',
        telefone: usuario.telefone ?? '',
        tipoSanguineo: usuario.tipoSanguineo ?? '',
        doencasAlergias: usuario.doencasAlergias ?? '',
        cep: endereco?.cep ?? '',
        bairro: endereco?.bairro ?? '',
        logradouro: endereco?.logradouro ?? '',
        numero: endereco?.numero ?? '',
        complemento: endereco?.complemento ?? '',
      },
      { emitEvent: false },
    );
    this.cepReset$.next();
    this.nomeResumo.setValue(usuario.nome ?? '');
    this.emailResumo.setValue(usuario.email ?? '');
    this.cargoResumo.setValue(usuario.cargo?.nome ?? usuario.funcao ?? '');
  }

  private canEditSection(): boolean {
    return this.isLoaded() && !this.saving() && !this.redirecting();
  }

  private setSectionsInactive(): void {
    this.personalInfoInactive.set(true);
    this.responsibleInfoInactive.set(true);
    this.addressInfoInactive.set(true);
    this.cpfEditable.set(false);
    this.rgEditable.set(false);
  }

  private replaceNavigationUser(usuario: UserModel): void {
    const currentState = this.location.getState();
    this.location.replaceState(this.location.path(), '', {
      ...(typeof currentState === 'object' && currentState !== null ? currentState : {}),
      usuario,
    });
  }

  private setRgValidators(): void {
    const rg = this.form.controls.rg;
    rg.setValidators([Validators.maxLength(20), Validators.pattern(/\d/)]);
    rg.updateValueAndValidity({ emitEvent: false });
  }

  private documentosObrigatoriosVazios(
    usuario: UserModel,
    values: ReturnType<typeof this.form.getRawValue>,
  ): Array<'cpf' | 'rg'> {
    const campos: Array<'cpf' | 'rg'> = [];
    if (!onlyDigits(values.cpf)) {
      campos.push('cpf');
    }
    if (!(usuario.ehCin ?? false) && !values.rg.trim()) {
      campos.push('rg');
    }
    return campos;
  }

  private confirmarDocumentosVazios(campos: Array<'cpf' | 'rg'>): void {
    const nomes = campos.map(campo => campo.toUpperCase());
    const textoCampos = nomes.length === 2 ? 'CPF e RG' : nomes[0];
    this.toast.warning(
      `${textoCampos} ${nomes.length === 1 ? 'está' : 'estão'} vazio${nomes.length === 1 ? '' : 's'}.`,
      {
        duration: 0,
        position: 'bottom-center',
        actions: [
          {
            label: `Editar ${textoCampos}`,
            onClick: () => {
              if (campos.includes('cpf')) {
                this.cpfEditable.set(true);
                this.form.controls.cpf.markAsTouched();
              }
              if (campos.includes('rg')) {
                this.rgEditable.set(true);
                this.form.controls.rg.markAsTouched();
              }
            },
          },
          {
            label: 'Manter assim',
            onClick: () => this.salvarAlteracoes(true),
          },
        ],
      },
    );
  }

  private setCepValidators(hasExistingCep: boolean): void {
    const cep = this.form.controls.cep;
    cep.setValidators([
      ...(hasExistingCep ? [Validators.required] : []),
      Validators.pattern(/^\d{5}-?\d{3}$/),
    ]);
    cep.updateValueAndValidity({ emitEvent: false });
  }

  hasUnsavedChanges(): boolean {
    const usuario = this.usuario();
    return !!usuario && (this.hasDataChanges(usuario, this.form.getRawValue()) || this.hasPendingPhoto());
  }

  private hasDataChanges(
    usuario: UserModel,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    return (
      this.changed(values.nome, usuario.nome) ||
      onlyDigits(values.cpf) !== onlyDigits(usuario.cpf) ||
      (!usuario.ehCin && this.changed(values.rg, usuario.rg ?? '')) ||
      this.changed(values.dataNascimento, apiDateToForm(usuario.dataNascimento)) ||
      onlyDigits(values.telefone) !== onlyDigits(usuario.telefone) ||
      this.changed(values.tipoSanguineo, usuario.tipoSanguineo ?? '') ||
      this.changed(values.doencasAlergias, usuario.doencasAlergias ?? '') ||
      this.responsibleDataChanged(usuario, values) ||
      this.addressChanged(usuario, values)
    );
  }

  private createUserPayload(
    usuario: UserModel,
    values: ReturnType<typeof this.form.getRawValue>,
  ) {
    const ehCin = usuario.ehCin ?? false;
    return {
      nome: values.nome.trim(),
      email: usuario.email,
      cargoId: usuario.cargo?.id ?? usuario.cargoId!,
      ...(onlyDigits(values.cpf) !== onlyDigits(usuario.cpf)
        ? { cpf: values.cpf.trim() }
        : {}),
      ...(!ehCin && this.changed(values.rg, usuario.rg ?? '')
        ? { rg: values.rg.trim() }
        : {}),
      ...(this.changed(values.dataNascimento, apiDateToForm(usuario.dataNascimento))
        ? { dataNascimento: formDateToApi(values.dataNascimento) }
        : {}),
      ...(this.changed(values.telefone, usuario.telefone ?? '')
        ? { telefone: values.telefone.trim() || null }
        : {}),
      ...(this.changed(values.tipoSanguineo, usuario.tipoSanguineo ?? '')
        ? { tipoSanguineo: values.tipoSanguineo || null }
        : {}),
      ...(this.changed(values.doencasAlergias, usuario.doencasAlergias ?? '')
        ? { doencasAlergias: values.doencasAlergias.trim() || null }
        : {}),
      ...(this.changed(values.responsavelNome, usuario.responsavelNome)
        ? { responsavelNome: values.responsavelNome.trim() || null }
        : {}),
      ...(onlyDigits(values.responsavelTelefone) !== onlyDigits(usuario.responsavelTelefone)
        ? { responsavelTelefone: values.responsavelTelefone.trim() || null }
        : {}),
      ...(this.changed(values.responsavelEmail, usuario.responsavelEmail)
        ? { responsavelEmail: values.responsavelEmail.trim() || null }
        : {}),
      ...(this.addressChanged(usuario, values)
        ? {
            endereco: {
              ...(onlyDigits(values.cep) ? { cep: onlyDigits(values.cep) } : {}),
              numero: values.numero.trim() || null,
              complemento: values.complemento.trim() || null,
            },
          }
        : {}),
    };
  }

  private commitUsuario(usuario: UserModel): void {
    this.usuario.set(usuario);
    this.replaceNavigationUser(usuario);
    this.patchUsuario(usuario);
    this.form.markAsPristine();
    this.setSectionsInactive();
  }

  private commitPendingPhoto(): void {
    const confirmedPreview = this.pendingPhotoObjectUrl;
    this.revokeCurrentPhoto();
    this.fotoObjectUrl = confirmedPreview;
    this.pendingPhotoObjectUrl = null;
    this.pendingPhoto.set(null);
    this.fotoAtual.set(confirmedPreview);
  }

  private discardPendingPhoto(): void {
    const previousPreviewUrl = this.pendingPhotoObjectUrl;
    this.pendingPhotoObjectUrl = null;
    this.pendingPhoto.set(null);
    this.fotoAtual.set(this.fotoObjectUrl);
    this.retirePhotoObjectUrl(previousPreviewUrl);
  }

  private finishSaveSuccess(): void {
    this.successMessage.set('Os dados do usuário foram atualizados com sucesso.');
    this.redirecting.set(true);
    this.toast.success('Os dados do usuário foram atualizados com sucesso.', { duration: 2000 });
    timer(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.router.navigate(['/desbravadores']));
  }

  private addressChanged(
    usuario: UserModel,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    const original = usuario.endereco;
    return (
      onlyDigits(values.cep) !== onlyDigits(original?.cep) ||
      this.changed(values.numero, original?.numero ?? '') ||
      this.changed(values.complemento, original?.complemento ?? '')
    );
  }

  private addressNeedsCep(values: ReturnType<typeof this.form.getRawValue>): boolean {
    return (
      [values.cep, values.numero, values.complemento].some(value => value.trim()) &&
      onlyDigits(values.cep).length !== 8
    );
  }

  private responsibleDataChanged(
    usuario: UserModel,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    return this.changed(values.responsavelNome, usuario.responsavelNome) ||
      onlyDigits(values.responsavelTelefone) !== onlyDigits(usuario.responsavelTelefone) ||
      this.changed(values.responsavelEmail, usuario.responsavelEmail);
  }

  private changed(value: string, original: string | null | undefined): boolean {
    return value.trim() !== (original ?? '').trim();
  }

  private isValidPhotoFile(file: File): boolean {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024;
  }

  private configureCepLookup(): void {
    merge(
      this.form.controls.cep.valueChanges.pipe(
        map(cep => onlyDigits(cep)),
        distinctUntilChanged(),
        map(cep => ({ cep, clearAddress: true })),
      ),
      this.cepRetry$.pipe(map(cep => ({ cep, clearAddress: false }))),
      this.cepReset$.pipe(map(() => null)),
    )
      .pipe(
        switchMap(request => {
          if (!request) {
            return of(null);
          }
          const { cep, clearAddress } = request;
          if (clearAddress) {
            this.form.patchValue({ logradouro: '', bairro: '' }, { emitEvent: false });
          }
          if (cep.length !== 8) {
            this.cepFeedback.set({
              status: 'neutral',
              message:
                this.form.controls.cep.dirty || this.form.controls.cep.touched
                  ? 'Informe os 8 dígitos do CEP.'
                  : '',
            });
            return of(null);
          }

          this.cepFeedback.set({ status: 'loading', message: 'Buscando endereço...' });
          return this.userService.consultarCep(cep).pipe(
            map(endereco =>
              endereco.erro
                ? {
                    status: 'error' as const,
                    message: 'CEP não encontrado. Confira os 8 dígitos.',
                    endereco: null,
                  }
                : { status: 'success' as const, endereco },
            ),
            catchError(() =>
              of({
                status: 'error' as const,
                message: 'Não foi possível consultar o CEP. Tente novamente.',
                endereco: null,
              }),
            ),
            finalize(() => {
              if (onlyDigits(this.form.controls.cep.value) === cep) {
                if (this.cepFeedback().status === 'loading') {
                  this.cepFeedback.set({ status: 'neutral', message: '' });
                }
              }
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        if (!result) {
          return;
        }
        if (result.status === 'error') {
          this.cepFeedback.set({ status: 'error', message: result.message });
          return;
        }

        this.form.patchValue(
          {
            logradouro: result.endereco?.logradouro ?? '',
            bairro: result.endereco?.bairro ?? '',
          },
          { emitEvent: false },
        );
        this.cepFeedback.set({
          status: 'success',
          message: 'Endereço encontrado. Confira os dados e informe o número.',
        });
      });
  }

  retryCepLookup(): void {
    if (this.cepFeedback().status === 'error') {
      this.cepRetry$.next(onlyDigits(this.form.controls.cep.value));
    }
  }

  private loadPhoto(usuario: UserModel): void {
    if (!usuario.fotoUrl) {
      this.photoLoading.set(false);
      return;
    }
    this.photoLoading.set(true);
    this.userService
      .obterFoto(usuario.id)
      .pipe(
        take(1),
        finalize(() => this.photoLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: blob => {
          this.revokeCurrentPhoto();
          this.fotoObjectUrl = URL.createObjectURL(blob);
          this.fotoAtual.set(this.fotoObjectUrl);
        },
        error: error => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
            this.errorMessage.set(describeUsuarioError(error, 'Não foi possível carregar a foto.'));
          }
        },
      });
  }

  private handleSaveError(error: unknown): void {
    const fields = usuarioFieldErrors(error);
    for (const [name, message] of Object.entries(fields)) {
      this.form.get(name)?.setErrors({ ...(this.form.get(name)?.errors ?? {}), server: message });
    }
    const message = describeUsuarioError(error, 'Não foi possível salvar as alterações. Tente novamente.');
    this.errorMessage.set(message);
    this.toast.error(message);
  }

  private validationMessage(): string {
    const controls = this.form.controls;
    if (controls.cpf.hasError('cpfInvalid')) {
      return 'Informe um CPF válido; o CPF cadastrado não pode ser removido.';
    }
    if (controls.rg.invalid && !(this.usuario()?.ehCin ?? false)) {
      return 'Informe um RG válido ou regularize a identificação CIN do usuário.';
    }
    if (controls.dataNascimento.hasError('dateInvalid')) {
      return 'Informe uma data de nascimento válida no formato dd/mm/aaaa.';
    }
    if (controls.cep.invalid) {
      return 'Informe um CEP com 8 dígitos.';
    }
    if (controls.nome.invalid) {
      return 'Informe um nome com até 200 caracteres.';
    }
    if (controls.responsavelEmail.invalid) {
      return 'Informe um e-mail válido para o responsável.';
    }
    return 'Verifique os campos destacados.';
  }

  private revokeCurrentPhoto(): void {
    if (this.fotoObjectUrl) {
      URL.revokeObjectURL(this.fotoObjectUrl);
      this.fotoObjectUrl = null;
    }
    this.fotoAtual.set(null);
  }

  private revokePendingPhoto(): void {
    if (this.pendingPhotoObjectUrl) {
      URL.revokeObjectURL(this.pendingPhotoObjectUrl);
      this.pendingPhotoObjectUrl = null;
    }
    this.pendingPhoto.set(null);
  }

  private retirePhotoObjectUrl(url: string | null): void {
    if (!url) {
      return;
    }
    this.retiredPhotoObjectUrls.add(url);
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        if (this.fotoAtual() !== url && this.retiredPhotoObjectUrls.delete(url)) {
          URL.revokeObjectURL(url);
        }
      });
    });
  }
}
