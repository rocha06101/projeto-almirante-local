import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MyProfileResponse } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
import { MyProfile } from './my-profile';

const profile: MyProfileResponse = {
  id: 'user-1',
  nome: 'Ana Silva',
  email: 'ana@example.com',
  cpf: '52998224725',
  rg: '123456789',
  ehCin: false,
  dataNascimento: '2000-02-29',
  telefone: '11999999999',
  tipoSanguineo: 'O+',
  doencasAlergias: 'Alergia a amendoim',
  endereco: {
    cep: '01001000',
    logradouro: 'Praça da Sé',
    bairro: 'Sé',
    numero: '100',
    complemento: 'Apto 12',
    ibge: '3550308',
  },
  cargo: { id: 'cargo-1', nome: 'Administrador', role: 'ADM' },
  responsavelNome: 'Maria Silva',
  dataExpiracao: '2027-01-01',
};

function expectRenderedProfile(page: HTMLElement): void {
  const input = (name: string) =>
    page.querySelector<HTMLInputElement>(`.container-rigth app-primary-input[formcontrolname="${name}"] input`);

  expect(input('nome')?.value).toBe('Ana Silva');
  expect(input('cpf')?.value).toBe('529.982.247-25');
  expect(input('rg')?.value).toBe('12.345.678-9');
  expect(input('dataNascimento')?.value).toBe('29/02/2000');
  expect(input('telefone')?.value).toBe('(11) 99999-9999');
  expect(input('cep')?.value).toBe('01001-000');
  expect(input('bairro')?.value).toBe('Sé');
  expect(input('logradouro')?.value).toBe('Praça da Sé');
  expect(input('numero')?.value).toBe('100');
  expect(input('complemento')?.value).toBe('Apto 12');
  expect(
    page.querySelector<HTMLSelectElement>(
      '.container-rigth app-primary-select[formcontrolname="tipoSanguineo"] select',
    )?.value,
  ).toBe('O+');
  expect(
    page.querySelector<HTMLTextAreaElement>(
      '.container-rigth app-primary-textarea[formcontrolname="doencasAlergias"] textarea',
    )?.value,
  ).toBe('Alergia a amendoim');
}

describe('MyProfile', () => {
  let fixture: ComponentFixture<MyProfile>;
  let service: {
    obterMeuPerfil: ReturnType<typeof vi.fn>;
    atualizarMeuPerfil: ReturnType<typeof vi.fn>;
    obterMinhaFoto: ReturnType<typeof vi.fn>;
    enviarMinhaFoto: ReturnType<typeof vi.fn>;
    consultarCep: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      obterMeuPerfil: vi.fn().mockReturnValue(of(profile)),
      atualizarMeuPerfil: vi.fn().mockImplementation(payload => of({ ...profile, ...payload })),
      obterMinhaFoto: vi.fn().mockReturnValue(of(new Blob())),
      enviarMinhaFoto: vi.fn(),
      consultarCep: vi.fn().mockReturnValue(of({})),
    };

    await TestBed.configureTestingModule({
      imports: [MyProfile],
      providers: [
        { provide: UserService, useValue: service },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('carrega e mapeia o perfil completo de GET /api/Me', () => {
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    expect(service.obterMeuPerfil).toHaveBeenCalledOnce();
    expect(component.form.controls.nome.value).toBe('Ana Silva');
    expect(component.form.controls.nome.disabled).toBe(true);
    expect(component.emailResumo.value).toBe('ana@example.com');
    expect(component.cargoResumo.value).toBe('Administrador');
    expect(component.form.controls.cpf.value).toBe('52998224725');
    expect(component.form.controls.rg.value).toBe('123456789');
    expect(component.form.controls.dataNascimento.value).toBe('29/02/2000');
    expect(component.form.controls.telefone.value).toBe('11999999999');
    expect(component.form.controls.tipoSanguineo.value).toBe('O+');
    expect(component.form.controls.doencasAlergias.value).toBe('Alergia a amendoim');
    expect(component.form.controls.cep.value).toBe('01001000');
    expect(component.form.controls.logradouro.value).toBe('Praça da Sé');
    expect(component.form.controls.bairro.value).toBe('Sé');
    expect(component.form.controls.numero.value).toBe('100');
    expect(component.form.controls.complemento.value).toBe('Apto 12');
    expectRenderedProfile(page);
    expect(page.textContent).toContain('Meu Perfil');
    expect(service.obterMinhaFoto).not.toHaveBeenCalled();
    expect(service.consultarCep).not.toHaveBeenCalled();
    expect(
      [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '.container-rigth app-primary-input[formcontrolname] input, .container-rigth app-primary-select[formcontrolname] select, .container-rigth app-primary-textarea[formcontrolname] textarea',
      )].every(control => control.disabled),
    ).toBe(true);
  });

  it('envia somente campos permitidos alterados a PUT /api/Me', () => {
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');
    component.form.controls.tipoSanguineo.setValue('');
    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledWith({
      ehCin: false,
      rg: '123456789',
      telefone: '(21) 98765-4321',
      tipoSanguineo: null,
    });
    const payload = service.atualizarMeuPerfil.mock.calls[0][0] as Record<string, unknown>;
    for (const forbidden of [
      'id',
      'nome',
      'email',
      'cargo',
      'cargoId',
      'senha',
      'fotoUrl',
      'ativo',
      'dataExpiracao',
      'responsavelNome',
    ]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
    expect(component.successMessage()).toContain('atualizado com sucesso');
    expect(component.personalInfoInactive()).toBe(true);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(
      page.querySelector<HTMLInputElement>(
        '.container-rigth app-primary-input[formcontrolname="telefone"] input',
      )?.value,
    ).toBe('(21) 98765-4321');
  });

  it('salva data e telefone nulos como valores válidos e mantém RG bloqueado com ehCin', async () => {
    const profileWithCin: MyProfileResponse = {
      ...profile,
      rg: null,
      ehCin: true,
      dataNascimento: null,
      telefone: null,
    };
    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(of(profileWithCin));
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const rg = page.querySelector<HTMLInputElement>('[formcontrolname="rg"] input');
    component.enablePersonalInfoEditing();
    fixture.detectChanges();
    expect(rg?.disabled).toBe(true);

    component.form.controls.dataNascimento.setValue('15/04/2005');
    component.form.controls.telefone.setValue('(11) 91234-5678');
    service.atualizarMeuPerfil.mockReturnValueOnce(
      of({ ...profileWithCin, dataNascimento: '2005-04-15', telefone: '(11) 91234-5678' }),
    );
    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledWith({
      ehCin: true,
      dataNascimento: '2005-04-15',
      telefone: '(11) 91234-5678',
    });
    expect(service.atualizarMeuPerfil.mock.calls[0][0]).not.toHaveProperty('rg');
    expect(component.form.controls.dataNascimento.value).toBe('15/04/2005');
    expect(component.form.controls.telefone.value).toBe('(11) 91234-5678');
  });

  it('envia CEP, número e complemento sem os metadados do ViaCEP', () => {
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.complemento.setValue('Casa');
    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledWith(
      expect.objectContaining({
        ehCin: false,
        rg: '123456789',
        endereco: { cep: '01001000', numero: '100', complemento: 'Casa' },
      }),
    );
    const endereco = service.atualizarMeuPerfil.mock.calls[0][0].endereco as Record<string, unknown>;
    expect(endereco).not.toHaveProperty('logradouro');
    expect(endereco).not.toHaveProperty('bairro');
    expect(endereco).not.toHaveProperty('ibge');
  });

  it('não chama PUT quando nada mudou e mantém campos administrativos somente leitura', () => {
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.salvar();
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();

    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.profile-edit-button button')?.click();
    fixture.detectChanges();
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="name"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="street-address"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="address-level3"]')?.disabled).toBe(true);
  });

  it('habilita edição sem apagar os valores existentes', () => {
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    expectRenderedProfile(page);

    page.querySelector<HTMLButtonElement>('.profile-edit-button button')?.click();
    fixture.detectChanges();

    expectRenderedProfile(page);
    expect(component.form.controls.nome.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="cpf"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="logradouro"] input')?.disabled).toBe(true);
  });

  it('recarrega do GET /api/Me os valores persistidos após salvar', async () => {
    const updatedProfile = { ...profile, telefone: '21987654321' };
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');
    service.atualizarMeuPerfil.mockReturnValueOnce(of(updatedProfile));
    component.salvar();
    expect(component.form.controls.telefone.value).toBe('21987654321');

    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(of(updatedProfile));
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(service.obterMeuPerfil).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.form.controls.telefone.value).toBe('21987654321');
    expect(
      page.querySelector<HTMLInputElement>('[formcontrolname="telefone"] input')?.value,
    ).toBe('(21) 98765-4321');
  });

  it('deixa vazios somente os campos nulos e não consulta CEP ao hidratar o perfil', async () => {
    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(
      of({
        ...profile,
        cpf: null,
        rg: null,
        dataNascimento: null,
        telefone: null,
        tipoSanguineo: null,
        doencasAlergias: null,
        endereco: null,
      }),
    );
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    for (const control of [
      component.form.controls.cpf,
      component.form.controls.rg,
      component.form.controls.dataNascimento,
      component.form.controls.telefone,
      component.form.controls.tipoSanguineo,
      component.form.controls.doencasAlergias,
      component.form.controls.cep,
      component.form.controls.bairro,
      component.form.controls.logradouro,
      component.form.controls.numero,
      component.form.controls.complemento,
    ]) {
      expect(control.value).toBe('');
    }
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="cpf"] input')?.value).toBe('');
    expect(page.querySelector<HTMLTextAreaElement>('[formcontrolname="doencasAlergias"] textarea')?.value).toBe('');
    expect(service.consultarCep).not.toHaveBeenCalled();
  });

  it('mantém os dados digitados e mostra erro de conflito HTTP 409', () => {
    const component = fixture.componentInstance;
    service.atualizarMeuPerfil.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Conflito no perfil.' } })),
    );
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21987654321');
    component.salvar();

    expect(component.errorMessage()).toBe('Conflito no perfil.');
    expect(component.successMessage()).toBe('');
    expect(component.form.controls.telefone.value).toBe('21987654321');
  });

  it('carrega e envia a foto do perfil próprio separadamente', () => {
    const component = fixture.componentInstance;
    component.user.set({ ...profile, fotoUrl: '/api/Me/foto' });

    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.enviarMinhaFoto.mockReturnValue(of(profile));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);

    expect(service.enviarMinhaFoto).toHaveBeenCalledWith(file);
    expect(service.obterMinhaFoto).not.toHaveBeenCalled();
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
  });

  it('preserva o modal de senha e navega de volta para a Home', () => {
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.container-down-button button')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar senha');

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
