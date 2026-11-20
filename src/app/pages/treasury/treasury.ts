import { PermissoesService } from '../../core/services/permissoes';
import { Component, computed, inject } from '@angular/core';
import { KpiComponent } from "../../shared/components/kpi-component/kpi-component";
import { FinancialEntriesComponent } from "../../shared/components/financial-entries-component/financial-entries-component";
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ThemeService } from '../../core/services/theme';

@Component({
  selector: 'app-treasury',
  imports: [ KpiComponent, BaseChartDirective, FinancialEntriesComponent ],
  templateUrl: './treasury.html',
  styleUrl: './treasury.scss',
})
export class Treasury {
  readonly permissoes = inject(PermissoesService);

  private readonly theme = inject(ThemeService);

  readonly barChartData: ChartData<'bar'> = {
    labels: ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
    datasets: [
      {
        label: 'Receitas',
        data: [220, 290, 210, 130, 390, 280],
        backgroundColor: () => this.theme.isDark() ? '#93B4FF' : '#2F00FC',
        borderRadius: 6,
        maxBarThickness: 32,
      },
      {
        label: 'Despesas',
        data: [120, 100, 280, 250, 220, 90],
        backgroundColor: () => this.theme.isDark() ? '#FCA5A5' : '#FF0000',
        borderRadius: 6,
        maxBarThickness: 32,
      },
    ],
  };

  readonly barChartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const dark = this.theme.isDark();
    const labelColor = dark ? '#F9FAFB' : '#666';

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: dark ? {
          backgroundColor: '#111827',
          titleColor: labelColor,
          bodyColor: labelColor,
          borderColor: '#8493AE',
          borderWidth: 1,
        } : undefined,
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: labelColor,
            usePointStyle: false,
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: labelColor },
          grid: { display: false, drawTicks: false },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: labelColor,
            callback: (value) => `R$ ${value}`,
          },
          grid: { display: false, drawTicks: false },
          border: { display: false },
        },
      },
    };
  });
}
