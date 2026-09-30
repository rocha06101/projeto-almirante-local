import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { UserRegister } from './user-register';
import { Cargo, User as UserModel } from '../../../core/models/user.model';
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
    criarUsuario: ReturnType<typeof vi.fn>;
    atualizarUsuario: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = async (modo?: 'editar') => {
    TestBed.configureTestingModule({
      imports: [UserRegister],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: service },
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

  const preencher = (valores: Partial<Record<'nome' | 'email' | 'senha' | 'confirmarSenha' | 'cargoId', string>>) => {
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
      criarUsuario: vi.fn(),
      atualizarUsuario: vi.fn(),
    };
  });

  afterEach(() => history.replaceState(null, ''));

  it('carrega os cargos da API exibindo o nome (não a role) e somente os ativos', async () => {
    await setup();

    expect(service.listarCargos).toHaveBeenCalledTimes(1);
    const options = Array.from(host.querySelectorAll<HTMLOptionElement>('app-primary-select option'))
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
      expect.arrayContaining(['CPF', 'Telefone', 'Nome do responsável', 'Email do responsável', 'cargo/ Função']),
    );
    expect(host.querySelector('app-upload-foto')).toBeTruthy();
  });

  it('cadastra enviando somente nome, email, senha e cargoId e volta para a listagem', async () => {
    service.criarUsuario.mockReturnValue(of({ ...usuario, id: 'novo' }));
    await setup();

    preencher({ nome: '  Ana Souza ', email: 'ana@example.com ', senha: SENHA_VALIDA, confirmarSenha: SENHA_VALIDA, cargoId: 'c-sec' });
    clicarSalvar();

    expect(service.criarUsuario).toHaveBeenCalledWith({
      nome: 'Ana Souza',
      email: 'ana@example.com',
      senha: SENHA_VALIDA,
      cargoId: 'c-sec',
    });
    expect(navigate).toHaveBeenCalledWith(['/desbravadores'], {
      state: { feedback: 'Ana Souza cadastrado com sucesso.' },
    });
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
    expect(component.form.controls.senha.disabled).toBe(true);
    const select = host.querySelector<HTMLSelectElement>('app-primary-select select')!;
    expect(select.value).toBe('c-sec');
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
