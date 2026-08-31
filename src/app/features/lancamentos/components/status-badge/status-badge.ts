import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LancamentoStatus } from '../../models/lancamento.model';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="status-badge" [class]="statusClass()">
      {{ status() }}
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 0.35rem 0.8rem;
        font-size: 0.82rem;
        font-weight: 600;
        border: 1px solid transparent;
        min-width: 5.5rem;
      }

      .status-badge.pago {
        background: rgba(34, 197, 94, 0.12);
        border-color: rgba(34, 197, 94, 0.4);
        color: #15803d;
      }

      .status-badge.pendente {
        background: rgba(245, 158, 11, 0.12);
        border-color: rgba(245, 158, 11, 0.4);
        color: #b45309;
      }

      .status-badge.atrasado {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.4);
        color: #b91c1c;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  status = input.required<LancamentoStatus>();

  readonly statusClass = computed(() => {
    const normalized = this.status().toLowerCase();
    return normalized.replace(/\s+/g, '-');
  });
}
