import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  Injector,
  OnInit,
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
  Subject,
} from 'rxjs';
import { MyProfileResponse, UpdateMyProfileRequest, UserAddressUpdate } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth';
import { User as UserService } from '../../core/services/user';
import { UserAvatarService } from '../../core/services/user-avatar.service';
import { ToastService } from '../../core/services/toast.service';
import { PasswordChangeModal } from '../../shared/components/password-change-modal/password-change-modal';
import { PrimaryInput } from '../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../shared/components/primary-select/primary-select';
import { PrimaryTextarea } from '../../shared/components/primary-textarea/primary-textarea';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { onlyDigits } from '../../shared/utils/masks';
import { apiDateToForm, formDateToApi, isValidFormDate } from '../../shared/utils/profile-form';
import { cpfValidator } from '../../shared/validators/cpf.validator';
import { describeUsuarioError, usuarioFieldErrors } from '../desbravadores/usuarios-api-errors';

type CepFeedbackStatus = 'neutral' | 'loading' | 'success' | 'error';

interface CepFeedback {
  status: CepFeedbackStatus;
  message: string;
}

@Component({
  selector: 'app-my-profile',
  standalone: true,
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss',
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
export class MyProfile implements OnInit, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly userAvatar = inject(UserAvatarService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly user = signal<MyProfileResponse | null>(null);
  readonly isLoading = signal(true);
  readonly isLoaded = signal(false);
  readonly passwordModalOpen = signal(false);
  readonly saving = signal(false);
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
  private readonly serverErrorValues = new Map<string, string>();

  readonly nomeResumo = new FormControl('', { nonNullable: true });
  readonly emailResumo = new FormControl('', { nonNullable: true });
  readonly cargoResumo = new FormControl('', { nonNullable: true });
  readonly emailCredenciais = new FormControl('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    nome: ['', [
      Validators.required,
      Validators.maxLength(200),
      (control: AbstractControl) => String(control.value ?? '').trim() ? null : { whitespace: true },
    ]],
    cpf: [{ value: '', disabled: true }, [Validators.required, cpfValidator]],
    rg: ['', [Validators.maxLength(20), Validators.pattern(/\d/)]],
    dataNascimento: ['', [Validators.maxLength(10), (control: AbstractControl) =>
      isValidFormDate(String(control.value ?? '')) ? null : { dateInvalid: true }]],
    telefone: [''],
    tipoSanguineo: [''],
    doencasAlergias: ['', Validators.maxLength(2000)],
    cep: ['', Validators.pattern(/^\d{5}-?\d{3}$/)],
    bairro: [''],
    logradouro: [''],
    numero: [''],
    complemento: [''],
  });

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

  ngOnInit(): void {
    this.configureCepLookup();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.clearResolvedServerErrors());
    this.loadProfile();
  }

  salvar(): void {
    const user = this.user();
    if (!user || !this.isLoaded() || this.saving()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    const values = this.form.getRawValue();
    const hasDataChanges = this.hasDataChanges(user, values);
    const pendingPhoto = this.pendingPhoto();
    if (pendingPhoto && !this.isValidPhotoFile(pendingPhoto)) {
      const message = 'Selecione uma foto JPEG, PNG ou WebP de até 10 MB.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }
    if (hasDataChanges && this.form.invalid) {
      this.form.markAllAsTouched();
      const message = this.validationMessage();
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }

    if (hasDataChanges && this.addressChanged(user, values) && this.addressNeedsCep(values)) {
      this.form.controls.cep.markAsTouched();
      const message = 'Informe um CEP válido antes de atualizar o endereço.';
      this.errorMessage.set(message);
      this.toast.error(message);
      return;
    }
    if (!hasDataChanges && !pendingPhoto) {
      this.form.markAsPristine();
      this.toast.error('Nenhuma alteração foi feita. Edite alguma informação antes de salvar.');
      return;
    }

    const payload = hasDataChanges ? this.createProfilePayload(user, values) : null;
    let dataWasSaved = false;
    let photoUploadStarted = false;
    this.saving.set(true);
    const dataSave$ = payload
      ? this.userService.atualizarMeuPerfil(payload).pipe(
          take(1),
          tap(updated => {
            dataWasSaved = true;
            this.commitProfile(updated);
          }),
        )
      : of(user);

    dataSave$
      .pipe(
        concatMap(() => {
          if (!pendingPhoto) {
            return of(null);
          }
          photoUploadStarted = true;
          this.photoSaving.set(true);
          return this.userService.enviarMinhaFoto(pendingPhoto).pipe(
            take(1),
            tap(() => this.commitPendingPhoto()),
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
    if (this.isLoaded() && !this.saving()) {
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
    if (!file || !this.isLoaded() || this.saving() || this.photoLoading()) {
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
    if (this.saving()) {
      return;
    }
    this.discardPendingPhoto();
    void this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.revokeCurrentPhoto();
    this.revokePendingPhoto();
    for (const url of this.retiredPhotoObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.retiredPhotoObjectUrls.clear();
  }

  private loadProfile(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.userService
      .obterMeuPerfil()
      .pipe(
        take(1),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: profile => {
          this.user.set(profile);
          this.isLoaded.set(true);
          this.setRgValidators(profile.ehCin ?? false);
          this.patchProfile(profile);
          this.loadPhoto();
        },
        error: error => {
          const message = describeUsuarioError(
            error,
            'Não foi possível carregar seu perfil. Tente novamente.',
          );
          this.errorMessage.set(message);
          this.toast.error(message);
        },
      });
  }

  private patchProfile(profile: MyProfileResponse): void {
    const address = profile.endereco;
    this.setCepValidators(Boolean(address?.cep));
    this.form.reset(
      {
        nome: profile.nome ?? '',
        cpf: profile.cpf ?? '',
        rg: profile.rg ?? '',
        dataNascimento: apiDateToForm(profile.dataNascimento),
        telefone: profile.telefone ?? '',
        tipoSanguineo: profile.tipoSanguineo ?? '',
        doencasAlergias: profile.doencasAlergias ?? '',
        cep: address?.cep ?? '',
        bairro: address?.bairro ?? '',
        logradouro: address?.logradouro ?? '',
        numero: address?.numero ?? '',
        complemento: address?.complemento ?? '',
      },
      { emitEvent: false },
    );
    this.cepReset$.next();
    this.nomeResumo.setValue(profile.nome ?? '');
    this.emailResumo.setValue(profile.email ?? '');
    this.emailCredenciais.setValue(profile.email ?? '');
    this.cargoResumo.setValue(profile.cargo?.nome ?? profile.funcao ?? '');
  }

  private setRgValidators(ehCin: boolean): void {
    const rg = this.form.controls.rg;
    if (ehCin) {
      rg.clearValidators();
      rg.disable({ emitEvent: false });
    } else {
      rg.setValidators([Validators.required, Validators.maxLength(20), Validators.pattern(/\d/)]);
      rg.enable({ emitEvent: false });
    }
    rg.updateValueAndValidity({ emitEvent: false });
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
    const user = this.user();
    return !!user && (this.hasDataChanges(user, this.form.getRawValue()) || this.hasPendingPhoto());
  }

  private hasDataChanges(
    user: MyProfileResponse,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    return (
      this.changed(values.nome, user.nome) ||
      (!user.ehCin && this.changed(values.rg, user.rg ?? '')) ||
      this.changed(values.dataNascimento, apiDateToForm(user.dataNascimento)) ||
      onlyDigits(values.telefone) !== onlyDigits(user.telefone) ||
      this.changed(values.tipoSanguineo, user.tipoSanguineo ?? '') ||
      this.changed(values.doencasAlergias, user.doencasAlergias ?? '') ||
      this.addressChanged(user, values)
    );
  }

  private createProfilePayload(
    user: MyProfileResponse,
    values: ReturnType<typeof this.form.getRawValue>,
  ): UpdateMyProfileRequest {
    const ehCin = user.ehCin ?? false;
    const endereco: UserAddressUpdate = {
      ...(onlyDigits(values.cep) !== onlyDigits(user.endereco?.cep) && onlyDigits(values.cep).length === 8
        ? { cep: onlyDigits(values.cep) }
        : {}),
      ...(this.changed(values.numero, user.endereco?.numero)
        ? { numero: values.numero.trim() || null }
        : {}),
      ...(this.changed(values.complemento, user.endereco?.complemento)
        ? { complemento: values.complemento.trim() || null }
        : {}),
    };
    return {
      ehCin,
      ...(this.changed(values.nome, user.nome) ? { nome: values.nome.trim() } : {}),
      ...(!ehCin ? { rg: values.rg.trim() } : {}),
      ...(this.changed(values.dataNascimento, apiDateToForm(user.dataNascimento))
        ? { dataNascimento: formDateToApi(values.dataNascimento) }
        : {}),
      ...(onlyDigits(values.telefone) !== onlyDigits(user.telefone)
        ? { telefone: values.telefone.trim() || null }
        : {}),
      ...(this.changed(values.tipoSanguineo, user.tipoSanguineo ?? '')
        ? { tipoSanguineo: values.tipoSanguineo || null }
        : {}),
      ...(this.changed(values.doencasAlergias, user.doencasAlergias ?? '')
        ? { doencasAlergias: values.doencasAlergias.trim() || null }
        : {}),
      ...(this.addressChanged(user, values) ? { endereco } : {}),
    };
  }

  private commitProfile(profile: MyProfileResponse): void {
    this.user.set(profile);
    this.setRgValidators(profile.ehCin ?? false);
    this.patchProfile(profile);
    this.form.markAsPristine();
  }

  private commitPendingPhoto(): void {
    const userId = this.user()?.id;
    const confirmedPreview = this.pendingPhotoObjectUrl;
    this.revokeCurrentPhoto();
    this.fotoObjectUrl = confirmedPreview;
    this.pendingPhotoObjectUrl = null;
    this.pendingPhoto.set(null);
    this.fotoAtual.set(confirmedPreview);
    if (userId && this.auth.user()?.id === userId) {
      this.userAvatar.reloadCurrentUserPhoto();
    }
  }

  private discardPendingPhoto(): void {
    const previousPreviewUrl = this.pendingPhotoObjectUrl;
    this.pendingPhotoObjectUrl = null;
    this.pendingPhoto.set(null);
    this.fotoAtual.set(this.fotoObjectUrl);
    this.retirePhotoObjectUrl(previousPreviewUrl);
  }

  private finishSaveSuccess(): void {
    this.successMessage.set('Seu perfil foi atualizado com sucesso.');
    this.toast.success('Seu perfil foi atualizado com sucesso.', { duration: 2000 });
  }

  private addressChanged(
    user: MyProfileResponse,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    return (
      onlyDigits(values.cep) !== onlyDigits(user.endereco?.cep) ||
      this.changed(values.numero, user.endereco?.numero ?? '') ||
      this.changed(values.complemento, user.endereco?.complemento ?? '')
    );
  }

  private addressNeedsCep(values: ReturnType<typeof this.form.getRawValue>): boolean {
    return (
      [values.cep, values.numero, values.complemento].some(value => value.trim()) &&
      onlyDigits(values.cep).length !== 8
    );
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

  private loadPhoto(): void {
    if (!this.user()?.fotoUrl) {
      this.photoLoading.set(false);
      return;
    }
    this.photoLoading.set(true);
    this.userService
      .obterMinhaFoto()
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
            this.errorMessage.set(describeUsuarioError(error, 'Não foi possível carregar sua foto.'));
          }
        },
      });
  }

  private handleSaveError(error: unknown): void {
    const fields = usuarioFieldErrors(error);
    for (const [serverName, message] of Object.entries(fields)) {
      const name = this.formControlNameForServerField(serverName);
      const control = this.form.get(name);
      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: message });
        this.serverErrorValues.set(name, String(control.value ?? ''));
      }
    }
    const message = describeUsuarioError(error, 'Não foi possível salvar as alterações. Tente novamente.');
    this.errorMessage.set(message);
    this.toast.error(message);
  }

  private validationMessage(): string {
    const controls = this.form.controls;
    if (controls.nome.hasError('required') || controls.nome.hasError('whitespace')) {
      return 'Informe um nome válido.';
    }
    if (controls.nome.hasError('maxlength')) {
      return 'O nome deve ter no máximo 200 caracteres.';
    }
    if (controls.rg.invalid && !(this.user()?.ehCin ?? false)) {
      return 'Informe um RG válido ou regularize a identificação CIN do usuário.';
    }
    if (controls.dataNascimento.hasError('dateInvalid') || controls.dataNascimento.hasError('maxlength')) {
      return 'Informe uma data de nascimento válida no formato dd/mm/aaaa.';
    }
    if (controls.cep.invalid) {
      return 'Informe um CEP válido antes de atualizar o endereço.';
    }
    if (controls.doencasAlergias.hasError('maxlength')) {
      return 'A descrição de alergias/doenças deve ter no máximo 2000 caracteres.';
    }
    return 'Verifique os campos destacados.';
  }

  private formControlNameForServerField(name: string): string {
    const path = name.replace(/\[(\w+)\]/g, '.$1').split(/[./]/).filter(Boolean);
    const field = path.at(-1) ?? name;
    return field.charAt(0).toLowerCase() + field.slice(1);
  }

  private clearResolvedServerErrors(): void {
    for (const [name, originalValue] of this.serverErrorValues) {
      const control = this.form.get(name);
      if (!control || String(control.value ?? '') === originalValue) {
        continue;
      }

      const errors = { ...(control.errors ?? {}) };
      delete errors['server'];
      control.setErrors(Object.keys(errors).length ? errors : null);
      this.serverErrorValues.delete(name);
    }
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
