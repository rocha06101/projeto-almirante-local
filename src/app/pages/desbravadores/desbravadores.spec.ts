import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { Desbravadores } from './desbravadores';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';

const usuario = (over: Partial<UserModel> = {}): UserModel => ({
  id: 'u1',
  nome: 'Ana Souza',
  email: 'ana@example.com',
  dataCriacao: '2026-09-01T10:00:00Z',
  funcao: 'Secretário',
  ativo: true,
  cargo: { id: 'c-sec', nome: 'Secretário', role: 'SEC' },
  ...over,
});

describe('Desbravadores', () => {
  let fixture: ComponentFixture<Desbravadores>;
  let component: Desbravadores;
  let host: HTMLElement;
  let service: { listarUsuarios: ReturnType<typeof vi.fn>; excluirUsuario: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;

  const render = () => fixture.detectChanges();

  const create = async (usuarios: UserModel[] = [usuario(), usuario({ id: 'u2', nome: 'Bruno Lima', email: 'bruno@example.com' })]) => {
    service.listarUsuarios.mockReturnValue(of(usuarios));
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Desbravadores);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    render();
    await fixture.whenStable();
    render();
  };

  const rowButton = (nome: string, acao: 'Editar' | 'Excluir') =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${acao} ${nome}"]`)!;

  const modalButton = (texto: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.modal-actions button')).find(b => b.textContent?.trim() === texto)!;

  beforeEach(() => {
    history.replaceState(null, '');
    service = { listarUsuarios: vi.fn(), excluirUsuario: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Desbravadores],
      providers: [provideRouter([]), { provide: UserService, useValue: service }],
    });
  });

  it('lista nome e cargo, sem e-mail nem data de criação', async () => {
    await create();

    expect(service.listarUsuarios).toHaveBeenCalledWith({ includeInactive: false });
    const primeiraLinha = host.querySelector('tbody tr')!;
    expect(primeiraLinha.textContent).toContain('Ana Souza');
    expect(primeiraLinha.textContent).not.toContain('ana@example.com');
    expect(primeiraLinha.textContent).not.toContain('01/09/2026');
    expect(primeiraLinha.querySelector('.role-pill')?.textContent?.trim()).toBe('Secretário');
  });

  it('não tem botão "Atualizar"', async () => {
    await create();

    const textos = Array.from(host.querySelectorAll('button')).map(b => b.textContent?.trim());
    expect(textos).not.toContain('Atualizar');
  });

  const pesquisar = (termo: string) => {
    const campo = host.querySelector<HTMLInputElement>('.search-box input')!;
    campo.value = termo;
    campo.dispatchEvent(new Event('input'));
    render();
  };

  const nomesListados = () => Array.from(host.querySelectorAll('tbody tr strong')).map(s => s.textContent?.trim());

  it('pesquisa filtra por nome ou cargo, ignorando acentos e maiúsculas', async () => {
    await create([
      usuario(),
      usuario({ id: 'u2', nome: 'Bruno Lima', cargo: { id: 'c-dir', nome: 'Diretor', role: 'DIR' } }),
      usuario({ id: 'u3', nome: 'Érica Prado', cargo: { id: 'c-ins', nome: 'Instrutor', role: 'INS' } }),
    ]);

    pesquisar('BRUNO');
    expect(nomesListados()).toEqual(['Bruno Lima']);

    pesquisar('erica');
    expect(nomesListados()).toEqual(['Érica Prado']);

    pesquisar('secretario');
    expect(nomesListados()).toEqual(['Ana Souza']);

    pesquisar('');
    expect(nomesListados()).toEqual(['Ana Souza', 'Bruno Lima', 'Érica Prado']);
  });

  it('pesquisa sem resultado mostra aviso e não esconde o campo de busca', async () => {
    await create();

    pesquisar('zzz');

    expect(host.querySelector('tbody')).toBeNull();
    expect(host.querySelector('.state-card')?.textContent).toContain('Nenhum usuario corresponde a "zzz"');
    expect(host.querySelector('.search-box input')).toBeTruthy();
  });

  it('não renderiza o id (GUID) dos usuários no HTML, nem com inativos e modal abertos', async () => {
    const guids = ['3f2504e0-4f89-11d3-9a0c-0305e82c3301', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'];
    await create([usuario({ id: guids[0] }), usuario({ id: guids[1], nome: 'Bruno Lima', ativo: false })]);
    rowButton('Ana Souza', 'Excluir').click();
    render();

    for (const guid of guids) {
      expect(host.innerHTML).not.toContain(guid);
    }
  });

  it('"Exibir inativos" recarrega com includeInactive e marca os inativos sem ações', async () => {
    await create();
    service.listarUsuarios.mockReturnValue(of([usuario(), usuario({ id: 'u3', nome: 'Caio Inativo', ativo: false })]));

    const toggle = host.querySelector<HTMLInputElement>('.inactive-toggle input')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    render();

    expect(service.listarUsuarios).toHaveBeenLastCalledWith({ includeInactive: true });
    const linhaInativa = Array.from(host.querySelectorAll('tbody tr')).find(tr => tr.textContent?.includes('Caio Inativo'))!;
    expect(linhaInativa.querySelector('.status-pill.inactive')).toBeTruthy();
    expect(linhaInativa.querySelector('.row-actions')).toBeNull();
  });

  it('Editar abre o formulário com o usuário no estado de navegação (sem id na URL)', async () => {
    await create();

    rowButton('Ana Souza', 'Editar').click();

    expect(navigate).toHaveBeenCalledWith(['/desbravadores/editar'], { state: { usuario: usuario() } });
  });

  it('exclusão exige confirmação antes de chamar a API', async () => {
    await create();

    rowButton('Ana Souza', 'Excluir').click();
    render();

    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain('Deseja realmente excluir o usuário');
    expect(service.excluirUsuario).not.toHaveBeenCalled();

    modalButton('Cancelar').click();
    render();

    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(service.excluirUsuario).not.toHaveBeenCalled();
  });

  it('exclusão confirmada chama a API, fecha o modal e recarrega a listagem', async () => {
    await create();
    service.excluirUsuario.mockReturnValue(of(undefined));

    rowButton('Ana Souza', 'Excluir').click();
    render();
    service.listarUsuarios.mockReturnValue(of([usuario({ id: 'u2', nome: 'Bruno Lima', email: 'bruno@example.com' })]));
    modalButton('Excluir').click();
    render();

    expect(service.excluirUsuario).toHaveBeenCalledWith('u1');
    expect(service.listarUsuarios).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(host.querySelector('.feedback-banner.success')?.textContent).toContain('Ana Souza foi excluído com sucesso.');
    expect(host.querySelector('tbody')?.textContent).not.toContain('Ana Souza');
  });

  it('409 por evento futuro: mostra a mensagem da API e mantém a listagem', async () => {
    await create();
    const detalhe = 'Não é possível excluir o usuário, pois ele está vinculado ao evento "Campori" (10/10/2026).';
    service.excluirUsuario.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              title: 'Usuário vinculado a eventos futuros.',
              detail: detalhe,
              eventos: [{ id: 'e1', nome: 'Campori', data: '2026-10-10' }],
            },
          }),
      ),
    );

    rowButton('Ana Souza', 'Excluir').click();
    render();
    modalButton('Excluir').click();
    render();

    expect(host.querySelector('[role="alertdialog"] .form-error')?.textContent).toContain(detalhe);
    expect(component.isDeleting()).toBe(false);
    expect(service.listarUsuarios).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('403 na exclusão mostra falta de permissão sem derrubar a tela', async () => {
    await create();
    service.excluirUsuario.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { title: 'ACESSO NEGADO!', detail: 'Somente um Administrador pode gerenciar usuários com o cargo Administrador.' },
          }),
      ),
    );

    rowButton('Ana Souza', 'Excluir').click();
    render();
    modalButton('Excluir').click();
    render();

    expect(host.querySelector('[role="alertdialog"] .form-error')?.textContent).toContain('Somente um Administrador');
    expect(host.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('mostra o feedback recebido do formulário (cadastro/alteração)', async () => {
    history.replaceState({ feedback: 'Ana Souza cadastrado com sucesso.' }, '');
    await create();

    expect(host.querySelector('.feedback-banner.success')?.textContent).toContain('Ana Souza cadastrado com sucesso.');
    history.replaceState(null, '');
  });
});
