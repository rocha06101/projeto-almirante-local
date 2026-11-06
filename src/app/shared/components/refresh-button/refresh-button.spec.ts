import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { RefreshButton } from './refresh-button';

@Component({
  standalone: true,
  template: '',
})
class Destination {}

@Component({
  standalone: true,
  imports: [RefreshButton],
  template: `
    <app-refresh-button
      [routerLink]="['/destino']"
      [type]="type"
      [disabled]="disabled"
    >
      Cadastrar
    </app-refresh-button>
  `,
})
class RefreshButtonHost {
  type: HTMLButtonElement['type'] = 'button';
  disabled = false;
}

describe('RefreshButton', () => {
  let fixture: ComponentFixture<RefreshButtonHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefreshButtonHost],
      providers: [provideRouter([{ path: 'destino', component: Destination }])],
    }).compileComponents();

    fixture = TestBed.createComponent(RefreshButtonHost);
    fixture.detectChanges();
  });

  it('projects its label into a styled button and navigates to its routerLink', async () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.classList.contains('refresh-button')).toBe(true);
    expect(button.textContent.trim()).toBe('Cadastrar');
    expect(button.type).toBe('button');

    button.click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/destino');
  });

  it('supports button types and disabled state', () => {
    const disabledFixture = TestBed.createComponent(RefreshButtonHost);
    disabledFixture.componentInstance.type = 'submit';
    disabledFixture.componentInstance.disabled = true;
    disabledFixture.detectChanges();

    const button = disabledFixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.disabled).toBe(true);
  });
});
