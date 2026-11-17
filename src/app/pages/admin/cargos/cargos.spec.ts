import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api';
import { AuthService } from '../../../core/services/auth';
import { PermissoesService } from '../../../core/services/permissoes';
import { Cargo, Cargos } from './cargos';

describe('Cargos', () => {
  const cargo: Cargo = {
    id: 'cargo', role: 'AUXSEC', nome: 'Auxiliar', descricao: 'Auxiliar de secretaria',
    ativo: true, sistemaProtegido: false, versao: 1,
  };
  const api = { get: vi.fn(), put: vi.fn(), post: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [Cargos],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: PermissoesService, useValue: { tem: () => true, atualizar: () => of(null) } },
        { provide: AuthService, useValue: {
          comCsrf: (enviar: (headers: Record<string, string>) => Observable<unknown>) =>
            enviar({ 'X-CSRF-TOKEN': 'teste' }),
        } },
      ],
    });
  });

  it('envia o conjunto inteiro com a versão lida e exige recarga após 409', () => {
    api.get.mockReturnValue(of({ versao: 7, permissoes: ['membros.consultar'] }));
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { title: 'Versão obsoleta.', versaoAtual: 8 },
    })));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'permissoes', cargo });
    tela.alternar('eventos.consultar', 'eventos.consultar', true);
    expect(tela.adicionadas()).toEqual(['eventos.consultar']);
    tela.confirmando = true;
    tela.motivo = 'Acesso de consulta';
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.put).toHaveBeenCalledWith('/Cargos/cargo/Permissoes', {
      versao: 7, permissoes: ['membros.consultar', 'eventos.consultar'],
      motivo: 'Acesso de consulta', senhaAtualSolicitante: 'segredo',
    }, { headers: { 'X-CSRF-TOKEN': 'teste' } });
    expect(tela.senha).toBe('');
    expect(tela.conflito()).toBe(true);
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.put).toHaveBeenCalledTimes(1);
    api.get.mockReturnValue(of({ versao: 8, permissoes: [] }));
    tela.recarregar();
    expect([...tela.selecao().keys()]).toEqual([]);
    expect(tela.conflito()).toBe(false);
  });
  it.each([
    [0, 'tentar', 'Falha de conexão'],
    [401, 'login', 'Sessão expirada'],
    [403, 'fechar', 'não tem permissão'],
    [404, 'lista', 'Cargo não encontrado'],
    [409, 'tentar', 'Não foi possível carregar'],
  ])('trata HTTP %s na leitura sem marcar conflito ou permitir escrita', (status, acao, mensagem) => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'permissoes', cargo });
    expect(tela.falhaCarga()).toEqual({ acao, mensagem: expect.stringContaining(mensagem) });
    expect(tela.conflito()).toBe(false);
    Object.assign(tela, { confirmando: true, motivo: 'Teste', senha: 'segredo' });
    tela.salvar();
    expect(api.put).not.toHaveBeenCalled();

    if (acao === 'tentar') {
      api.get.mockReturnValue(of({ versao: 2, permissoes: ['eventos.consultar'] }));
      tela.recarregar();
      expect(tela.falhaCarga()).toBeNull();
      expect(tela.selecao().has('eventos.consultar')).toBe(true);
    }
  });

  it('impede escrita sem capacidade mesmo com confirmação preenchida', () => {
    TestBed.overrideProvider(PermissoesService, { useValue: { tem: () => false } });
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'criar' });
    tela.role = 'AUXSEC';
    tela.nome = 'Auxiliar';
    tela.descricao = 'Consulta';
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it.each(['motivo', 'senha'] as const)('exige %s antes de enviar', campo => {
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'editar', cargo });
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela[campo] = '';
    tela.salvar();
    expect(api.put).not.toHaveBeenCalled();
  });

  it.each(['criar', 'editar', 'situacao'] as const)('envia %s e limpa a senha no sucesso', tipo => {
    api.get.mockReturnValue(of([]));
    api.post.mockReturnValue(of(cargo));
    api.put.mockReturnValue(of(cargo));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir(tipo === 'criar' ? { tipo } : { tipo, cargo });
    tela.role = 'auxsec';
    tela.nome = 'Auxiliar';
    tela.descricao = 'Consulta';
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela.salvar();
    expect(tela.senha).toBe('');
    expect(tela.editor()).toBeNull();
    if (tipo === 'editar') {
      expect(api.put.mock.calls[0][1]).toEqual({
        nome: 'Auxiliar', descricao: 'Consulta', versao: 1,
        motivo: 'Teste', senhaAtualSolicitante: 'segredo',
      });
    } else {
      expect(api.post.mock.calls[0][0]).toBe(tipo === 'criar' ? '/Cargos' : '/Cargos/cargo/Desativar');
      if (tipo === 'criar') expect(api.post.mock.calls[0][1].role).toBe('AUXSEC');
    }
  });

  it('mostra duplicidade no campo e limpa a senha após erro', () => {
    api.post.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { errors: { role: ['Role em uso.'] } },
    })));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'criar' });
    Object.assign(tela, { role: 'AUXSEC', nome: 'Auxiliar', descricao: 'Consulta', motivo: 'Teste', senha: 'segredo' });
    tela.salvar();
    expect(tela.erroRole()).toBe('Role em uso.');
    expect(tela.senha).toBe('');
  });

  it('bloqueia desativação do protegido e permite reativar cargo inativo', () => {
    api.get.mockReturnValue(of([]));
    api.post.mockReturnValue(of(cargo));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'situacao', cargo: { ...cargo, sistemaProtegido: true } });
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.post).not.toHaveBeenCalled();
    tela.abrir({ tipo: 'situacao', cargo: { ...cargo, ativo: false } });
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.post.mock.calls[0][0]).toBe('/Cargos/cargo/Reativar');
  });

  it('resume e substitui regras completas, bloqueando 409 até recarregar', () => {
    TestBed.overrideProvider(PermissoesService, { useValue: {
      tem: () => true, cargo: () => ({ id: 'cargo' }), atualizar: () => of(null),
    } });
    api.get.mockReturnValue(of({ versao: 9, regras: [
      { permissao: 'usuarios.criar', cargoAlvoId: 'alvo', cargoAlvoRole: 'AUXSEC' },
    ] }));
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { versaoAtual: 10 },
    })));
    const tela = TestBed.createComponent(Cargos).componentInstance;
    tela.abrir({ tipo: 'regras', cargo });
    tela.alternar('usuarios.criar:alvo', 'usuarios.criar → AUXSEC', false);
    tela.alternar('usuarios.editar:alvo', 'usuarios.editar → AUXSEC', true);
    expect(tela.removidas()).toEqual(['usuarios.criar → AUXSEC']);
    expect(tela.adicionadas()).toEqual(['usuarios.editar → AUXSEC']);
    tela.confirmando = true;
    tela.motivo = 'Teste';
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.put.mock.calls[0][1]).toEqual({
      versao: 9, regras: [{ permissao: 'usuarios.editar', cargoAlvoId: 'alvo' }],
      motivo: 'Teste', senhaAtualSolicitante: 'segredo',
    });
    expect(tela.senha).toBe('');
    tela.senha = 'segredo';
    tela.salvar();
    expect(api.put).toHaveBeenCalledTimes(1);
    api.get.mockReturnValue(of({ versao: 10, regras: [] }));
    tela.recarregar();
    expect(tela.conflito()).toBe(false);
    expect(tela.selecao().size).toBe(0);
  });
});
