import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrimarySelect } from './primary-select';

describe('PrimarySelect', () => {
  let component: PrimarySelect;
  let fixture: ComponentFixture<PrimarySelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimarySelect]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrimarySelect);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});