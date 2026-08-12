import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Treasury } from './treasury';

describe('Treasury', () => {
  let component: Treasury;
  let fixture: ComponentFixture<Treasury>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Treasury]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Treasury);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
