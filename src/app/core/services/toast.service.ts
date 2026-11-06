import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'top-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
  position?: ToastPosition;
  backgroundColor?: string;
  textColor?: string;
}

export interface ToastRecord extends Required<Pick<ToastOptions, 'message' | 'type' | 'duration' | 'position'>> {
  id: string;
  backgroundColor?: string;
  textColor?: string;
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastRecord[]>([]);

  private readonly queue = new Map<ToastPosition, ToastRecord[]>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxVisiblePerPosition = 3;

  success(message: string, options: Omit<ToastOptions, 'message' | 'type'> = {}): string {
    return this.show({ ...options, message, type: 'success' });
  }

  error(message: string, options: Omit<ToastOptions, 'message' | 'type'> = {}): string {
    return this.show({ ...options, message, type: 'error' });
  }

  warning(message: string, options: Omit<ToastOptions, 'message' | 'type'> = {}): string {
    return this.show({ ...options, message, type: 'warning' });
  }

  info(message: string, options: Omit<ToastOptions, 'message' | 'type'> = {}): string {
    return this.show({ ...options, message, type: 'info' });
  }

  show(options: ToastOptions): string {
    const toast: ToastRecord = {
      id: this.generateId(),
      message: options.message,
      type: options.type ?? 'info',
      duration: options.duration ?? DEFAULT_DURATIONS[options.type ?? 'info'],
      position: options.position ?? 'top-center',
      backgroundColor: options.backgroundColor,
      textColor: options.textColor,
    };

    const visible = this.toasts().filter(item => item.position === toast.position);
    if (visible.length >= this.maxVisiblePerPosition) {
      const queued = this.queue.get(toast.position) ?? [];
      this.queue.set(toast.position, [...queued, toast]);
      return toast.id;
    }

    this.addToast(toast);
    if (toast.duration > 0) {
      this.scheduleDismiss(toast.id, toast.duration);
    }

    return toast.id;
  }

  dismiss(id: string): void {
    const timer = this.timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(id);
    }

    const toast = this.toasts().find(item => item.id === id);
    if (!toast) {
      return;
    }

    this.toasts.set(this.toasts().filter(item => item.id !== id));
    this.flushQueued(toast.position);
  }

  clear(): void {
    for (const timer of this.timeouts.values()) {
      clearTimeout(timer);
    }
    this.timeouts.clear();
    this.queue.clear();
    this.toasts.set([]);
  }

  private addToast(toast: ToastRecord): void {
    this.toasts.set([...this.toasts(), toast]);
  }

  private scheduleDismiss(id: string, duration: number): void {
    const timer = setTimeout(() => {
      this.dismiss(id);
    }, duration);
    this.timeouts.set(id, timer);
  }

  private flushQueued(position: ToastPosition): void {
    const queued = this.queue.get(position) ?? [];
    if (!queued.length) {
      return;
    }

    const visible = this.toasts().filter(item => item.position === position);
    if (visible.length >= this.maxVisiblePerPosition) {
      return;
    }

    const [next] = queued;
    this.queue.set(position, queued.slice(1));
    this.addToast(next);

    if (next.duration > 0) {
      this.scheduleDismiss(next.id, next.duration);
    }
  }

  private generateId(): string {
    const cryptoSource = globalThis.crypto;
    if (cryptoSource?.randomUUID) {
      return cryptoSource.randomUUID();
    }
    return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
