import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Desbravadores } from './desbravadores';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';

const USER_GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const CARGO_GUID = '9b2c1d4e-0000-4a1b-8c2d-112233445566';

const usuarios: UserModel[] = [
  {
    id: USER_GUID,
    nome: 'guilherme Souza',
    email: 'guilherme@example.com',
    dataCriacao: '2026-08-10T12:00:00',
    cargo: { id: CARGO_GUID, nome: 'Conselheiro', role: 'Membro' },
  },
];

describe('Desbravadores', () => {
  let fixture: ComponentFixture<Desbravadores>;
  let component: Desbravadores;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Desbravadores],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: { listarUsuarios: () => of(usuarios) } },
      ],
    });

    fixture = TestBed.createComponent(Desbravadores);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('apresenta as informações funcionais do usuário', () => {
    const rows = host.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('guilherme Souza');
    expect(rows[0].textContent).toContain('guilherme@example.com');
    expect(rows[0].textContent).toContain('10/08/2026');
    expect(rows[0].textContent).toContain('Conselheiro');
    expect(host.querySelector('.avatar')?.textContent).toBe('G');
  });

  it('não exibe coluna de identificador', () => {
    const headers = Array.from(host.querySelectorAll('th')).map(th => th.textContent?.trim());
    expect(headers).toEqual(['Nome', 'Email', 'Data de criacao', 'Role']);
  });

  it('não expõe GUIDs em textos nem em atributos do DOM', () => {
    const html = host.innerHTML;
    expect(html).not.toContain(USER_GUID);
    expect(html).not.toContain(CARGO_GUID);
  });

  it('não exibe o endpoint da API na tela', () => {
    expect(host.textContent).not.toMatch(/\/api\b|endpoint/i);
  });

  it('mantém o GUID disponível internamente no estado do componente', () => {
    expect(component.usuarios()[0].id).toBe(USER_GUID);
  });
});
