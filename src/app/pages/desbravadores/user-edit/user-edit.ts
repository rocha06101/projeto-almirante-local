import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RefreshButton } from '../../../shared/components/refresh-button/refresh-button';
import { PrimaryInput } from '../../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../../shared/components/primary-select/primary-select';
import { PrimaryTextarea } from '../../../shared/components/primary-textarea/primary-textarea';
import { PasswordChangeModal } from '../../../shared/components/password-change-modal/password-change-modal';
import { readNavigationState } from '../usuario-navigation';

@Component({
  selector: 'app-user-edit',
  standalone: true,
  templateUrl: './user-edit.html',
  styleUrl: './user-edit.scss',
  imports: [RefreshButton, PrimaryInput, PrimarySelect, PrimaryTextarea, PasswordChangeModal],
})
export class UserEdit {
  private readonly router = inject(Router);

  readonly usuario = readNavigationState(this.router).usuario;
  readonly currentEmail = this.usuario?.email ?? '';
  readonly personalInfoInactive = signal(true);
  readonly passwordModalOpen = signal(false);
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

  enablePersonalInfoEditing(): void {
    this.personalInfoInactive.set(false);
  }

  openPasswordModal(): void {
    this.passwordModalOpen.set(true);
  }

  closePasswordModal(): void {
    this.passwordModalOpen.set(false);
  }

  cancel(): void {
    void this.router.navigate(['/desbravadores']);
  }
}
