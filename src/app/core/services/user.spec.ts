import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { User } from './user';

/** Verifica o contrato de /api/Usuarios e /api/Cargos (UsuariosController/CargosController do backend). */
describe('User', () => {
  let service: User;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(User);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista somente os ativos por padrão (sem query string)', () => {
    service.listarUsuarios().subscribe();

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Usuarios');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('inclui inativos com includeInactive=true', () => {
    service.listarUsuarios({ includeInactive: true }).subscribe();

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Usuarios');
    expect(req.request.params.get('includeInactive')).toBe('true');
    req.flush([]);
  });

  it('cadastra com POST /api/Usuarios enviando somente o corpo informado', () => {
    const payload = {
      nome: 'Ana',
      email: 'ana@example.com',
      senha: 'Kx9#pLm2@vQz',
      cargoId: 'c1',
      cpf: '529.982.247-25',
      ehCin: false,
      rg: '12.345.678-9',
      tipoSanguineo: 'O+',
      doencasAlergias: 'Alergia a amendoim',
    };
    let criado: unknown;
    service.criarUsuario(payload).subscribe(u => (criado = u));

    const req = http.expectOne(r => r.method === 'POST' && r.url === '/api/Usuarios');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'u1', nome: 'Ana' }, { status: 201, statusText: 'Created' });
    expect(criado).toEqual({ id: 'u1', nome: 'Ana' });
  });

  it('altera com PUT /api/Usuarios/{id} sem senha', () => {
    service.atualizarUsuario('u1', {
      nome: 'Ana',
      email: 'ana@example.com',
      cargoId: 'c2',
      cpf: '529.982.247-25',
      rg: '12.345.678-9',
      ehCin: false,
      tipoSanguineo: null,
      doencasAlergias: null,
    }).subscribe();

    const req = http.expectOne(r => r.method === 'PUT' && r.url === '/api/Usuarios/u1');
    expect(req.request.body).toEqual({
      nome: 'Ana',
      email: 'ana@example.com',
      cargoId: 'c2',
      cpf: '529.982.247-25',
      rg: '12.345.678-9',
      ehCin: false,
      tipoSanguineo: null,
      doencasAlergias: null,
    });
    req.flush({ id: 'u1' });
  });

  it('envia foto como multipart no campo arquivo sem definir Content-Type', () => {
    const arquivo = new File(['foto'], 'perfil.webp', { type: 'image/webp' });
    let usuario: unknown;
    service.enviarFoto('u/1', arquivo).subscribe(resultado => (usuario = resultado));

    const req = http.expectOne(r => r.method === 'PUT' && r.url === '/api/Usuarios/u%2F1/foto');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('arquivo')).toBe(arquivo);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush({ id: 'u/1', nome: 'Ana', fotoUrl: '/api/Usuarios/u%2F1/foto' });
    expect(usuario).toEqual({ id: 'u/1', nome: 'Ana', fotoUrl: '/api/Usuarios/u%2F1/foto' });
  });

  it('obtém a foto como blob pelo GET autenticável', () => {
    let foto: Blob | undefined;
    service.obterFoto('u1').subscribe(resultado => (foto = resultado));

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Usuarios/u1/foto');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['imagem'], { type: 'image/webp' }));
    expect(foto).toBeInstanceOf(Blob);
  });

  it('resolve fotoUrl pelo proxy /api e busca a imagem como blob', () => {
    let foto: Blob | undefined;
    service.obterFotoPorUrl('https://desbravadores-gestao.onrender.com/api/Usuarios/u1/foto?versao=2')
      .subscribe(resultado => (foto = resultado));

    const req = http.expectOne(r => r.method === 'GET' && r.urlWithParams === '/api/Usuarios/u1/foto?versao=2');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['imagem'], { type: 'image/webp' }));
    expect(foto).toBeInstanceOf(Blob);
  });

  it('exclui (logicamente) com DELETE /api/Usuarios/{id} sem corpo', () => {
    let concluido = false;
    service.excluirUsuario('u1').subscribe(() => (concluido = true));

    const req = http.expectOne(r => r.method === 'DELETE' && r.url === '/api/Usuarios/u1');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(concluido).toBe(true);
  });

  it('carrega os cargos de GET /api/Cargos', () => {
    let cargos: unknown;
    service.listarCargos().subscribe(c => (cargos = c));

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Cargos');
    req.flush([{ id: 'c1', nome: 'Diretor', descricao: '', ativo: true, role: 'DIR' }]);
    expect(cargos).toEqual([{ id: 'c1', nome: 'Diretor', descricao: '', ativo: true, role: 'DIR' }]);
  });

  it('consulta CEP em GET /api/Cep/{cep}', () => {
    let endereco: unknown;
    service.consultarCep('01001000').subscribe(resultado => (endereco = resultado));

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Cep/01001000');
    req.flush({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', uf: 'SP' });
    expect(endereco).toEqual({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', uf: 'SP' });
  });

  it('usa ViaCEP quando a rota interna de consulta não está disponível', () => {
    let endereco: unknown;
    service.consultarCep('01001000').subscribe(resultado => (endereco = resultado));

    http.expectOne('/api/Cep/01001000').flush({}, { status: 404, statusText: 'Not Found' });

    const req = http.expectOne('https://viacep.com.br/ws/01001000/json/');
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(false);
    req.flush({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', uf: 'SP' });

    expect(endereco).toEqual({
      cep: '01001-000',
      logradouro: 'Praça da Sé',
      bairro: 'Sé',
      uf: 'SP',
    });
  });

  it('não usa ViaCEP para erros de autenticação da API', () => {
    let erro: unknown;
    service.consultarCep('01001000').subscribe({ error: resultado => (erro = resultado) });

    http.expectOne('/api/Cep/01001000').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(erro).toBeInstanceOf(HttpErrorResponse);
    http.expectNone('https://viacep.com.br/ws/01001000/json/');
  });
});
