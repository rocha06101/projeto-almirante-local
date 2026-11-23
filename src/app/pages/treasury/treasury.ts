import { PermissoesService } from '../../core/services/permissoes';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KpiComponent } from "../../shared/components/kpi-component/kpi-component";
import { FinancialEntriesComponent } from "../../shared/components/financial-entries-component/financial-entries-component";
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ThemeService } from '../../core/services/theme';
import { TesourariaService } from '../../core/services/tesouraria';
import { TesourariaCompetencia } from '../../core/models/tesouraria.model';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-treasury',
  imports: [ KpiComponent, BaseChartDirective, FinancialEntriesComponent ],
  templateUrl: './treasury.html',
  styleUrl: './treasury.scss',
})
export class Treasury implements OnInit {
  readonly permissoes = inject(PermissoesService);

  private readonly theme = inject(ThemeService);
  private readonly tesourariaService = inject(TesourariaService);
  readonly carregandoGrafico = signal(false);
  readonly erroGrafico = signal<string | null>(null);
  readonly acessoNegadoGrafico = signal(false);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        label: 'Receitas',
        data: [],
        backgroundColor: () => this.theme.isDark() ? '#93B4FF' : '#2F00FC',
        borderRadius: 6,
        maxBarThickness: 32,
      },
      {
        label: 'Despesas',
        data: [],
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

 
ngOnInit(): void {
  if (!this.permissoes.tem('financeiro.tesouraria.consultar')) {
    return;
  }

  this.carregandoGrafico.set(true);
  this.erroGrafico.set(null);
  this.acessoNegadoGrafico.set(false);

  this.tesourariaService.obterResumo()
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (resumo) => {
        this.atualizarGrafico(resumo.receitasDespesas ?? []);
        this.carregandoGrafico.set(false);
      },
      error: (erro) => {
        this.atualizarGrafico([]);
        this.carregandoGrafico.set(false);

        if (erro.status === 403) {
          this.acessoNegadoGrafico.set(true);
        } else {
          const mensagem = 'Não foi possível carregar o resumo da tesouraria.';
          this.erroGrafico.set(mensagem);
          this.toast.error(mensagem);
        }
      },
    });
}



  private atualizarGrafico(competencias: TesourariaCompetencia[]): void {
    const meses = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ];

    this.barChartData.labels = competencias.map(
      competencia => `${meses[competencia.mes - 1]}/${competencia.ano}`,
    );

    this.barChartData.datasets[0].data = competencias.map(
      competencia => competencia.entradas,
    );

    this.barChartData.datasets[1].data = competencias.map(
      competencia => competencia.saidas,
    );
  }
}
