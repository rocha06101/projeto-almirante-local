import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { of, Subject, throwError } from 'rxjs';

import { UserRegister } from './user-register';
import { Cargo, UserAddress, User as UserModel } from '../../../core/models/user.model';
import { User as UserService } from '../../../core/services/user';

const cargos: Cargo[] = [
  { id: 'c-dir', nome: 'Diretor', descricao: '', ativo: true, role: 'DIR' },
  { id: 'c-sec', nome: 'Secretário', descricao: '', ativo: true, role: 'SEC' },
  { id: 'c-old', nome: 'Cargo Antigo', descricao: '', ativo: false, role: 'OLD' },
];

const usuario: UserModel = {
  id: 'u1',
  nome: 'Ana Souza',
  email: 'ana@example.com',
  tipoSanguineo: 'O+',
  doencasAlergias: 'Asma',
  endereco: {
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    numero: '10',
    complemento: 'Apto 1',
    bairro: 'Sé',
    localidade: 'São Paulo',
    uf: 'SP',
  },
  dataCriacao: '2026-09-01T10:00:00Z',
  funcao: 'Secretário',
  ativo: true,
  cargo: { id: 'c-sec', nome: 'Secretário', role: 'SEC' },
};

const SENHA_VALIDA = 'Kx9#pLm2@vQz';

describe('UserRegister', () => {
  let component: UserRegister;
  let fixture: ComponentFixture<UserRegister>;
  let host: HTMLElement;
  let service: {
    listarCargos: ReturnType<typeof vi.fn>;
    consultarCep: ReturnType<typeof vi.fn>;
    criarUsuario: ReturnType<typeof vi.fn>;
    atualizarUsuario: ReturnType<typeof vi.fn>;
    enviarFoto: ReturnType<typeof vi.fn>;
    obterFoto: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;
  let loggedInRole = 'SEC';

  const setup = async (modo?: 'editar') => {
    TestBed.configureTestingModule({
      imports: [UserRegister],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: service },
        { provide: AuthService, useValue: { user: () => ({ cargo: { role: loggedInRole } }) } },
        ...(modo ? [{ provide: ActivatedRoute, useValue: { snapshot: { data: { modo } } } }] : []),
      ],
    });

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(UserRegister);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const preencher = (
    valores: Partial<
      Record<'nome' | 'email' | 'senha' | 'confirmarSenha' | 'cargoId' | 'tipoSanguineo' | 'doencasAlergias', string>
    >,
  ) => {
    component.form.patchValue(valores);
    fixture.detectChanges();
  };

  const clicarSalvar = () => {
    host.querySelector<HTMLButtonElement>('.header-actions .refresh-button')!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    history.replaceState(null, '');
    service = {
      listarCargos: vi.fn().mockReturnValue(of(cargos)),
      consultarCep: vi.fn().mockReturnValue(of({
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
        estado: 'São Paulo',
        ibge: '3550308',
      })),
      criarUsuario: vi.fn(),
      atualizarUsuario: vi.fn(),
      enviarFoto: vi.fn(),
      obterFoto: vi.fn(),
    };
    loggedInRole = 'SEC';
  });

  afterEach(() => history.replaceState(null, ''));

  it('carrega os cargos da API exibindo o nome (não a role) e somente os ativos', async () => {
    await setup();

    expect(service.listarCargos).toHaveBeenCalledTimes(1);
    const cargoSelect = Array.from(host.querySelectorAll<HTMLSelectElement>('app-primary-select select'))
      .find(select => select.querySelector('option[value="c-dir"]'))!;
    const options = Array.from(cargoSelect.querySelectorAll<HTMLOptionElement>('option'))
      .filter(option => option.value)
      .map(option => ({ label: option.textContent?.trim(), value: option.value }));
    expect(options).toEqual([
      { label: 'Diretor', value: 'c-dir' },
      { label: 'Secretário', value: 'c-sec' },
    ]);
  });

  it('mantém os campos visuais da tela (CPF, telefone, responsável e foto)', async () => {
    await setup();

    const labels = Array.from(host.querySelectorAll('label')).map(label => label.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining([
        'CPF',
        'RG',
        'Telefone',
        'Tipo sanguíneo',
        'Doenças e alergias',
        'CEP',
        'Rua',
        'Bairro',
        'Número',
        'Complemento',
        'Nome do responsável',
        'Email do responsável',
        'cargo/ Função',
      ]),
    );
    expect(host.querySelector('#user-register-address-title')?.textContent?.trim()).toBe('Endereço');
    expect(Array.from(host.querySelectorAll('app-primary-select option')).map(option => option.textContent?.trim()))
      .toEqual(expect.arrayContaining(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']));
    expect(host.querySelector('input[placeholder="00.000.000-0"]')).toBeTruthy();
    expect(host.querySelector('textarea[formControlName="doencasAlergias"]')).toBeTruthy();
    expect(host.querySelector('app-upload-foto')).toBeTruthy();
  });

  it('cadastra enviando os dados de saúde junto da conta e volta para a listagem', async () => {
    service.criarUsuario.mockReturnValue(of({ ...usuario, id: 'novo' }));
    await setup();

    preencher({
      nome: '  Ana Souza ',
      email: 'ana@example.com ',
      senha: SENHA_VALIDA,
      confirmarSenha: SENHA_VALIDA,
      cargoId: 'c-sec',
      tipoSanguineo: 'O+',
      doencasAlergias: 'Alergia a amendoim',
    });

    clicarSalvar();

    expect(service.criarUsuario).toHaveBeenCalledWith({
      nome: 'Ana Souza',
      email: 'ana@example.com',
      senha: SENHA_VALIDA,
      cargoId: 'c-sec',
      tipoSanguineo: 'O+',
      doencasAlergias: 'Alergia a amendoim',
    });
    expect(navigate).toHaveBeenCalledWith(['/desbravadores'], {
      state: { feedback: 'Ana Souza cadastrado com sucesso.' },
    });
  });

  it('cria o usuário antes do upload e permite reenviar somente a foto após falha', async () => {
    const criado = { ...usuario, id: 'novo' };
    service.criarUsuario.mockReturnValue(of(criado));
    service.enviarFoto
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
      .mockReturnValueOnce(of({ ...criado, fotoUrl: '/api/Usuarios/novo/foto' }));
    await setup();
    preencher({
      nome: 'Ana Souza',
      email: 'ana@example.com',
      senha: SENHA_VALIDA,
      confirmarSenha: SENHA_VALIDA,
      cargoId: 'c-sec',
    });
    const arquivo = new File(['foto'], 'perfil.webp', { type: 'image/webp' });
    component.onFotoSelecionada(arquivo);

    clicarSalvar();

    expect(service.criarUsuario).toHaveBeenCalledTimes(1);
    expect(service.enviarFoto).toHaveBeenCalledWith('novo', arquivo);
    expect(component.usuarioPendenteFoto()?.id).toBe('novo');
    expect(host.querySelector('.form-feedback.error')?.textContent).toContain('servidor');
    expect(navigate).not.toHaveBeenCalled();

    clicarSalvar();

    expect(service.criarUsuario).toHaveBeenCalledTimes(1);
    expect(service.enviarFoto).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(['/desbravadores'], {
      state: { feedback: 'Ana Souza cadastrado com sucesso.' },
    });
  });

  it('desabilita o upload para perfis sem permissão de gestão de cadastros', async () => {
    loggedInRole = 'DS';
    await setup();

    expect(host.querySelector<HTMLElement>('app-upload-foto .upload-foto-container')?.getAttribute('aria-disabled'))
      .toBe('true');
  });

  it('exibe a seleção apenas no avatar e limpa a prévia ao cancelar a seleção', async () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:foto-local');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await setup();

    component.onFotoSelecionada(new File(['imagem'], 'perfil.webp', { type: 'image/webp' }));
    fixture.detectChanges();

    expect(host.querySelector('.container-image-center .profile-photo')).toBeTruthy();
    expect(host.querySelector('app-upload-foto .upload-foto-preview')).toBeNull();

    component.onFotoSelecionada(null);
    fixture.detectChanges();

    expect(host.querySelector('.container-image-center .profile-photo')).toBeNull();
    expect(host.querySelector('.container-image-center img[src="/icons/camera-icon.svg"]')).toBeTruthy();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:foto-local');
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it('consulta CEP completo com atraso, preenche rua e bairro e envia os metadados retornados', async () => {
    service.criarUsuario.mockReturnValue(of({ ...usuario, id: 'novo' }));
    await setup();

    component.form.patchValue({
      nome: 'Ana Souza',
      email: 'ana@example.com',
      senha: SENHA_VALIDA,
      confirmarSenha: SENHA_VALIDA,
      cargoId: 'c-sec',
      cep: '01001-000',
      numero: '10',
      complemento: 'Apto 1',
    });
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 400));
    fixture.detectChanges();

    expect(service.consultarCep).toHaveBeenCalledWith('01001000');
    expect(component.form.controls.logradouro.value).toBe('Praça da Sé');
    expect(component.form.controls.bairro.value).toBe('Sé');

    clicarSalvar();
    expect(service.criarUsuario).toHaveBeenCalledWith(expect.objectContaining({
      endereco: {
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        numero: '10',
        complemento: 'Apto 1',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
        estado: 'São Paulo',
        ibge: '3550308',
      },
    }));
  });

  it('não consulta CEP incompleto e mantém o endereço manual ao falhar a busca', async () => {
    service.consultarCep.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await setup();

    component.form.patchValue({ cep: '1234', logradouro: 'Rua Manual', bairro: 'Centro' });
    fixture.detectChanges();
    expect(service.consultarCep).not.toHaveBeenCalled();
    expect(component.form.controls.logradouro.value).toBe('Rua Manual');

    component.form.controls.cep.setValue('01001-000');
    await new Promise(resolve => setTimeout(resolve, 400));
    fixture.detectChanges();

    expect(component.form.controls.logradouro.value).toBe('Rua Manual');
    expect(component.form.controls.bairro.value).toBe('Centro');
    expect(host.querySelector('.address-feedback')?.textContent).toContain('Preencha o endereço manualmente');
  });

  it('ignora a resposta de um CEP anterior quando o usuário informa outro CEP', async () => {
    const primeiraConsulta = new Subject<UserAddress>();
    service.consultarCep.mockImplementation((cep: string) =>
      cep === '11111111'
        ? primeiraConsulta
        : of({ cep: '22222-222', logradouro: 'Rua Nova', bairro: 'Bairro Novo' }),
    );
    await setup();

    component.form.controls.cep.setValue('11111-111');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(service.consultarCep).toHaveBeenCalledWith('11111111');

    component.form.controls.cep.setValue('22222-222');
    await new Promise(resolve => setTimeout(resolve, 400));
    primeiraConsulta.next({ cep: '11111-111', logradouro: 'Rua Antiga', bairro: 'Bairro Antigo' });
    primeiraConsulta.complete();

    expect(component.form.controls.logradouro.value).toBe('Rua Nova');
    expect(component.form.controls.bairro.value).toBe('Bairro Novo');
  });

  it('não envia formulário inválido e mostra os erros dos campos', async () => {
    await setup();

    preencher({ nome: 'Ana', email: 'email-invalido', senha: 'curta', confirmarSenha: 'outra', cargoId: '' });
    clicarSalvar();

    expect(service.criarUsuario).not.toHaveBeenCalled();
    const erros = Array.from(host.querySelectorAll('.field-error')).map(e => e.textContent?.trim());
    expect(erros).toEqual(
      expect.arrayContaining([
        'Digite um e-mail válido.',
        'A senha deve ter ao menos 12 caracteres.',
        'As senhas não conferem.',
        'Selecione o cargo.',
      ]),
    );
  });

  it('e-mail duplicado (409): mostra a mensagem da API, mantém os dados e não sai da tela', async () => {
    service.criarUsuario.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { title: 'E-mail já cadastrado.', detail: 'Já existe um usuário cadastrado com o e-mail informado.' },
          }),
      ),
    );
    await setup();

    preencher({ nome: 'Ana Souza', email: 'ana@example.com', senha: SENHA_VALIDA, confirmarSenha: SENHA_VALIDA, cargoId: 'c-sec' });
    clicarSalvar();

    expect(host.querySelector('.form-feedback.error')?.textContent).toContain(
      'Já existe um usuário cadastrado com o e-mail informado.',
    );
    expect(component.form.getRawValue()).toEqual({
      nome: 'Ana Souza',
      email: 'ana@example.com',
      senha: SENHA_VALIDA,
      confirmarSenha: SENHA_VALIDA,
      cargoId: 'c-sec',
      tipoSanguineo: '',
      doencasAlergias: '',
      cep: '',
      logradouro: '',
      bairro: '',
      numero: '',
      complemento: '',
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  it('associa os erros de validação da API (400) aos campos do formulário', async () => {
    service.criarUsuario.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { title: 'Dados inválidos.', errors: { Senha: ['A senha é trivial ou muito comum.'] } },
          }),
      ),
    );
    await setup();

    preencher({ nome: 'Ana Souza', email: 'ana@example.com', senha: 'Desbravador1!', confirmarSenha: 'Desbravador1!', cargoId: 'c-sec' });
    clicarSalvar();

    expect(component.form.controls.senha.errors?.['server']).toBe('A senha é trivial ou muito comum.');
    expect(host.querySelector('#user-register-senha-error')?.textContent).toContain('A senha é trivial ou muito comum.');
    expect(host.querySelector('.form-feedback.error')?.textContent).toContain('Verifique os campos destacados.');
  });

  it('edição carrega os valores do usuário selecionado e desabilita a senha', async () => {
    history.replaceState({ usuario }, '');
    await setup('editar');

    expect(component.isEdicao()).toBe(true);
    expect(component.form.controls.nome.value).toBe('Ana Souza');
    expect(component.form.controls.email.value).toBe('ana@example.com');
    expect(component.form.controls.cargoId.value).toBe('c-sec');
    expect(component.form.controls.tipoSanguineo.value).toBe('O+');
    expect(component.form.controls.doencasAlergias.value).toBe('Asma');
    expect(component.form.controls.cep.value).toBe('01001-000');
    expect(component.form.controls.logradouro.value).toBe('Praça da Sé');
    expect(component.form.controls.bairro.value).toBe('Sé');
    expect(component.form.controls.numero.value).toBe('10');
    expect(component.form.controls.complemento.value).toBe('Apto 1');
    expect(component.form.controls.senha.disabled).toBe(true);
    const select = Array.from(host.querySelectorAll<HTMLSelectElement>('app-primary-select select'))
      .find(candidate => candidate.querySelector('option[value="c-sec"]'))!;
    expect(select.value).toBe('c-sec');
  });

  it('edição não renderiza o id (GUID) do usuário no HTML', async () => {
    const guid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    history.replaceState({ usuario: { ...usuario, id: guid } }, '');
    await setup('editar');

    expect(host.innerHTML).not.toContain(guid);
  });

  it('edição chama PUT com o id do usuário, sem senha, e volta para a listagem', async () => {
    service.atualizarUsuario.mockReturnValue(of({ ...usuario, nome: 'Ana Maria Souza', cargo: cargos[0] }));
    history.replaceState({ usuario }, '');
    await setup('editar');

    preencher({ nome: 'Ana Maria Souza', cargoId: 'c-dir' });
    clicarSalvar();

    expect(service.criarUsuario).not.toHaveBeenCalled();
    expect(service.atualizarUsuario).toHaveBeenCalledWith('u1', {
      nome: 'Ana Maria Souza',
      email: 'ana@example.com',
      cargoId: 'c-dir',
      tipoSanguineo: 'O+',
      doencasAlergias: 'Asma',
      endereco: usuario.endereco,
    });
    expect(navigate).toHaveBeenCalledWith(['/desbravadores'], {
      state: { feedback: 'Cadastro de Ana Maria Souza atualizado com sucesso.' },
    });
  });

  it('edição sem usuário selecionado (ex.: acesso direto) não permite salvar', async () => {
    await setup('editar');

    expect(host.querySelector('.form-feedback.error')?.textContent).toContain('Volte à listagem');
    expect(host.querySelector<HTMLButtonElement>('.header-actions .refresh-button')!.disabled).toBe(true);
  });

  it('erro ao carregar cargos é exibido sem impedir o preenchimento', async () => {
    service.listarCargos.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await setup();

    expect(host.querySelector('.form-container-right [role="alert"]')?.textContent).toContain(
      'Não foi possível carregar os cargos.',
    );
    expect(component.form.enabled).toBe(true);
  });
});
