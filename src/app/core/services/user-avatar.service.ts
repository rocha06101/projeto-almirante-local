import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subscription, take } from 'rxjs';
import { AuthService } from './auth';
import { User as UserService } from './user';

export const DEFAULT_USER_AVATAR = '/icons/user-icon2.svg';

interface AvatarState {
  userId: string | null;
  url: string;
  objectUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class UserAvatarService {
  private readonly auth = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<AvatarState>({
    userId: null,
    url: DEFAULT_USER_AVATAR,
    objectUrl: null,
  });
  private activeUserId: string | null = null;
  private requestVersion = 0;
  private photoRequest?: Subscription;

  readonly avatarUrl = computed(() => {
    const userId = this.auth.user()?.id;
    const state = this.state();
    return userId && state.userId === userId ? state.url : DEFAULT_USER_AVATAR;
  });

  constructor() {
    effect(() => this.activateUser(this.auth.user()?.id ?? null));

    this.destroyRef.onDestroy(() => {
      this.requestVersion++;
      this.photoRequest?.unsubscribe();
      this.revoke(this.state().objectUrl);
      this.state.set({ userId: null, url: DEFAULT_USER_AVATAR, objectUrl: null });
    });
  }

  reloadCurrentUserPhoto(): void {
    const userId = this.auth.user()?.id;
    if (!userId || userId !== this.activeUserId) {
      return;
    }

    this.loadPhoto(userId, true);
  }

  onImageError(event: Event): void {
    const image = event.currentTarget;
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    const current = this.state();
    const source = image.getAttribute('src');
    if (!source || source === DEFAULT_USER_AVATAR || source !== current.url) {
      return;
    }

    this.state.set({ userId: current.userId, url: DEFAULT_USER_AVATAR, objectUrl: null });
    this.revoke(current.objectUrl);
  }

  private activateUser(userId: string | null): void {
    if (userId === this.activeUserId) {
      return;
    }

    this.requestVersion++;
    this.photoRequest?.unsubscribe();
    this.photoRequest = undefined;
    this.activeUserId = userId;

    const previousObjectUrl = this.state().objectUrl;
    this.state.set({ userId, url: DEFAULT_USER_AVATAR, objectUrl: null });
    this.revoke(previousObjectUrl);

    if (userId) {
      this.loadPhoto(userId, false);
    }
  }

  private loadPhoto(userId: string, preserveCurrent: boolean): void {
    this.requestVersion++;
    const requestVersion = this.requestVersion;
    this.photoRequest?.unsubscribe();
    this.photoRequest = undefined;

    if (!preserveCurrent) {
      const previousObjectUrl = this.state().objectUrl;
      this.state.set({ userId, url: DEFAULT_USER_AVATAR, objectUrl: null });
      this.revoke(previousObjectUrl);
    }

    this.photoRequest = this.userService
      .obterMinhaFoto()
      .pipe(take(1))
      .subscribe({
        next: blob => {
          if (!this.isCurrentRequest(userId, requestVersion)) {
            return;
          }

          const previousObjectUrl = this.state().objectUrl;
          let objectUrl: string;
          try {
            objectUrl = URL.createObjectURL(blob);
          } catch {
            if (!preserveCurrent) {
              this.state.set({ userId, url: DEFAULT_USER_AVATAR, objectUrl: null });
            }
            return;
          }

          this.state.set({ userId, url: objectUrl, objectUrl });
          this.revoke(previousObjectUrl);
        },
        error: (error: unknown) => {
          if (!this.isCurrentRequest(userId, requestVersion)) {
            return;
          }

          if (
            preserveCurrent &&
            (!(error instanceof HttpErrorResponse) || error.status !== 404)
          ) {
            return;
          }

          const previousObjectUrl = this.state().objectUrl;
          this.state.set({ userId, url: DEFAULT_USER_AVATAR, objectUrl: null });
          this.revoke(previousObjectUrl);
        },
      });
  }

  private isCurrentRequest(userId: string, requestVersion: number): boolean {
    return (
      this.auth.user()?.id === userId &&
      this.activeUserId === userId &&
      this.requestVersion === requestVersion
    );
  }

  private revoke(objectUrl: string | null): void {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
