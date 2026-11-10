import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CepLookupResponse, User as UserModel } from '../../../core/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth';
import { User as UserService } from '../../../core/services/user';
import { UserAvatarService } from '../../../core/services/user-avatar.service';
import { PasswordChangeModal } from '../../../shared/components/password-change-modal/password-change-modal';
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
  responsavelTelefone: '11988887777',
  responsavelEmail: 'maria@example.com',
  dataExpiracao: '2027-01-01',
};

function expectRenderedProfile(page: HTMLElement): void {
  const input = (name: string) =>
    page.querySelector<HTMLInputElement>(`.personal-card app-primary-input[formcontrolname="${name}"] input`);
  const addressInput = (name: string) =>
    page.querySelector<HTMLInputElement>(`.address-card app-primary-input[formcontrolname="${name}"] input`);

  expect(input('nome')?.value).toBe('Ana Silva');
  expect(input('cpf')?.value).toBe('529.982.247-25');
  expect(input('rg')?.value).toBe('12.345.678-9');
  expect(input('dataNascimento')?.value).toBe('29/02/2000');
  expect(input('telefone')?.value).toBe('(11) 99999-9999');
  expect(addressInput('cep')?.value).toBe('01001-000');
  expect(addressInput('bairro')?.value).toBe('Sé');
  expect(addressInput('logradouro')?.value).toBe('Praça da Sé');
  expect(addressInput('numero')?.value).toBe('100');
  expect(addressInput('complemento')?.value).toBe('Apto 12');
  expect(
    page.querySelector<HTMLSelectElement>(
      '.personal-card app-primary-select[formcontrolname="tipoSanguineo"] select',
    )?.value,
  ).toBe('O+');
  expect(
    page.querySelector<HTMLTextAreaElement>(
      '.personal-card app-primary-textarea[formcontrolname="doencasAlergias"] textarea',
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
  let userAvatar: { reloadCurrentUserPhoto: ReturnType<typeof vi.fn> };

  async function createComponent(state: Record<string, unknown> = { usuario }): Promise<void> {
    history.replaceState(state, '', '/desbravadores/editar');
    await TestBed.configureTestingModule({
      imports: [UserEdit],
      providers: [
        provideRouter([]),
        { provide: UserService, useValue: service },
        { provide: UserAvatarService, useValue: userAvatar },
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
    userAvatar = { reloadCurrentUserPhoto: vi.fn() };
  });

  afterEach(() => vi.useRealTimers());

  it('seleciona a rota própria ou administrativa pela comparação dos IDs e mantém o alvo editado', async () => {
    await createComponent();
    const auth = TestBed.inject(AuthService);
    const component = fixture.componentInstance;
    auth.user.set({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      cargo: usuario.cargo!,
    });
    component.openPasswordModal();
    fixture.detectChanges();

    let modal = fixture.debugElement.query(By.directive(PasswordChangeModal)).componentInstance as PasswordChangeModal;
    expect(modal.isOwnAccount).toBe(true);
    expect(modal.targetUserId).toBe(usuario.id);

    auth.user.set({
      id: 'operator-1',
      nome: 'Operador',
      email: 'operator@example.com',
      cargo: usuario.cargo!,
    });
    fixture.detectChanges();
    modal = fixture.debugElement.query(By.directive(PasswordChangeModal)).componentInstance as PasswordChangeModal;
    expect(modal.isOwnAccount).toBe(false);
    expect(modal.targetUserId).toBe(usuario.id);
  });

  it('atualiza o avatar da própria conta somente após confirmar a foto', async () => {
    await createComponent();
    const auth = TestBed.inject(AuthService);
    auth.user.set({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      cargo: { id: 'cargo-1', nome: 'Administrador', role: 'ADM' },
    });

    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.enviarFoto.mockReturnValue(of(usuario));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    fixture.componentInstance.selecionarFoto({ target: input } as unknown as Event);

    expect(service.enviarFoto).not.toHaveBeenCalled();
    expect(userAvatar.reloadCurrentUserPhoto).not.toHaveBeenCalled();
    expect(fixture.componentInstance.pendingPhoto()).toBe(file);
    fixture.componentInstance.salvar();

    expect(service.enviarFoto).toHaveBeenCalledWith(usuario.id, file);
    expect(userAvatar.reloadCurrentUserPhoto).toHaveBeenCalledOnce();
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('oferece editar ou manter CPF e RG ausentes e ativa somente os campos faltantes', async () => {
    await createComponent({
      usuario: { ...usuario, cpf: null, rg: null },
    });
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector<HTMLInputElement>('[formcontrolname="cpf"] input')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="rg"] input')?.disabled).toBe(true);
    component.form.controls.telefone.setValue('(21) 98888-7777');
    component.salvar();

    const toast = TestBed.inject(ToastService).toasts().find(record => record.type === 'warning');
    expect(toast?.message).toContain('CPF e RG');
    expect(toast?.position).toBe('bottom-center');
    expect(toast?.duration).toBe(0);
    expect(toast?.actions?.map(action => action.label)).toEqual([
      'Editar CPF e RG',
      'Manter assim',
    ]);

    toast?.actions?.[0].onClick();
    fixture.detectChanges();
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="cpf"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('[formcontrolname="rg"] input')?.disabled).toBe(false);
  });

  it('mantém documentos vazios e salva os demais dados sem enviá-los', async () => {
    await createComponent({
      usuario: { ...usuario, cpf: null, rg: null },
    });
    const component = fixture.componentInstance;
    component.form.controls.telefone.setValue('(21) 98888-7777');
    component.salvar();

    const actions = TestBed.inject(ToastService).toasts().find(record => record.type === 'warning')?.actions;
    actions?.[1].onClick();

    expect(service.atualizarUsuario).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ telefone: '(21) 98888-7777' }),
    );
    const payload = service.atualizarUsuario.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('cpf');
    expect(payload).not.toHaveProperty('rg');
    expect(payload).not.toHaveProperty('ehCin');
    expect(component.successMessage()).toContain('atualizados com sucesso');
  });

  it('permite editar CPF ausente sem exigir RG para usuário com CIN', async () => {
    await createComponent({
      usuario: { ...usuario, cpf: null, rg: null, ehCin: true },
    });
    const component = fixture.componentInstance;
    component.salvar();

    const actions = TestBed.inject(ToastService).toasts().find(record => record.type === 'warning')?.actions;
    expect(actions?.map(action => action.label)).toEqual(['Editar CPF', 'Manter assim']);
    actions?.[0].onClick();
    fixture.detectChanges();

    expect(component.cpfEditable()).toBe(true);
    expect(component.rgEditable()).toBe(false);
  });

  it('envia CPF e RG preenchidos após escolher editá-los', async () => {
    await createComponent({
      usuario: { ...usuario, cpf: null, rg: null },
    });
    const component = fixture.componentInstance;
    component.salvar();
    const actions = TestBed.inject(ToastService).toasts().find(record => record.type === 'warning')?.actions;
    actions?.[0].onClick();

    component.form.controls.cpf.setValue('52998224725');
    component.form.controls.rg.setValue('987654321');
    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ cpf: '52998224725', rg: '987654321' }),
    );
    expect(service.atualizarUsuario.mock.calls[0][1]).not.toHaveProperty('ehCin');
  });

  it('não atualiza o avatar da sessão ao salvar a foto de outra pessoa', async () => {
    await createComponent();
    const auth = TestBed.inject(AuthService);
    auth.user.set({
      id: 'session-user',
      nome: 'Bia',
      email: 'bia@example.com',
      cargo: { id: 'cargo-1', nome: 'Administrador', role: 'ADM' },
    });

    const file = new File(['image'], 'other.webp', { type: 'image/webp' });
    service.enviarFoto.mockReturnValue(of(usuario));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:other-preview');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    fixture.componentInstance.selecionarFoto({ target: input } as unknown as Event);

    expect(service.enviarFoto).not.toHaveBeenCalled();
    fixture.componentInstance.salvar();

    expect(service.enviarFoto).toHaveBeenCalledWith(usuario.id, file);
    expect(userAvatar.reloadCurrentUserPhoto).not.toHaveBeenCalled();
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('repete somente o upload quando os dados foram salvos e a foto falhou', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.atualizarUsuario.mockReturnValueOnce(of({ ...usuario, telefone: '21999999999' }));
    service.enviarFoto
      .mockReturnValueOnce(throwError(() => new Error('upload failed')))
      .mockReturnValueOnce(of(usuario));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21999999999');

    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledOnce();
    expect(service.enviarFoto).toHaveBeenCalledOnce();
    expect(component.pendingPhoto()).toBe(file);
    expect(component.errorMessage()).toContain('Os dados foram salvos, mas a foto');
    expect(component.redirecting()).toBe(false);
    expect(component.saving()).toBe(false);

    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledOnce();
    expect(service.enviarFoto).toHaveBeenCalledTimes(2);
    expect(component.pendingPhoto()).toBeNull();
    expect(component.redirecting()).toBe(true);
  });

  it('não envia a foto se a atualização dos dados falhar', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    service.atualizarUsuario.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    service.enviarFoto.mockReturnValueOnce(of(usuario));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);
    component.enablePersonalInfoEditing();
    component.form.controls.telefone.setValue('21999999999');

    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledOnce();
    expect(service.enviarFoto).not.toHaveBeenCalled();
    expect(component.pendingPhoto()).toBe(file);
    expect(component.form.controls.telefone.value).toBe('21999999999');
    expect(component.saving()).toBe(false);
    expect(component.redirecting()).toBe(false);
  });

  it('envia somente a última prévia escolhida após salvar e libera a anterior', async () => {
    await createComponent();
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
    };

    select(fileA);
    select(fileB);
    select();
    fixture.detectChanges();
    expect(component.pendingPhoto()).toBe(fileB);
    expect(component.fotoAtual()).toBe('blob:photo-b');
    expect(revokeSpy).toHaveBeenCalledWith('blob:photo-a');
    expect(service.enviarFoto).not.toHaveBeenCalled();

    service.enviarFoto.mockReturnValueOnce(of(usuario));
    component.salvar();

    expect(service.enviarFoto).toHaveBeenCalledWith(usuario.id, fileB);
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('descarta a foto pendente ao cancelar e bloqueia foto se os dados estiverem inválidos', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const file = new File(['image'], 'profile.webp', { type: 'image/webp' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pending-photo');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    component.selecionarFoto({ target: input } as unknown as Event);
    component.enablePersonalInfoEditing();
    component.form.controls.nome.setValue('');
    component.salvar();

    expect(service.atualizarUsuario).not.toHaveBeenCalled();
    expect(service.enviarFoto).not.toHaveBeenCalled();
    expect(component.pendingPhoto()).toBe(file);

    component.cancel();
    fixture.detectChanges();

    expect(component.pendingPhoto()).toBeNull();
    expect(component.fotoAtual()).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('blob:pending-photo');
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
    expect(service.enviarFoto).not.toHaveBeenCalled();
  });

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
    expect(component.form.controls.responsavelNome.value).toBe('Maria Silva');
    expect(component.form.controls.responsavelTelefone.value).toBe('11988887777');
    expect(component.form.controls.responsavelEmail.value).toBe('maria@example.com');
    expect(page.querySelector<HTMLInputElement>('.responsible-card [formcontrolname="responsavelNome"] input')?.value)
      .toBe('Maria Silva');
    expect(page.querySelector<HTMLInputElement>('.responsible-card [formcontrolname="responsavelTelefone"] input')?.value)
      .toBe('(11) 98888-7777');
    expect(page.querySelector<HTMLInputElement>('.responsible-card [formcontrolname="responsavelEmail"] input')?.value)
      .toBe('maria@example.com');
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
        '.personal-card app-primary-input[formcontrolname], .personal-card app-primary-select[formcontrolname], .personal-card app-primary-textarea[formcontrolname]',
      ).length,
    ).toBe(7);
    expect(
      [...page.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '.cards-grid app-primary-input[formcontrolname] input, .cards-grid app-primary-select[formcontrolname] select, .cards-grid app-primary-textarea[formcontrolname] textarea',
      )].every(control => control.disabled),
    ).toBe(true);
    expect(component.nomeResumo).toBe(component.form.controls.nome);
    const cepIds = [...page.querySelectorAll<HTMLInputElement>(
      '.personal-card [formcontrolname="cep"] input, .address-card [formcontrolname="cep"] input',
    )].map(input => input.id);
    expect(cepIds).toHaveLength(1);
    expect(new Set(cepIds).size).toBe(1);
    expect(service.consultarCep).not.toHaveBeenCalled();
  });

  it('reflete o nome do controle pessoal no resumo sem liberar os campos protegidos', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    component.enablePersonalInfoEditing();
    component.form.controls.nome.setValue('Ana atualizada');
    fixture.detectChanges();

    expect(page.querySelector<HTMLInputElement>('.user-summary input[autocomplete="name"]')?.value)
      .toBe('Ana atualizada');
    expect(page.querySelector<HTMLInputElement>('.user-summary input[type="email"]')?.disabled)
      .toBe(true);
    expect(page.querySelector<HTMLInputElement>('.personal-card [formcontrolname="cpf"] input')?.disabled)
      .toBe(true);
    expect(page.querySelector<HTMLInputElement>('.user-summary input[type="password"]')?.disabled).toBe(true);
    expect(page.querySelector('.role-label')?.textContent?.trim()).toBe('Administrador');
  });

  it('não inventa dados para usuário sem responsável', async () => {
    await createComponent({
      usuario: {
        ...usuario,
        responsavelNome: null,
        responsavelTelefone: null,
        responsavelEmail: null,
      },
    });

    const component = fixture.componentInstance;
    expect(component.form.controls.responsavelNome.value).toBe('');
    expect(component.form.controls.responsavelTelefone.value).toBe('');
    expect(component.form.controls.responsavelEmail.value).toBe('');
    expect(component.form.controls.responsavelEmail.valid).toBe(true);
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('valida o e-mail do responsável e preserva o texto inválido sem enviar', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enableResponsibleInfoEditing();
    component.form.controls.responsavelEmail.setValue('email-invalido');

    component.salvar();

    expect(service.atualizarUsuario).not.toHaveBeenCalled();
    expect(component.form.controls.responsavelEmail.value).toBe('email-invalido');
    expect(component.errorMessage()).toContain('e-mail válido');
  });

  it('salva somente os dados do responsável que foram alterados', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    component.enableResponsibleInfoEditing();
    component.form.controls.responsavelTelefone.setValue('(21) 98888-7777');

    component.salvar();

    expect(service.atualizarUsuario).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ responsavelTelefone: '(21) 98888-7777' }),
    );
    const payload = service.atualizarUsuario.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('responsavelNome');
    expect(payload).not.toHaveProperty('responsavelEmail');
    expect(payload).not.toHaveProperty('responsavelCpf');
    expect(component.successMessage()).toContain('atualizados com sucesso');
  });

  it('cancela a consulta anterior e só preenche o endereço do CEP atual', async () => {
    await createComponent();
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

  it('permite tentar novamente após falha e orienta quando o CEP é inexistente', async () => {
    await createComponent();
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

  it('mantém o CEP exibido sincronizado com o endereço consultado', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;

    component.enableAddressEditing();
    component.form.controls.cep.setValue('20000000');
    fixture.detectChanges();

    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="cep"] input')?.value)
      .toBe('20000-000');
    expect(service.consultarCep).toHaveBeenCalledWith('20000000');
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
    expect(page.querySelector<HTMLInputElement>('.user-summary input[autocomplete="name"]')?.value)
      .toBe('Perfil Administrativo de Teste');
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
        telefone: '(21) 98765-4321',
        doencasAlergias: null,
      }),
    );
    const payload = service.atualizarUsuario.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('senha');
    expect(payload).not.toHaveProperty('dataExpiracao');
    expect(payload).not.toHaveProperty('responsavelNome');
    expect(payload).not.toHaveProperty('endereco');
    expect(payload).not.toHaveProperty('cpf');
    expect(payload).not.toHaveProperty('rg');
    expect(payload).not.toHaveProperty('ehCin');
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
        dataNascimento: '2005-04-15',
        telefone: '(11) 91234-5678',
      }),
    );
    expect(service.atualizarUsuario.mock.calls[0][1]).not.toHaveProperty('rg');
    expect(service.atualizarUsuario.mock.calls[0][1]).not.toHaveProperty('ehCin');
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
    component.enableAddressEditing();
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
    page.querySelector<HTMLButtonElement>('.personal-card .card-footer button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.personalInfoInactive()).toBe(false);
    expect(fixture.componentInstance.responsibleInfoInactive()).toBe(true);
    expect(fixture.componentInstance.addressInfoInactive()).toBe(true);
    expectRenderedProfile(page);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="street-address"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('input[autocomplete="address-level3"]')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('.personal-card input[autocomplete="name"]')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.personal-card [formcontrolname="cpf"] input')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('.responsible-card [formcontrolname="responsavelNome"] input')?.disabled).toBe(true);
  });

  it('habilita somente a seção de responsável e preserva os valores das outras seções', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    component.form.controls.nome.setValue('Nome mantido durante edição');

    page.querySelector<HTMLButtonElement>('.responsible-card .card-footer button')?.click();
    fixture.detectChanges();

    expect(component.personalInfoInactive()).toBe(true);
    expect(component.responsibleInfoInactive()).toBe(false);
    expect(component.addressInfoInactive()).toBe(true);
    expect(component.form.controls.nome.value).toBe('Nome mantido durante edição');
    expect(page.querySelector<HTMLInputElement>('.responsible-card [formcontrolname="responsavelNome"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.personal-card [formcontrolname="nome"] input')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="cep"] input')?.disabled).toBe(true);
  });

  it('habilita somente a seção de endereço, mantendo CEP editável e campos derivados bloqueados', async () => {
    await createComponent();
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('.address-card .card-footer button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.personalInfoInactive()).toBe(true);
    expect(fixture.componentInstance.responsibleInfoInactive()).toBe(true);
    expect(fixture.componentInstance.addressInfoInactive()).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="cep"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="numero"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="complemento"] input')?.disabled).toBe(false);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="logradouro"] input')?.disabled).toBe(true);
    expect(page.querySelector<HTMLInputElement>('.address-card [formcontrolname="bairro"] input')?.disabled).toBe(true);
  });

  it('abre credenciais no botão superior sem habilitar cartões nem enviar o formulário', async () => {
    await createComponent();
    const component = fixture.componentInstance;
    const page = fixture.nativeElement as HTMLElement;
    const button = page.querySelector<HTMLButtonElement>('.summary-actions button');

    expect(button?.textContent?.trim()).toBe('Editar credenciais');
    expect(button?.type).toBe('button');
    expect(page.querySelectorAll('.card-footer button')).toHaveLength(3);

    button?.click();
    fixture.detectChanges();

    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar senha');
    expect(page.querySelector('.password-button')).toBeNull();
    expect(component.personalInfoInactive()).toBe(true);
    expect(component.responsibleInfoInactive()).toBe(true);
    expect(component.addressInfoInactive()).toBe(true);
    expect(service.atualizarUsuario).not.toHaveBeenCalled();
  });

  it('não habilita seções nem abre credenciais durante salvamento', async () => {
    await createComponent();
    const component = fixture.componentInstance;

    component.saving.set(true);
    component.enablePersonalInfoEditing();
    component.enableResponsibleInfoEditing();
    component.enableAddressEditing();
    component.openPasswordModal();

    expect(component.personalInfoInactive()).toBe(true);
    expect(component.responsibleInfoInactive()).toBe(true);
    expect(component.addressInfoInactive()).toBe(true);
    expect(component.passwordModalOpen()).toBe(false);
  });

  it('mantém vazios apenas os campos ausentes ou nulos, sem inventar endereço', async () => {
    await createComponent({
      usuario: {
        ...usuario,
        cpf: null,
        rg: null,
        dataNascimento: null,
        telefone: null,
        responsavelNome: null,
        responsavelTelefone: null,
        responsavelEmail: null,
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
      component.form.controls.responsavelNome,
      component.form.controls.responsavelTelefone,
      component.form.controls.responsavelEmail,
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
    page.querySelector<HTMLButtonElement>('.summary-actions button')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="dialog"]')?.textContent).toContain('Alterar senha');

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');
    page.querySelector<HTMLButtonElement>('.cancel-button')?.click();
    expect(navigateSpy).toHaveBeenCalledWith(['/desbravadores']);
  });
});
