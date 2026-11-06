import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { PrimaryInput } from '../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../shared/components/primary-select/primary-select';
import { PrimaryTextarea } from '../../shared/components/primary-textarea/primary-textarea';

@Component({
  selector: 'app-my-profile',
  standalone: true,
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss',
  imports: [ RefreshButton, PrimaryInput, PrimarySelect, PrimaryTextarea ]
})
export class MyProfile {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly personalInfoInactive = signal(true);
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

  cancel(): void {
    void this.router.navigate(['/']);
  }
}
