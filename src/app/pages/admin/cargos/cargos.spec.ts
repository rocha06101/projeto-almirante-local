import { HttpErrorResponse } from '@angular/common/http';
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
});
