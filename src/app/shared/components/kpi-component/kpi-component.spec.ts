import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KpiComponent } from './kpi-component';

describe('KpiComponent', () => {
  let component: KpiComponent;
  let fixture: ComponentFixture<KpiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KpiComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KpiComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
