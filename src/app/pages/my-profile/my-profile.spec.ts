import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CepLookupResponse, MyProfileResponse } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth';
import { ToastService } from '../../core/services/toast.service';
import { User as UserService } from '../../core/services/user';
import { UserAvatarService } from '../../core/services/user-avatar.service';
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
  let userAvatar: { reloadCurrentUserPhoto: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      obterMeuPerfil: vi.fn().mockReturnValue(of(profile)),
      atualizarMeuPerfil: vi.fn().mockImplementation(payload => of({ ...profile, ...payload })),
      obterMinhaFoto: vi.fn().mockReturnValue(of(new Blob())),
      enviarMinhaFoto: vi.fn(),
      consultarCep: vi.fn().mockReturnValue(of({})),
    };
    userAvatar = { reloadCurrentUserPhoto: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [MyProfile],
      providers: [
        { provide: UserService, useValue: service },
        { provide: UserAvatarService, useValue: userAvatar },
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
    expect(component.form.controls.nome.enabled).toBe(true);
    expect(component.form.controls.cpf.disabled).toBe(true);
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

  it('cancela a consulta anterior e só preenche o endereço do CEP atual', () => {
    const previousLookup = new Subject<CepLookupResponse>();
    const currentLookup = new Subject<CepLookupResponse>();
    service.consultarCep
      .mockReturnValueOnce(previousLookup)
      .mockReturnValueOnce(currentLookup);
    const component = fixture.componentInstance;

    component.form.controls.cep.setValue('20000000');
    component.form.controls.cep.setValue('30000000');
    previousLookup.next({ logradouro: 'Rua desatualizada', bairro: 'Antigo' });
    expect(component.form.controls.logradouro.value).toBe('');
    expect(component.form.controls.bairro.value).toBe('');
    expect(component.cepFeedback()).toMatchObject({ status: 'loading', message: 'Buscando endereço...' });

    currentLookup.next({ logradouro: 'Rua atual', bairro: 'Centro' });
    currentLookup.complete();

    expect(service.consultarCep).toHaveBeenNthCalledWith(1, '20000000');
    expect(service.consultarCep).toHaveBeenNthCalledWith(2, '30000000');
    expect(component.form.controls.logradouro.value).toBe('Rua atual');
    expect(component.form.controls.bairro.value).toBe('Centro');
    expect(component.form.controls.numero.value).toBe('100');
    expect(component.form.controls.complemento.value).toBe('Apto 12');
    expect(component.cepFeedback()).toMatchObject({
      status: 'success',
      message: 'Endereço encontrado. Confira os dados e informe o número.',
    });
  });

  it('permite tentar novamente após falha e orienta quando o CEP é inexistente', () => {
    service.consultarCep
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of({ logradouro: 'Rua consultada', bairro: 'Centro' }));
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    component.form.controls.cep.setValue('20000000');
    expect(component.cepFeedback()).toMatchObject({
      status: 'error',
      message: 'Não foi possível consultar o CEP. Tente novamente.',
    });
    fixture.detectChanges();

    page.querySelector<HTMLButtonElement>('.cep-retry')?.click();
    fixture.detectChanges();

    expect(service.consultarCep).toHaveBeenCalledTimes(2);
    expect(component.form.controls.logradouro.value).toBe('Rua consultada');
    expect(component.form.controls.bairro.value).toBe('Centro');

    service.consultarCep.mockReturnValueOnce(of({ erro: true }));
    component.form.controls.cep.setValue('40000000');
    expect(component.cepFeedback()).toMatchObject({
      status: 'error',
      message: 'CEP não encontrado. Confira os 8 dígitos.',
    });
  });

  it('envia somente campos permitidos alterados a PUT /api/Me', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
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
    expect(toast.toasts()[0]).toMatchObject({
      message: 'Seu perfil foi atualizado com sucesso.',
      type: 'success',
      duration: 2000,
    });
    expect(navigate).not.toHaveBeenCalled();
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
        endereco: { complemento: 'Casa' },
      }),
    );
    const endereco = service.atualizarMeuPerfil.mock.calls[0][0].endereco as Record<string, unknown>;
    expect(endereco).not.toHaveProperty('cep');
    expect(endereco).not.toHaveProperty('numero');
    expect(endereco).not.toHaveProperty('logradouro');
    expect(endereco).not.toHaveProperty('bairro');
    expect(endereco).not.toHaveProperty('ibge');
  });

  it('envia cada campo editável alterado com sua chave e conversão contratual', () => {
    const component = fixture.componentInstance;
    const cases = [
      { control: component.form.controls.nome, value: 'Ana Maria', expected: { nome: 'Ana Maria' } },
      { control: component.form.controls.rg, value: '987654321', expected: { rg: '987654321' } },
      {
        control: component.form.controls.dataNascimento,
        value: '15/04/2005',
        expected: { dataNascimento: '2005-04-15' },
      },
      {
        control: component.form.controls.telefone,
        value: '(21) 98765-4321',
        expected: { telefone: '(21) 98765-4321' },
      },
      { control: component.form.controls.tipoSanguineo, value: 'A+', expected: { tipoSanguineo: 'A+' } },
      {
        control: component.form.controls.doencasAlergias,
        value: 'Asma',
        expected: { doencasAlergias: 'Asma' },
      },
      {
        control: component.form.controls.cep,
        value: '02000000',
        expected: { endereco: { cep: '02000000' } },
      },
      {
        control: component.form.controls.numero,
        value: '101',
        expected: { endereco: { numero: '101' } },
      },
      {
        control: component.form.controls.complemento,
        value: 'Apto 21',
        expected: { endereco: { complemento: 'Apto 21' } },
      },
    ];

    for (const testCase of cases) {
      service.atualizarMeuPerfil.mockClear();
      service.atualizarMeuPerfil.mockReturnValueOnce(of(profile));
      component.enablePersonalInfoEditing();
      testCase.control.setValue(testCase.value);
      component.salvar();
      expect(service.atualizarMeuPerfil.mock.calls[0][0]).toMatchObject({
        ehCin: false,
        ...testCase.expected,
      });
    }
  });

  it('não bloqueia alterações por CPF ausente ou inválido no perfil recebido', async () => {
    for (const cpf of [null, '123']) {
      fixture.destroy();
      service.obterMeuPerfil.mockReturnValueOnce(of({ ...profile, cpf }));
      fixture = TestBed.createComponent(MyProfile);
      fixture.detectChanges();
      await fixture.whenStable();

      const component = fixture.componentInstance;
      service.atualizarMeuPerfil.mockClear();
      service.atualizarMeuPerfil.mockReturnValueOnce(
        of({ ...profile, cpf, telefone: '(21) 98765-4321' }),
      );
      component.enablePersonalInfoEditing();
      component.form.controls.telefone.setValue('(21) 98765-4321');
      component.salvar();

      expect(component.form.controls.cpf.disabled).toBe(true);
      expect(service.atualizarMeuPerfil).toHaveBeenCalledOnce();
      expect(service.atualizarMeuPerfil.mock.calls[0][0]).toMatchObject({
        ehCin: false,
        telefone: '(21) 98765-4321',
      });
    }
  });

  it('ignora RG legado inválido quando ehCin=true e mantém RG validado nos demais casos', async () => {
    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(of({ ...profile, ehCin: true, rg: 'inválido' }));
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.form.controls.rg.disabled).toBe(true);
    expect(component.form.controls.rg.status).toBe('DISABLED');
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');
    component.salvar();
    expect(service.atualizarMeuPerfil.mock.calls.at(-1)?.[0]).not.toHaveProperty('rg');

    fixture.destroy();
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    const nonCin = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    service.atualizarMeuPerfil.mockClear();
    nonCin.enablePersonalInfoEditing();
    nonCin.form.controls.rg.setValue('');
    nonCin.salvar();
    expect(nonCin.form.controls.rg.hasError('required')).toBe(true);
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(toast.toasts().at(-1)).toMatchObject({
      message: 'Informe um RG válido ou regularize a identificação CIN do usuário.',
      type: 'error',
    });
  });

  it('mostra validação específica no formulário e exige CEP ao alterar endereço', async () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    component.enablePersonalInfoEditing();
    component.form.controls.nome.setValue('   ');
    component.salvar();

    expect(component.form.controls.nome.touched).toBe(true);
    expect(component.form.controls.nome.invalid).toBe(true);
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(toast.toasts().at(-1)?.message).toBe('Informe um nome válido.');
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(
      page
        .querySelector<HTMLInputElement>('[formcontrolname="nome"] input')
        ?.getAttribute('aria-invalid'),
    ).toBe('true');

    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(of({ ...profile, endereco: null }));
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    const noAddress = fixture.componentInstance;
    service.atualizarMeuPerfil.mockClear();
    noAddress.enablePersonalInfoEditing();
    noAddress.form.controls.numero.setValue('10');
    noAddress.salvar();

    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(toast.toasts().at(-1)?.message).toBe(
      'Informe um CEP válido antes de atualizar o endereço.',
    );
  });

  it('valida data e limite de alergias/doenças com mensagens específicas', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    component.enablePersonalInfoEditing();
    component.form.controls.dataNascimento.setValue('31/02/2000');
    component.salvar();
    expect(toast.toasts().at(-1)?.message).toBe(
      'Informe uma data de nascimento válida no formato dd/mm/aaaa.',
    );

    component.form.controls.dataNascimento.setValue('29/02/2000');
    component.form.controls.doencasAlergias.setValue('x'.repeat(2001));
    component.salvar();
    expect(toast.toasts().at(-1)?.message).toBe(
      'A descrição de alergias/doenças deve ter no máximo 2000 caracteres.',
    );
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
  });

  it('atualiza o resumo no sucesso e mostra apenas um toast verde', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    toast.clear();
    component.enablePersonalInfoEditing();
    component.form.controls.nome.setValue('Ana Maria');
    service.atualizarMeuPerfil.mockReturnValueOnce(of({ ...profile, nome: 'Ana Maria' }));
    component.salvar();

    expect(component.user()?.nome).toBe('Ana Maria');
    expect(component.nomeResumo.value).toBe('Ana Maria');
    expect(component.form.controls.nome.value).toBe('Ana Maria');
    expect(component.form.pristine).toBe(true);
    expect(component.personalInfoInactive()).toBe(true);
    expect(component.saving()).toBe(false);
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({
      message: 'Seu perfil foi atualizado com sucesso.',
      type: 'success',
    });
  });

  it('preserva uma edição após erro 400 de endereço e permite corrigir e tentar novamente', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    service.atualizarMeuPerfil
      .mockReturnValueOnce(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { errors: { 'Endereco.Cep': ['CEP não aceito.'] } },
            }),
        ),
      )
      .mockReturnValueOnce(of(profile));
    component.enablePersonalInfoEditing();
    component.form.controls.cep.setValue('02000000');
    component.salvar();

    expect(component.form.controls.cep.hasError('server')).toBe(true);
    expect(component.personalInfoInactive()).toBe(false);
    expect(component.form.controls.cep.value).toBe('02000000');
    expect(toast.toasts().at(-1)?.message).toBe('CEP não aceito.');

    component.form.controls.cep.setValue('03000000');
    expect(component.form.controls.cep.hasError('server')).toBe(false);
    component.salvar();
    expect(service.atualizarMeuPerfil).toHaveBeenCalledTimes(2);
    expect(component.saving()).toBe(false);
  });

  it('ignora cliques duplicados durante o salvamento', () => {
    const component = fixture.componentInstance;
    const response = new Subject<MyProfileResponse>();
    service.atualizarMeuPerfil.mockReturnValue(response);
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('(21) 98765-4321');

    component.salvar();
    component.salvar();

    expect(component.saving()).toBe(true);
    expect(service.atualizarMeuPerfil).toHaveBeenCalledOnce();
    response.next({ ...profile, telefone: '(21) 98765-4321' });
    response.complete();
    expect(component.saving()).toBe(false);
  });

  it('mostra erro para foto inválida e avisa quando o perfil não carrega', async () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    const validFile = new File(['image'], 'valid.webp', { type: 'image/webp' });
    const invalidFile = new File(['image'], 'profile.gif', { type: 'image/gif' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:valid-photo');
    const validInput = document.createElement('input');
    validInput.type = 'file';
    Object.defineProperty(validInput, 'files', { value: [validFile] });
    component.selecionarFoto({ target: validInput } as unknown as Event);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [invalidFile] });
    component.selecionarFoto({ target: input } as unknown as Event);

    expect(input.value).toBe('');
    expect(component.pendingPhoto()).toBe(validFile);
    expect(component.fotoAtual()).toBe('blob:valid-photo');
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();
    expect(toast.toasts().at(-1)?.message).toBe(
      'Selecione uma foto JPEG, PNG ou WebP de até 10 MB.',
    );

    fixture.destroy();
    service.obterMeuPerfil.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    fixture = TestBed.createComponent(MyProfile);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(toast.toasts().at(-1)).toMatchObject({
      message: 'Sem conexão com o servidor.',
      type: 'error',
    });
  });

  it('não chama PUT quando nada mudou e mantém campos administrativos somente leitura', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    component.enablePersonalInfoEditing();
    component.salvar();
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(toast.toasts()[0]).toMatchObject({
      message: 'Nenhuma alteração foi feita. Edite alguma informação antes de salvar.',
      type: 'error',
    });

    const page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLButtonElement>('.profile-edit-button button')?.click();
    fixture.detectChanges();
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="name"]')?.disabled).toBe(false);
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
    expect(component.form.controls.nome.enabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="nome"] input')?.disabled).toBe(false);
    expect(component.form.controls.cpf.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="cpf"] input')?.disabled).toBe(true);
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
    const toast = TestBed.inject(ToastService);
    service.atualizarMeuPerfil.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { detail: 'Conflito no perfil.' } })),
    );
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21987654321');
    component.salvar();

    expect(component.errorMessage()).toBe('Conflito no perfil.');
    expect(component.successMessage()).toBe('');
    expect(component.form.controls.telefone.value).toBe('21987654321');
    expect(component.personalInfoInactive()).toBe(false);
    expect(component.saving()).toBe(false);
    expect(toast.toasts().at(-1)).toMatchObject({
      message: 'Conflito no perfil.',
      type: 'error',
    });
  });

  it('informa falta de permissão quando a API responde 403', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    service.atualizarMeuPerfil.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21987654321');
    component.salvar();

    expect(toast.toasts().at(-1)).toMatchObject({
      message: 'Você não tem permissão para esta operação.',
      type: 'error',
    });
    expect(component.personalInfoInactive()).toBe(false);
    expect(component.saving()).toBe(false);
  });

  it('mantém a foto selecionada localmente e só envia após Salvar', () => {
    const component = fixture.componentInstance;
    component.user.set({ ...profile, fotoUrl: '/api/Me/foto' });
    TestBed.inject(AuthService).user.set({
      id: profile.id,
      nome: profile.nome,
      email: profile.email,
      cargo: profile.cargo!,
    });

    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.enviarMinhaFoto.mockReturnValue(of(undefined));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);

    expect(component.pendingPhoto()).toBe(file);
    expect(component.fotoAtual()).toBe('blob:profile-preview');
    expect(component.photoSaving()).toBe(false);
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(userAvatar.reloadCurrentUserPhoto).not.toHaveBeenCalled();

    component.salvar();

    expect(service.enviarMinhaFoto).toHaveBeenCalledWith(file);
    expect(userAvatar.reloadCurrentUserPhoto).toHaveBeenCalledOnce();
    expect(service.obterMinhaFoto).not.toHaveBeenCalled();
    expect(service.atualizarMeuPerfil).not.toHaveBeenCalled();
    expect(component.pendingPhoto()).toBeNull();
    expect(component.fotoAtual()).toBe('blob:profile-preview');
  });

  it('mantém a prévia pendente e permite nova tentativa quando o upload falha', () => {
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    toast.clear();
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.enviarMinhaFoto.mockReturnValue(throwError(() => new Error('upload failed')));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:failed-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });

    component.selecionarFoto({ target: input } as unknown as Event);
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();
    component.salvar();

    expect(component.fotoAtual()).toBe('blob:failed-preview');
    expect(component.pendingPhoto()).toBe(file);
    expect(userAvatar.reloadCurrentUserPhoto).not.toHaveBeenCalled();
    expect(toast.toasts().at(-1)).toMatchObject({
      message: 'Não foi possível enviar a foto.',
      type: 'error',
    });
    expect(component.saving()).toBe(false);
    expect(component.photoSaving()).toBe(false);
  });

  it('persiste dados antes da foto e, após falha parcial, repete apenas o upload', () => {
    const component = fixture.componentInstance;
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    TestBed.inject(AuthService).user.set({
      id: profile.id,
      nome: profile.nome,
      email: profile.email,
      cargo: profile.cargo!,
    });
    service.atualizarMeuPerfil.mockReturnValueOnce(of({ ...profile, telefone: '21999999999' }));
    service.enviarMinhaFoto
      .mockReturnValueOnce(throwError(() => new Error('upload failed')))
      .mockReturnValueOnce(of(undefined));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21999999999');

    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledOnce();
    expect(service.enviarMinhaFoto).toHaveBeenCalledOnce();
    expect(component.pendingPhoto()).toBe(file);
    expect(component.form.controls.telefone.value).toBe('21999999999');
    expect(component.errorMessage()).toContain('Os dados foram salvos, mas a foto');
    expect(component.saving()).toBe(false);

    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledOnce();
    expect(service.enviarMinhaFoto).toHaveBeenCalledTimes(2);
    expect(component.pendingPhoto()).toBeNull();
    expect(userAvatar.reloadCurrentUserPhoto).toHaveBeenCalledOnce();
  });

  it('não envia a foto se a atualização dos dados falhar', () => {
    const component = fixture.componentInstance;
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.atualizarMeuPerfil.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    service.enviarMinhaFoto.mockReturnValueOnce(of(undefined));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21999999999');

    component.salvar();

    expect(service.atualizarMeuPerfil).toHaveBeenCalledOnce();
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();
    expect(component.pendingPhoto()).toBe(file);
    expect(component.form.controls.telefone.value).toBe('21999999999');
    expect(component.saving()).toBe(false);
  });

  it('substitui a foto pendente pela última seleção e mantém a anterior se o seletor for cancelado', () => {
    const component = fixture.componentInstance;
    const fileA = new File(['A'], 'a.webp', { type: 'image/webp' });
    const fileB = new File(['B'], 'b.webp', { type: 'image/webp' });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:photo-a')
      .mockReturnValueOnce('blob:photo-b');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const select = (file?: File) => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: file ? [file] : [] });
      component.selecionarFoto({ target: input } as unknown as Event);
      expect(input.value).toBe('');
      return input;
    };

    select(fileA);
    select(fileB);
    select();
    fixture.detectChanges();

    expect(component.pendingPhoto()).toBe(fileB);
    expect(component.fotoAtual()).toBe('blob:photo-b');
    expect(revokeSpy).toHaveBeenCalledWith('blob:photo-a');
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();

    service.enviarMinhaFoto.mockReturnValueOnce(of(undefined));
    component.salvar();

    expect(service.enviarMinhaFoto).toHaveBeenCalledOnce();
    expect(service.enviarMinhaFoto).toHaveBeenCalledWith(fileB);
  });

  it('descarta a foto pendente ao cancelar sem iniciar gravações', () => {
    const component = fixture.componentInstance;
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);

    component.cancel();
    fixture.detectChanges();

    expect(component.pendingPhoto()).toBeNull();
    expect(component.fotoAtual()).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('blob:pending-photo');
    expect(service.enviarMinhaFoto).not.toHaveBeenCalled();
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
