import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap, take } from 'rxjs';
import { MyProfileResponse } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
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
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = signal<MyProfileResponse | null>(null);
  readonly isLoading = signal(true);
  readonly isLoaded = signal(false);
  readonly personalInfoInactive = signal(true);
  readonly passwordModalOpen = signal(false);
  readonly saving = signal(false);
  readonly photoSaving = signal(false);
  readonly photoLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly cepLoading = signal(false);
  readonly cepFeedback = signal('');
  readonly fotoAtual = signal<string | null>(null);
  private fotoObjectUrl: string | null = null;
  private pendingPhotoObjectUrl: string | null = null;

  readonly nomeResumo = new FormControl('', { nonNullable: true });
  readonly emailResumo = new FormControl('', { nonNullable: true });
  readonly cargoResumo = new FormControl('', { nonNullable: true });
  readonly emailCredenciais = new FormControl('', { nonNullable: true });

  readonly form = this.fb.nonNullable.group({
    nome: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(200)]],
    cpf: ['', [Validators.required, cpfValidator]],
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
    this.loadProfile();
  }

  enablePersonalInfoEditing(): void {
    if (!this.isLoaded() || this.saving()) {
      return;
    }
    this.personalInfoInactive.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  salvar(): void {
    const user = this.user();
    if (!user || !this.isLoaded() || this.saving()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set(this.validationMessage());
      return;
    }

    const values = this.form.getRawValue();
    if (this.addressChanged(user, values) && this.addressNeedsCep(values)) {
      this.form.controls.cep.markAsTouched();
      this.errorMessage.set('Informe um CEP válido antes de atualizar o endereço.');
      return;
    }
    if (!this.hasChanges(user, values)) {
      this.personalInfoInactive.set(true);
      this.form.markAsPristine();
      return;
    }

    const ehCin = user.ehCin ?? false;
    const payload = {
      ehCin,
      ...(onlyDigits(values.cpf) !== onlyDigits(user.cpf) ? { cpf: values.cpf.trim() } : {}),
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
      ...(this.addressChanged(user, values)
        ? {
            endereco: {
              ...(onlyDigits(values.cep) ? { cep: onlyDigits(values.cep) } : {}),
              numero: values.numero.trim() || null,
              complemento: values.complemento.trim() || null,
            },
          }
        : {}),
    };

    this.saving.set(true);
    this.userService
      .atualizarMeuPerfil(payload)
      .pipe(
        take(1),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: updated => {
          this.user.set(updated);
          this.patchProfile(updated);
          this.form.markAsPristine();
          this.personalInfoInactive.set(true);
          this.successMessage.set('Seu perfil foi atualizado com sucesso.');
          this.toast.success('Seu perfil foi atualizado com sucesso.', { duration: 2000 });
        },
        error: error => this.handleSaveError(error),
      });
  }

  openPasswordModal(): void {
    if (this.isLoaded()) {
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
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.isLoaded() || this.photoSaving() || this.photoLoading()) {
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Selecione uma foto JPEG, PNG ou WebP de até 10 MB.');
      (event.target as HTMLInputElement).value = '';
      return;
    }

    this.errorMessage.set('');
    const previousPhoto = this.fotoAtual();
    this.revokePendingPhoto();
    this.pendingPhotoObjectUrl = URL.createObjectURL(file);
    this.fotoAtual.set(this.pendingPhotoObjectUrl);
    this.photoSaving.set(true);
    this.userService
      .enviarMinhaFoto(file)
      .pipe(
        take(1),
        finalize(() => this.photoSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.revokeCurrentPhoto();
          this.fotoAtual.set(this.pendingPhotoObjectUrl);
          this.fotoObjectUrl = this.pendingPhotoObjectUrl;
          this.pendingPhotoObjectUrl = null;
        },
        error: error => {
          this.revokePendingPhoto();
          this.fotoAtual.set(previousPhoto);
          const message = describeUsuarioError(error, 'Não foi possível enviar a foto.');
          this.errorMessage.set(message);
          this.toast.error(message);
        },
      });
    (event.target as HTMLInputElement).value = '';
  }

  cancel(): void {
    void this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.revokeCurrentPhoto();
    this.revokePendingPhoto();
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
          this.errorMessage.set(
            describeUsuarioError(error, 'Não foi possível carregar seu perfil. Tente novamente.'),
          );
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
    this.nomeResumo.setValue(profile.nome ?? '');
    this.emailResumo.setValue(profile.email ?? '');
    this.emailCredenciais.setValue(profile.email ?? '');
    this.cargoResumo.setValue(profile.cargo?.nome ?? profile.funcao ?? '');
  }

  private setRgValidators(ehCin: boolean): void {
    const rg = this.form.controls.rg;
    rg.setValidators(
      ehCin
        ? [Validators.maxLength(20), Validators.pattern(/\d/)]
        : [Validators.required, Validators.maxLength(20), Validators.pattern(/\d/)],
    );
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

  private hasChanges(
    user: MyProfileResponse,
    values: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    return (
      onlyDigits(values.cpf) !== onlyDigits(user.cpf) ||
      (!user.ehCin && this.changed(values.rg, user.rg ?? '')) ||
      this.changed(values.dataNascimento, apiDateToForm(user.dataNascimento)) ||
      onlyDigits(values.telefone) !== onlyDigits(user.telefone) ||
      this.changed(values.tipoSanguineo, user.tipoSanguineo ?? '') ||
      this.changed(values.doencasAlergias, user.doencasAlergias ?? '') ||
      this.addressChanged(user, values)
    );
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

  private configureCepLookup(): void {
    this.form.controls.cep.valueChanges
      .pipe(
        map(cep => onlyDigits(cep)),
        distinctUntilChanged(),
        switchMap(cep => {
          if (cep.length !== 8) {
            this.cepLoading.set(false);
            this.cepFeedback.set('');
            return of(null);
          }

          this.cepLoading.set(true);
          this.cepFeedback.set('Consultando CEP...');
          return this.userService.consultarCep(cep).pipe(
            map(endereco => ({ endereco, error: null as unknown })),
            catchError((error: unknown) => of({ endereco: null, error })),
            finalize(() => {
              if (onlyDigits(this.form.controls.cep.value) === cep) {
                this.cepLoading.set(false);
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
        if (result.error) {
          this.cepFeedback.set(describeUsuarioError(result.error, 'Não foi possível consultar o CEP.'));
          return;
        }
        if (!result.endereco || result.endereco.erro) {
          this.cepFeedback.set('CEP não encontrado. Confira os 8 dígitos.');
          return;
        }

        this.form.patchValue(
          {
            logradouro: result.endereco.logradouro ?? '',
            bairro: result.endereco.bairro ?? '',
          },
          { emitEvent: false },
        );
        this.cepFeedback.set('Endereço preenchido pela consulta de CEP.');
      });
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
    for (const [name, message] of Object.entries(fields)) {
      const control = this.form.get(name);
      control?.setErrors({ ...(control.errors ?? {}), server: message });
    }
    const message = describeUsuarioError(error, 'Não foi possível salvar as alterações. Tente novamente.');
    this.errorMessage.set(message);
    this.toast.error(message);
  }

  private validationMessage(): string {
    const controls = this.form.controls;
    if (controls.cpf.hasError('required') || controls.cpf.hasError('cpfInvalid')) {
      return 'Informe um CPF válido; o CPF cadastrado não pode ser removido.';
    }
    if (controls.rg.invalid && !(this.user()?.ehCin ?? false)) {
      return 'Informe um RG válido ou regularize a identificação CIN do usuário.';
    }
    if (controls.dataNascimento.hasError('dateInvalid')) {
      return 'Informe uma data de nascimento válida no formato dd/mm/aaaa.';
    }
    if (controls.cep.invalid) {
      return 'Informe um CEP com 8 dígitos.';
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
  }
}
