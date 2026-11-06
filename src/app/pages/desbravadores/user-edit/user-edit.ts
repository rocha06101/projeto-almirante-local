import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, map, of, switchMap, take, timer } from 'rxjs';
import { User as UserModel } from '../../../core/models/user.model';
import { User as UserService } from '../../../core/services/user';
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
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly usuario = signal<UserModel | null>(null);
  readonly isLoaded = signal(false);
  readonly personalInfoInactive = signal(true);
  readonly passwordModalOpen = signal(false);
  readonly saving = signal(false);
  readonly redirecting = signal(false);
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
    nome: ['', [Validators.required, Validators.maxLength(200)]],
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

  constructor() {
    const candidate = readNavigationState(this.router).usuario;
    if (isValidSelectedUser(candidate)) {
      this.usuario.set(candidate);
      this.isLoaded.set(true);
      this.setRgValidators(candidate.ehCin ?? false);
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

  enablePersonalInfoEditing(): void {
    if (this.isLoaded() && !this.saving()) {
      this.personalInfoInactive.set(false);
      this.errorMessage.set('');
      this.successMessage.set('');
    }
  }

  salvar(): void {
    const usuario = this.usuario();
    if (!usuario || !this.isLoaded() || this.saving() || this.redirecting()) {
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
    if (this.addressChanged(usuario, values) && this.addressNeedsCep(values)) {
      this.form.controls.cep.markAsTouched();
      this.errorMessage.set('Informe um CEP válido antes de atualizar o endereço.');
      return;
    }
    const hasChanges = this.hasChanges(usuario, values);
    if (!hasChanges) {
      this.personalInfoInactive.set(true);
      this.form.markAsPristine();
      this.toast.error('Nenhuma alteração foi feita. Edite alguma informação antes de salvar.');
      return;
    }

    const ehCin = usuario.ehCin ?? false;
    const payload = {
      nome: values.nome.trim(),
      email: usuario.email,
      cargoId: usuario.cargo?.id ?? usuario.cargoId!,
      cpf: values.cpf.trim(),
      ehCin,
      ...(!ehCin ? { rg: values.rg.trim() } : {}),
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

    this.saving.set(true);
    this.userService
      .atualizarUsuario(usuario.id, payload)
      .pipe(
        take(1),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: updated => {
          this.usuario.set(updated);
          this.replaceNavigationUser(updated);
          this.patchUsuario(updated);
          this.form.markAsPristine();
          this.personalInfoInactive.set(true);
          this.successMessage.set('Os dados do usuário foram atualizados com sucesso.');
          this.redirecting.set(true);
          this.toast.success('Os dados do usuário foram atualizados com sucesso.', { duration: 2000 });
          timer(2000)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => void this.router.navigate(['/desbravadores']));
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
    const usuario = this.usuario();
    if (!file || !usuario || this.photoSaving() || this.photoLoading()) {
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
      .enviarFoto(usuario.id, file)
      .pipe(
        take(1),
        finalize(() => this.photoSaving.set(false)),
      )
      .subscribe({
        next: updated => {
          this.usuario.set(updated);
          this.replaceNavigationUser(updated);
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
    if (this.redirecting()) {
      return;
    }
    void this.router.navigate(['/desbravadores']);
  }

  ngOnDestroy(): void {
    this.revokeCurrentPhoto();
    this.revokePendingPhoto();
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
    this.nomeResumo.setValue(usuario.nome ?? '');
    this.emailResumo.setValue(usuario.email ?? '');
    this.emailCredenciais.setValue(usuario.email ?? '');
    this.cargoResumo.setValue(usuario.cargo?.nome ?? usuario.funcao ?? '');
  }

  private replaceNavigationUser(usuario: UserModel): void {
    const currentState = this.location.getState();
    this.location.replaceState(this.location.path(), '', {
      ...(typeof currentState === 'object' && currentState !== null ? currentState : {}),
      usuario,
    });
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
      this.addressChanged(usuario, values)
    );
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
    if (controls.cpf.hasError('required') || controls.cpf.hasError('cpfInvalid')) {
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
