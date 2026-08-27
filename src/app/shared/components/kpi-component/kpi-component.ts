import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-component',
  imports: [],
  templateUrl: './kpi-component.html',
  styleUrl: './kpi-component.scss',
})
export class KpiComponent {

  @Input() title = "";
  @Input() value = "";
  @Input() description = "";
  @Input() icon = "";
  @Input() backgroundColor = "#ffffff"
}

