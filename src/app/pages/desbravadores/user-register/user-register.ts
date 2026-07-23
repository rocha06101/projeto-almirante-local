import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimaryInput } from '../../../shared/components/primary-input/primary-input';
import { PrimarySelect } from '../../../shared/components/primary-select/primary-select';
import { UploadFoto } from '../../../shared/components/upload-foto/upload-foto';

@Component({
  selector: 'app-user-register',
  standalone: true,
  imports: [CommonModule, PrimaryInput, PrimarySelect, UploadFoto],
  templateUrl: './user-register.html',
  styleUrls: ['./user-register.scss'],
})
export class UserRegister {
  cargoOptions = [
    { label: 'Desbravador', value: 'desbravador' },
    { label: 'Instrutor', value: 'instrutor' },
    { label: 'Capitão', value: 'capitao' },
    { label: 'Diretor', value: 'diretor' }
  ];

  onFotoSelecionada(file: File): void {
    console.log('Foto selecionada:', file);
  }
}
