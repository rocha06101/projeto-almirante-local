import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventoParticipante, MinhaDevolucao } from '../../../core/models/evento.model';
import { MeusEventos } from './meus-eventos';

describe('MeusEventos', () => {
  let fixture: ComponentFixture<MeusEventos>;
  let http: HttpTestingController;
  let page: HTMLElement;
  const evento: EventoParticipante = {
    id: 'evento-1',
    titulo: 'Acampamento',
    descricao: null,
    dataEvento: '2026-11-25',
    local: 'Sede',
    transporte: { valor: 0, ehGratis: true },
    alimentacao: { individual: true, valor: 0 },
    seguroObrigatorio: 0,
    valorPorMembro: 0,
    minhaCobranca: null,
  };
  const pendente: MinhaDevolucao = { valor: 20, vencimento: '2026-11-25', status: 'Pendente' };
  const texto = (elemento: Element) => elemento.textContent.replace(/\s+/g, ' ').trim();
  const registros = () => [...page.querySelectorAll('.devolucoes li')].map(texto);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MeusEventos],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MeusEventos);
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function responder(...items: EventoParticipante[]): void {
    const request = http.expectOne({ method: 'GET', url: '/api/Me/Eventos' });
    expect(request.request.body).toBeNull();
    request.flush({ items });
    fixture.detectChanges();
  }

  it.each([[undefined], [null], [[]]])('omite a seção de devoluções quando a lista é %j', minhasDevolucoes => {
    responder(minhasDevolucoes === undefined ? evento : { ...evento, minhasDevolucoes });
    expect(texto(page)).toContain('Acampamento');
    expect(texto(page)).not.toContain('Devoluções');
  });

  it('mostra a devolução pendente com seu valor esperado e sem dados de baixa', () => {
    responder({ ...evento, minhasDevolucoes: [pendente] });
    expect(registros()).toHaveLength(1);
    expect(registros()[0]).toContain('Pendente');
    expect(registros()[0]).toContain('Valor esperadoR$ 20,00');
    expect(registros()[0]).not.toMatch(/Valor devolvido|Data da devolução|Paga/);
    expect([...page.querySelectorAll('button')].map(texto)).toEqual(['Atualizar']);
  });

  it.each([20, 12.5])('mostra o pagamento de %s com status oficial Pago', valorDevolvido => {
    responder({ ...evento, minhasDevolucoes: [{
      ...pendente, status: 'Pago', valorDevolvido, dataDevolucao: '2026-11-24',
      justificativa: 'Diferença registrada pela tesouraria.',
    }] });
    expect(registros()[0]).toContain('Paga');
    expect(registros()[0]).toContain('Valor esperadoR$ 20,00');
    expect(registros()[0]).toContain(valorDevolvido === 20 ? 'R$ 20,00' : 'R$ 12,50');
    expect(registros()[0]).toContain('24 de novembro de 2026');
    expect(registros()[0]).toContain('Diferença registrada pela tesouraria.');
    expect(page.querySelector('.estado.paga')).not.toBeNull();
  });

  it('preserva a ordem e a quantidade quando há devoluções com valores e vencimentos iguais', () => {
    const paga: MinhaDevolucao = {
      ...pendente, status: 'Pago', valorDevolvido: null, dataDevolucao: null, justificativa: null,
    };
    responder({ ...evento, minhasDevolucoes: [pendente, { ...pendente }, paga] });
    expect(registros()).toHaveLength(3);
    expect(registros()[0]).toBe(registros()[1]);
    expect(registros()[2]).toContain('Paga');
    expect(registros()[2]).not.toMatch(/Valor devolvido|Data da devolução|Justificativa|null|undefined/);
  });

  it('exibe carregamento e erro e aceita nova consulta vazia', () => {
    expect(texto(page)).toContain('Carregando seus eventos');
    const atualizar = page.querySelector('button')!;
    expect(atualizar.disabled).toBe(true);
    http.expectOne('/api/Me/Eventos').flush(null, { status: 503, statusText: 'Indisponível' });
    fixture.detectChanges();
    expect(texto(page.querySelector('[role="alert"]')!)).toContain('Não foi possível');
    atualizar.click();
    responder();
    expect(texto(page)).toContain('Você ainda não participa de nenhum evento.');
  });

  it('substitui os dados financeiros ao sincronizar', () => {
    responder({ ...evento, minhasDevolucoes: [pendente] });
    page.querySelector('button')!.click();
    responder({ ...evento, minhasDevolucoes: [{ ...pendente, status: 'Pago', valorDevolvido: 15 }] });
    expect(registros()).toHaveLength(1);
    expect(registros()[0]).toContain('R$ 15,00');
    expect(registros()[0]).not.toContain('Pendente');
  });
});
