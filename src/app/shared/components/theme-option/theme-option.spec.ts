import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ThemeOption } from './theme-option';

describe('ThemeOption', () => {
  let component: ThemeOption;
  let fixture: ComponentFixture<ThemeOption>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThemeOption]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ThemeOption);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
