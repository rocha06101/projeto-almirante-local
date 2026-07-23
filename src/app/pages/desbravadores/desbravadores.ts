import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { finalize, take } from 'rxjs';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-desbravadores',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './desbravadores.html',
  styleUrl: './desbravadores.scss',
})
export class Desbravadores implements OnInit {
  private userService = inject(UserService);

  usuarios = signal<UserModel[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  ngOnInit(): void {
    this.carregarUsuarios();
  }

  carregarUsuarios(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.userService
      .listarUsuarios()
      .pipe(
        take(1),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: usuarios => this.usuarios.set(usuarios),
        error: () => {
          this.usuarios.set([]);
          this.errorMessage.set('Nao foi possivel carregar os usuarios.');
        },
      });
  }
}
