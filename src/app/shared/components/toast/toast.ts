import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ToastAction, ToastPosition, ToastRecord, ToastService } from '../../../core/services/toast.service';

const POSITION_ORDER: ToastPosition[] = [
  'top-right',
  'top-left',
  'top-center',
  'bottom-right',
  'bottom-left',
  'bottom-center',
];

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  readonly toasts = this.toastService.toasts;
  readonly positionGroups = computed(() => {
    const groups: Record<ToastPosition, ToastRecord[]> = {
      'top-right': [],
      'top-left': [],
      'top-center': [],
      'bottom-right': [],
      'bottom-left': [],
      'bottom-center': [],
    };

    for (const toast of this.toasts()) {
      groups[toast.position].push(toast);
    }

    return groups;
  });

  readonly positions = POSITION_ORDER;

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }

  runAction(toast: ToastRecord, action: ToastAction): void {
    this.toastService.dismiss(toast.id);
    action.onClick();
  }

  iconFor(type: ToastRecord['type']): string {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '×';
      case 'warning':
        return '!';
      case 'info':
      default:
        return 'i';
    }
  }

  roleFor(type: ToastRecord['type']): 'status' | 'alert' {
    return type === 'error' ? 'alert' : 'status';
  }
}
