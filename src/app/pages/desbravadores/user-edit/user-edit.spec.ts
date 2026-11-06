import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { User as UserModel } from '../../../core/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { User as UserService } from '../../../core/services/user';
import { UserEdit } from './user-edit';

const usuario: UserModel = {
  id: 'user-1',
  nome: 'Ana Silva',
  email: 'ana@example.com',
  dataCriacao: '2024-01-01',
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

describe('UserEdit', () => {
  let fixture: ComponentFixture<UserEdit>;
  let service: {
    atualizarUsuario: ReturnType<typeof vi.fn>;
    obterFoto: ReturnType<typeof vi.fn>;
    enviarFoto: ReturnType<typeof vi.fn>;
    consultarCep: ReturnType<typeof vi.fn>;
  };

  async function createComponent(state: Record<string, unknown> = { usuario }): Promise<void> {
    history.replaceState(state, '', '/desbravadores/editar');
    await TestBed.configureTestingModule({
      imports: [UserEdit],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: service },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UserEdit);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = {
      atualizarUsuario: vi.fn().mockImplementation((_id, payload) => of({ ...usuario, ...payload })),
      obterFoto: vi.fn().mockReturnValue(of(new Blob())),
      enviarFoto: vi.fn(),
      consultarCep: vi.fn().mockReturnValue(of({})),
    };
  });

  afterEach(() => vi.useRealTimers());

  it('preenche o usuário selecionado e mantém os dados de endereço e cargo', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    expect(component.isLoaded()).toBe(true);
    expect(component.form.controls.nome.value).toBe('Ana Silva');
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
    expect(component.cargoResumo.value).toBe('Administrador');
    expectRenderedProfile(page);
    expect(
      page.querySelectorAll<HTMLElement>(
        '.container-rigth app-primary-input[formcontrolname], .container-rigth app-primary-select[formcontrolname], .container-rigth app-primary-textarea[formcontrolname]',
      ).length,
    ).toBe(12);
    expect(
      [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '.container-rigth app-primary-input[formcontrolname] input, .container-rigth app-primary-select[formcontrolname] select, .container-rigth app-primary-textarea[formcontrolname] textarea',
      )].every(control => control.disabled),
    ).toBe(true);
    expect(service.consultarCep).not.toHaveBeenCalled();
  });

  it('usa os dados do usuário selecionado, sem substituir pelo perfil autenticado', async () => {
    const selecionado: UserModel = {
      ...usuario,
      id: 'selected-user',
      nome: 'Perfil Administrativo de Teste',
      email: 'selected@example.test',
      rg: '987654321',
      dataNascimento: '1998-12-03',
      telefone: '11912345678',
    };
    await createComponent({ usuario: selecionado });

    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    expect(component.usuario()?.id).toBe('selected-user');
    expect(component.form.controls.nome.value).toBe('Perfil Administrativo de Teste');
    expect(component.form.controls.rg.value).toBe('987654321');
    expect(component.form.controls.dataNascimento.value).toBe('03/12/1998');
    expect(component.form.controls.telefone.value).toBe('11912345678');
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="rg"] input')?.value).toBe(
      '98.765.432-1',
    );
    expect(
      page.querySelector<HTMLInputElement>('[formcontrolname="dataNascimento"] input')?.value,
    ).toBe('03/12/1998');
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="telefone"] input')?.value).toBe(
      '(11) 91234-5678',
    );
    expect(component.nomeResumo.value).toBe('Perfil Administrativo de Teste');
  });

  it('não mostra um formulário vazio quando o estado de navegação está ausente', async () => {
    await createComponent({});
    const page = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.isLoaded()).toBe(false);
    expect(page.querySelector('.container-center')).toBeNull();
    expect(fixture.componentInstance.errorMessage()).toContain('identificar o usuário');
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('salva com o ID e cargo originais e não envia metadados nem dados ocultos', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.useFakeTimers();

    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');
    component.form.controls.doencasAlergias.setValue('');
    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        nome: 'Ana Silva',
        email: 'ana@example.com',
        cargoId: 'cargo-1',
        cpf: '52998224725',
        ehCin: false,
        rg: '123456789',
        telefone: '(21) 98765-4321',
        doencasAlergias: null,
      }),
    );
    const payload = service.atualizarUsuario.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('senha');
    expect(payload).not.toHaveProperty('dataExpiracao');
    expect(payload).not.toHaveProperty('responsavelNome');
    expect(payload).not.toHaveProperty('endereco');
    expect(component.successMessage()).toContain('atualizados com sucesso');
    expect(toast.toasts().find(record => record.type === 'success')).toMatchObject({
      message: 'Os dados do usuário foram atualizados com sucesso.',
      type: 'success',
      duration: 2000,
    });
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1999);
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(navigate).toHaveBeenCalledWith(['/desbravadores']);
    expect(component.personalInfoInactive()).toBe(true);
    vi.useRealTimers();
  });

  it('salva data e telefone nulos como valores válidos e mantém RG bloqueado com ehCin', async () => {
    const usuarioComCin: UserModel = {
      ...usuario,
      rg: null,
      ehCin: true,
      dataNascimento: null,
      telefone: null,
    };
    await createComponent({ usuario: usuarioComCin });

    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const rg = page.querySelector<HTMLInputElement>('[formcontrolname="rg"] input');
    component.enablePersonalInfoEditing();
    fixture.detectChanges();
    expect(rg?.disabled).toBe(true);

    component.form.controls.dataNascimento.setValue('15/04/2005');
    component.form.controls.telefone.setValue('(11) 91234-5678');
    service.atualizarUsuario.mockReturnValueOnce(
      of({ ...usuarioComCin, dataNascimento: '2005-04-15', telefone: '(11) 91234-5678' }),
    );
    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        ehCin: true,
        dataNascimento: '2005-04-15',
        telefone: '(11) 91234-5678',
      }),
    );
    expect(service.atualizarUsuario.mock.calls[0][1]).not.toHaveProperty('rg');
    expect(component.form.controls.dataNascimento.value).toBe('15/04/2005');
    expect(component.form.controls.telefone.value).toBe('(11) 91234-5678');
  });

  it('mantém os dados salvos no estado de navegação após reabrir a edição', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');
    service.atualizarUsuario.mockReturnValueOnce(of({ ...usuario, telefone: '21987654321' }));
    component.salvar();

    const updatedState = TestBed.inject(Location).getState() as { usuario: UserModel };
    expect(updatedState.usuario.telefone).toBe('21987654321');

    fixture.destroy();
    history.replaceState(updatedState, '', '/desbravadores/editar');
    fixture = TestBed.createComponent(UserEdit);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.telefone.value).toBe('21987654321');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '[formcontrolname="telefone"] input',
      )?.value,
    ).toBe('(21) 98765-4321');
  });

  it('envia endereço sem campos ViaCEP quando um campo visível muda', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.numero.setValue('200');
    component.salvar();

    const payload = service.atualizarUsuario.mock.calls[0][1] as {
      endereco: Record<string, unknown>;
    };
    expect(payload.endereco).toEqual({ cep: '01001000', numero: '200', complemento: 'Apto 12' });
    expect(payload.endereco).not.toHaveProperty('logradouro');
    expect(payload.endereco).not.toHaveProperty('bairro');
    expect(payload.endereco).not.toHaveProperty('ibge');
  });

  it('evita PUT quando não há alterações e apresenta erro HTTP 403', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.salvar();
    expect(service.atualizarUsuario).not.toHaveBeenCalled();

    service.atualizarUsuario.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, error: { detail: 'Acesso negado.' } })),
    );
    component.form.controls.telefone.setValue('21987654321');
    component.salvar();

    expect(component.errorMessage()).toBe('Acesso negado.');
    expect(component.successMessage()).toBe('');
    expect(component.form.controls.telefone.value).toBe('21987654321');
  });

  it('mapeia erros de validação HTTP 400 e conflitos HTTP 409 sem limpar o formulário', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21987654321');
    service.atualizarUsuario.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errors: { Telefone: ['Telefone inválido.'] } },
          }),
      ),
    );
    component.salvar();
    expect(component.errorMessage()).toBe('Telefone inválido.');
    expect(component.form.controls.telefone.value).toBe('21987654321');
    expect(component.form.controls.telefone.errors?.['server']).toBe('Telefone inválido.');

    service.atualizarUsuario.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Cadastro conflitante.' } })),
    );
    component.form.controls.telefone.setValue('21987654322');
    component.salvar();
    expect(component.errorMessage()).toBe('Cadastro conflitante.');
    expect(component.successMessage()).toBe('');
  });

  it('habilita edição pessoal sem liberar campos derivados do CEP', async () => {
    await createComponent();
    const page = fixture.nativeElement as HTMLElement;
    expectRenderedProfile(page);
    page.querySelector<HTMLButtonElement>('.profile-edit-button button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.personalInfoInactive()).toBe(false);
    expectRenderedProfile(page);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="street-address"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="address-level3"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="name"]')?.disabled).toBe(false);
  });

  it('mantém vazios apenas os campos ausentes ou nulos, sem inventar endereço', async () => {
    await createComponent({
      usuario: {
        ...usuario,
        cpf: null,
        rg: null,
        dataNascimento: null,
        telefone: null,
        tipoSanguineo: null,
        doencasAlergias: null,
        endereco: null,
      },
    });

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
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="dataNascimento"] input')?.value).toBe('');
    expect(page.querySelector<HTMLTextAreaElement>('[formcontrolname="doencasAlergias"] textarea')?.value).toBe('');
    expect(service.consultarCep).not.toHaveBeenCalled();
  });

  it('preserva o modal de alteração de senha e retorna à listagem ao cancelar', async () => {
    await createComponent();
    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.container-down-button button')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar senha');

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/desbravadores']);
  });
});
