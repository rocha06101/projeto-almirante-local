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

}
