import { Component } from '@angular/core';
import { KpiComponent } from "../../shared/components/kpi-component/kpi-component";
import { ActionComponent } from "../../shared/components/action-component/action-component";
import { ChartConfiguration, ChartData } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

@Component({
  selector: 'app-treasury',
  imports: [ KpiComponent, BaseChartDirective, ActionComponent ],
  templateUrl: './treasury.html',
  styleUrl: './treasury.scss',
})
export class Treasury {

public barChartData: ChartData<'bar'> = {
  labels: ['Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
  datasets: [
    {
      label: 'Receitas',
      data: [220, 290, 210, 130, 390, 280],
      backgroundColor: '#2F00FC',
      borderRadius: 6,
      barThickness: 32,
    },
    {
      label: 'Despesas',
      data: [120, 100, 280, 250, 220, 90],
      backgroundColor: '#FF0000',
      borderRadius: 6,
      barThickness: 32,
    },
  ],
};

  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: false,
          boxWidth: 12,
          boxHeight: 12,
          padding: 16,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false, drawTicks: false },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `R$ ${value}`,
        },
        grid: { display: false, drawTicks: false },
        border: { display: false },
      },
    },
  };
}
