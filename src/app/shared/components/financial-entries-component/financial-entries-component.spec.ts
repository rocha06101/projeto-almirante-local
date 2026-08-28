import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FinancialEntriesComponent } from './financial-entries-component';

describe('FinancialEntriesComponent', () => {
  let component: FinancialEntriesComponent;
  let fixture: ComponentFixture<FinancialEntriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinancialEntriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FinancialEntriesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
