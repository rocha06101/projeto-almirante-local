import { TestBed } from '@angular/core/testing';
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
    const payload = { nome: 'Ana', email: 'ana@example.com', senha: 'Kx9#pLm2@vQz', cargoId: 'c1' };
    let criado: unknown;
    service.criarUsuario(payload).subscribe(u => (criado = u));

    const req = http.expectOne(r => r.method === 'POST' && r.url === '/api/Usuarios');
    expect(req.request.body).toEqual(payload);
    req.flush({ id: 'u1', nome: 'Ana' }, { status: 201, statusText: 'Created' });
    expect(criado).toEqual({ id: 'u1', nome: 'Ana' });
  });

  it('altera com PUT /api/Usuarios/{id} sem senha', () => {
    service.atualizarUsuario('u1', { nome: 'Ana', email: 'ana@example.com', cargoId: 'c2' }).subscribe();

    const req = http.expectOne(r => r.method === 'PUT' && r.url === '/api/Usuarios/u1');
    expect(req.request.body).toEqual({ nome: 'Ana', email: 'ana@example.com', cargoId: 'c2' });
    req.flush({ id: 'u1' });
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
});
