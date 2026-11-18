import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, Input, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, distinctUntilChanged, finalize, of, switchMap } from 'rxjs';
import { CriarEvento, EditarEvento, EventoDto } from '../../../core/models/evento.model';
import { MembroResumo } from '../../../core/models/user.model';
import { EventosService } from '../../../core/services/eventos';
import { PermissoesService } from '../../../core/services/permissoes';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/services/user';
import { temPagamentos, erroEvento, motivoValido, nomeEvento, podeRemoverMembro, respostaIncerta } from '../eventos.utils';

type GrupoParticipantes = 'desbravadores' | 'diretoria' | 'todos';
const ROLE_DESBRAVADOR = 'DS';
// Caracteres graváveis nas colunas varchar do backend, incluindo as extensões do Windows-1252.
const TEXTO_EVENTO = /^[\r\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/u;

@Component({
  selector: 'app-evento-formulario', imports: [FormsModule, CurrencyPipe],
  templateUrl: './evento-formulario.html', styleUrl: './evento-formulario.scss',
})
export class EventoFormulario implements OnInit {
  @Input() evento: EventoDto | null = null;
  @Input() data = '';
  @Input() dataMinima = '';
  @Input() grupoCompartilhado = false;
  readonly salvo = output<EventoDto>();
  readonly cancelar = output<void>();
  readonly recarregar = output<void>();
  readonly falhaEdicao = output<'incerta' | 'conflito'>();
  readonly ocupacao = output<boolean>();
  readonly api = inject(EventosService);
  readonly acesso = inject(PermissoesService);
  private readonly usuarios = inject(User);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datas = new Subject<string>();
  readonly membros = signal<MembroResumo[]>([]);
  readonly grupos = [
    { id: 'desbravadores', nome: 'Desbravadores' },
    { id: 'diretoria', nome: 'Diretoria' },
    { id: 'todos', nome: 'Todos' },
  ] as const;
  readonly idsPorGrupo = computed(() => {
    const desbravadores: string[] = [];
    const diretoria: string[] = [];
    for (const membro of this.membros()) {
      const role = membro.role?.trim().toUpperCase();
      if (!role) continue;
      (role === ROLE_DESBRAVADOR ? desbravadores : diretoria).push(membro.id);
    }
    return { desbravadores, diretoria, todos: [...desbravadores, ...diretoria] };
  });
  private readonly membrosExibidos = new Set<string>();
  readonly carregandoMembros = signal(false);
  readonly erroMembros = signal('');
  readonly feedbackSelecao = signal('');
  readonly referencias = signal<EventoDto[]>([]);
  readonly carregandoReferencias = signal(false);
  readonly erroReferencias = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly conflito = signal(false);
  readonly incerto = signal(false);
  readonly eventoExistenteId = signal('');
  readonly rejeitado = signal(false);
  readonly nomeEvento = nomeEvento;
  readonly tituloMaximo = 150;
  readonly descricaoMaxima = 2000;
  modelo: CriarEvento = {
    titulo: '', descricao: null, dataEvento: '', local: '', membros: [],
    transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 },
    seguroObrigatorio: 0, eventoReferenciaId: null,
  };
  seguroAtivo = false;
  motivo = '';
  busca = '';
  confirmando = false;
  confirmado = false;
  private estadoInicial = '';
  private estadoRevisado = '';

  ngOnInit(): void {
    const e = this.evento;
    const pendente = !e && this.api.cadastroPendente();
    this.modelo = pendente ? structuredClone(pendente.conteudo) : e ? {
      titulo: e.titulo ?? '', descricao: e.descricao ?? null,
      dataEvento: e.dataEvento, local: e.local, membros: [...new Set(e.membros)],
      transporte: { ...e.transporte }, alimentacao: { ...e.alimentacao }, seguroObrigatorio: e.seguroObrigatorio,
    } : { ...this.modelo, dataEvento: this.data };
    this.seguroAtivo = this.modelo.seguroObrigatorio > 0;
    this.estadoInicial = this.estadoEditavel();
    if (pendente) this.estadoRevisado = this.estadoEditavel();
    for (const id of this.modelo.membros) this.membrosExibidos.add(id);
    if (pendente) { this.confirmando = true; this.erro.set('Um cadastro aguarda confirmação. Reenvie a mesma operação para consultar o resultado com segurança.'); }
    this.carregarMembros();
    this.datas.pipe(distinctUntilChanged(), switchMap(data => {
      this.referencias.set([]); this.erroReferencias.set(''); this.carregandoReferencias.set(true);
      return this.api.listar({ dataInicial: data, dataFinal: data }).pipe(
        catchError(e => { this.erroReferencias.set(erroEvento(e)); return of(null); }),
        finalize(() => this.carregandoReferencias.set(false)),
      );
    }), takeUntilDestroyed(this.destroyRef)).subscribe(r => {
      if (r) { this.referencias.set(r.items); this.dataMinima = r.dataMinimaCadastro; }
    });
    if (!e && !pendente && this.modelo.dataEvento) this.datas.next(this.modelo.dataEvento);
  }
  private estadoEditavel(): string {
    return JSON.stringify({ ...this.modelo, descricao: this.modelo.descricao || null,
      eventoId: this.evento?.id, versao: this.evento?.versao, membros: [...this.modelo.membros].sort(), seguroAtivo: this.seguroAtivo, motivo: this.motivo });
  }
  temAlteracoes(): boolean { return this.estadoEditavel() !== this.estadoInicial; }
  carregarMembros(): void {
    if (!this.acesso.tem('membros.consultar')) {
      this.erroMembros.set('A consulta de participantes exige a permissão membros.consultar. Participantes atuais serão preservados.'); return;
    }
    this.carregandoMembros.set(true); this.erroMembros.set('');
    this.usuarios.listarMembros().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.carregandoMembros.set(false)))
      .subscribe({
        next: membros => this.membros.set([...new Map(membros.map(m => [m.id, m])).values()]),
        error: e => this.erroMembros.set(erroEvento(e)),
      });
  }
  mudarData(): void { this.modelo.eventoReferenciaId = null; if (!this.evento && this.modelo.dataEvento) this.datas.next(this.modelo.dataEvento); }
  referenciasCompativeis(): EventoDto[] {
    const normalizar = (local: string) => local.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    return this.referencias().filter(e => normalizar(e.local) === normalizar(this.modelo.local));
  }
  membrosVisiveis(): MembroResumo[] {
    const ids = new Set([...this.membrosExibidos, ...this.modelo.membros]);
    const conhecidos = this.membros().filter(m => ids.delete(m.id));
    const ausentes = [...ids].map(id => ({ id, nome: `Participante ${id}`, cargo: '', role: '' }));
    const busca = this.busca.trim().toLocaleLowerCase('pt-BR');
    return [...conhecidos, ...ausentes].filter(m => m.nome.toLocaleLowerCase('pt-BR').includes(busca));
  }
  estadoGrupo(grupo: GrupoParticipantes): 'vazio' | 'parcial' | 'completo' {
    const ids = this.idsPorGrupo()[grupo];
    const selecionados = new Set(this.modelo.membros);
    const quantidade = ids.filter(id => selecionados.has(id)).length;
    if (quantidade === 0) return 'vazio';
    return quantidade === ids.length ? 'completo' : 'parcial';
  }
  grupoMarcado(grupo: GrupoParticipantes, estado = this.estadoGrupo(grupo)): boolean {
    if (estado !== 'parcial') return estado === 'completo';
    const selecionados = new Set(this.modelo.membros);
    // Um grupo misto que não pode receber mais participantes ainda pode ser desmarcado.
    return !this.idsPorGrupo()[grupo].some(id => !selecionados.has(id) && this.podeAlterarMembro(id, true));
  }
  mudarSelecaoGrupo(grupo: GrupoParticipantes, caixa: HTMLInputElement): void {
    this.selecionarGrupo(grupo, caixa.checked);
    const estado = this.estadoGrupo(grupo);
    caixa.checked = this.grupoMarcado(grupo, estado);
    caixa.indeterminate = estado === 'parcial';
  }
  selecionarGrupo(grupo: GrupoParticipantes, marcado: boolean): void {
    if (!this.podeSelecionarMembros()) return;
    const selecionados = new Set(this.modelo.membros);
    let bloqueados = 0;
    for (const id of this.idsPorGrupo()[grupo]) {
      if (selecionados.has(id) !== marcado && !this.podeAlterarMembro(id, marcado)) {
        bloqueados++;
        continue;
      }
      if (marcado) {
        this.membrosExibidos.add(id);
        selecionados.add(id);
      } else {
        if (!this.evento?.membros.includes(id)) this.membrosExibidos.delete(id);
        selecionados.delete(id);
      }
    }
    this.modelo.membros = [...selecionados];
    this.feedbackSelecao.set(this.mensagemSelecao(bloqueados, marcado));
  }
  private mensagemSelecao(bloqueados: number, marcado: boolean): string {
    if (!bloqueados) return '';
    const pessoas = bloqueados === 1 ? '1 participante' : `${bloqueados} participantes`;
    const verbo = bloqueados === 1 ? 'não foi' : 'não foram';
    if (marcado) return `${pessoas} ${verbo} incluído${bloqueados === 1 ? '' : 's'} porque o evento já tem pagamentos registrados.`;
    return `${pessoas} ${verbo} removido${bloqueados === 1 ? '' : 's'} porque há pagamentos que exigem estorno concluído.`;
  }
  mudarSelecaoMembro(id: string, caixa: HTMLInputElement): void {
    this.selecionarMembro(id, caixa.checked);
    caixa.checked = this.modelo.membros.includes(id);
  }
  selecionarMembro(id: string, marcado: boolean): void {
    if (!this.podeSelecionarMembros()) return;
    if (!this.podeAlterarMembro(id, marcado)) {
      this.feedbackSelecao.set(this.mensagemSelecao(1, marcado));
      return;
    }
    this.feedbackSelecao.set('');
    this.membrosExibidos.add(id);
    this.modelo.membros = marcado ? [...new Set([...this.modelo.membros, id])] : this.modelo.membros.filter(m => m !== id);
  }
  podeSelecionarMembros(): boolean {
    return !this.salvando() && !this.confirmando && !this.incerto() && !this.conflito() &&
      this.podeSalvar() && this.acesso.tem('membros.consultar') &&
      !this.carregandoMembros() && !this.erroMembros();
  }
  temPagamentos(): boolean { return temPagamentos(this.evento); }
  podeAlterarMembro(id: string, marcado: boolean): boolean {
    return !this.motivoBloqueioMembro(id, marcado);
  }
  motivoBloqueioMembro(id: string, marcado: boolean): string {
    if (!this.evento) return '';
    if (marcado && this.temPagamentos() && !this.evento.membros.includes(id))
      return 'Inclusão bloqueada porque o evento já tem pagamentos registrados.';
    if (!marcado && !podeRemoverMembro(this.evento, id))
      return 'A remoção antes do evento exige que a tesouraria conclua o estorno.';
    return '';
  }
  exigeMotivo(): boolean { return this.removeMembros() || this.cancelaCobrancas() || this.reducaoComPagamento(); }
  reducaoComPagamento(): boolean {
    return this.temPagamentos() && Math.round(this.porMembro() * 100) < Math.round(this.evento!.valorPorMembro * 100);
  }
  componentes(): { nome: string; antes: number; depois: number }[] {
    const e = this.evento;
    return [
      { nome: 'Transporte', antes: e?.transporte.ehGratis ? 0 : e?.transporte.valor ?? 0, depois: this.modelo.transporte.ehGratis ? 0 : this.modelo.transporte.valor },
      { nome: 'Alimentação', antes: e?.alimentacao.individual ? 0 : e?.alimentacao.valor ?? 0, depois: this.modelo.alimentacao.individual ? 0 : this.modelo.alimentacao.valor },
      { nome: 'Seguro', antes: e?.seguroObrigatorio ?? 0, depois: this.valorSeguro() },
    ];
  }
  private erroRegrasEdicao(): string {
    const e = this.evento;
    if (!e) return '';
    if (this.grupoCompartilhado && (this.modelo.dataEvento !== e.dataEvento || this.modelo.local.trim() !== e.local))
      return 'Data e local são compartilhados com outros grupos e não podem ser alterados.';
    if (!this.temPagamentos()) return '';
    if (this.modelo.dataEvento !== e.dataEvento || this.modelo.membros.some(id => !e.membros.includes(id)))
      return 'Com pagamento registrado, não é possível alterar a data nem adicionar participantes.';
    const custoMudou = this.componentes().some(c => Math.round(c.antes * 100) !== Math.round(c.depois * 100)) ||
      this.modelo.transporte.ehGratis !== e.transporte.ehGratis || this.modelo.alimentacao.individual !== e.alimentacao.individual;
    if (custoMudou && !this.reducaoComPagamento())
      return 'Com pagamento registrado, o custo por participante precisa diminuir. Aumento ou troca de componentes mantendo o mesmo total não são permitidos.';
    if (e.membros.some(id => !this.modelo.membros.includes(id) && !podeRemoverMembro(e, id)))
      return 'Antes da data do evento, o participante pago só pode ser removido após o estorno concluído. Solicite o estorno nos detalhes e aguarde a baixa pela tesouraria.';
    return '';
  }
  removeMembros(): boolean { return !!this.evento?.membros.some(id => !this.modelo.membros.includes(id)); }
  cancelaCobrancas(): boolean {
    return !!this.evento?.lancamentos.some(l => l.status !== 'Pago') && this.evento.valorPorMembro > 0 && this.porMembro() === 0;
  }
  private valorSeguro(): number {
    return this.seguroAtivo ? this.modelo.seguroObrigatorio : 0;
  }
  porMembro(): number {
    return ((this.modelo.transporte.ehGratis ? 0 : Math.round(this.modelo.transporte.valor * 100)) +
      (this.modelo.alimentacao.individual ? 0 : Math.round(this.modelo.alimentacao.valor * 100)) + Math.round(this.valorSeguro() * 100)) / 100;
  }
  total(): number { return Math.round(this.porMembro() * 100) * this.modelo.membros.length / 100; }
  podeSalvar(): boolean { return this.acesso.tem(this.evento ? 'eventos.editar' : 'eventos.criar'); }
  private normalizarTextos() {
    return {
      titulo: this.modelo.titulo.trim().replace(/\s+/g, ' '),
      descricao: this.modelo.descricao?.replace(/\r\n?/g, '\n').trim() || null,
    };
  }
  revisar(): void {
    if (!this.podeSalvar() || this.salvando() || this.incerto() || this.conflito()) return;
    this.confirmando = false; this.confirmado = false; this.estadoRevisado = '';
    this.erro.set('');
    const { titulo, descricao } = this.normalizarTextos();
    if (!titulo || titulo.length > this.tituloMaximo) {
      this.erro.set(`Informe um título de até ${this.tituloMaximo} caracteres.`); return;
    }
    if (descricao && descricao.length > this.descricaoMaxima) {
      this.erro.set(`A descrição deve ter até ${this.descricaoMaxima} caracteres.`); return;
    }
    if (!TEXTO_EVENTO.test(titulo) || (descricao && !TEXTO_EVENTO.test(descricao))) {
      this.erro.set('Título e descrição contêm caracteres não suportados. Use letras do alfabeto latino, com ou sem acentos, e evite emojis.'); return;
    }
    if (!this.modelo.local.trim() || !this.modelo.dataEvento || !this.modelo.membros.length) {
      this.erro.set('Informe data, local e pelo menos um participante.'); return;
    }
    if (this.modelo.membros.length > 1000) {
      this.erro.set('Selecione até 1000 participantes.'); return;
    }
    if (!this.evento && (!this.dataMinima || this.modelo.dataEvento < this.dataMinima)) {
      this.erro.set('Selecione uma data a partir da data mínima de cadastro informada pelo servidor.'); return;
    }
    if (this.exigeMotivo() && !motivoValido(this.motivo)) {
      this.erro.set('Informe o motivo com 1 a 255 caracteres, sem emojis, tabulações ou quebras de linha.'); return;
    }
    const valores = [this.valorSeguro(), this.modelo.transporte.ehGratis ? 0 : this.modelo.transporte.valor,
      this.modelo.alimentacao.individual ? 0 : this.modelo.alimentacao.valor];
    if (valores.some(v => v == null || !Number.isFinite(v) || v < 0 || Math.abs(v * 100 - Math.round(v * 100)) > 0.00001) || !Number.isSafeInteger(Math.round(this.total() * 100))) {
      this.erro.set('Informe custos válidos, positivos ou zero, com até duas casas decimais.'); return;
    }
    const regra = this.erroRegrasEdicao();
    if (regra) { this.erro.set(regra); return; }
    this.estadoRevisado = this.estadoEditavel();
    this.confirmando = true; this.confirmado = false;
  }
  salvar(): void {
    if (!this.confirmando || !this.confirmado || this.salvando() || this.conflito() || this.incerto() || this.eventoExistenteId() || !this.podeSalvar()) return;
    if (this.estadoRevisado !== this.estadoEditavel() || this.erroRegrasEdicao()) {
      this.confirmando = false; this.confirmado = false;
      this.erro.set('Os dados mudaram após a revisão. Revise novamente antes de confirmar.'); return;
    }
    this.erro.set(''); this.salvando.set(true); this.ocupacao.emit(true);
    const { eventoReferenciaId, ...base } = this.modelo;
    const conteudo = { ...structuredClone(base), ...this.normalizarTextos(), local: base.local.trim(), membros: [...new Set(base.membros)].sort(),
      seguroObrigatorio: this.valorSeguro(),
      transporte: { ...base.transporte, valor: base.transporte.ehGratis ? 0 : base.transporte.valor },
      alimentacao: { ...base.alimentacao, valor: base.alimentacao.individual ? 0 : base.alimentacao.valor } };
    let requisicao;
    if (this.evento) {
      const informarMotivo = this.exigeMotivo();
      const payload: EditarEvento = { ...conteudo, versao: this.evento.versao, ...(informarMotivo ? { motivo: this.motivo.trim() } : {}) };
      requisicao = this.api.editar(this.evento.id, payload);
    } else {
      if (!this.api.cadastroPendente()) this.api.cadastroPendente.set({ conteudo: { ...conteudo, eventoReferenciaId: eventoReferenciaId || null }, chave: crypto.randomUUID() });
      const pendente = this.api.cadastroPendente()!;
      requisicao = this.api.criar(pendente.conteudo, pendente.chave);
    }
    requisicao.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.salvando.set(false); this.ocupacao.emit(false); }))
      .subscribe({ next: e => {
        if (!this.evento) this.api.cadastroPendente.set(null);
        if (e.titulo?.trim()) {
          this.toast.success(this.evento ? 'Evento atualizado.' : 'Evento cadastrado.');
        } else {
          this.toast.warning('Evento salvo, mas a API não confirmou o título. Verifique a versão do backend.');
        }
        this.salvo.emit(e);
      }, error: (e: unknown) => {
        const status = e instanceof HttpErrorResponse ? e.status : 0;
        const problema = e instanceof HttpErrorResponse ? e.error : null;
        this.incerto.set(!!this.evento && respostaIncerta(e));
        const mensagem = erroEvento(e); this.erro.set(mensagem); this.toast.error(mensagem);
        this.conflito.set(!!this.evento && status === 409);
        if (this.incerto()) this.falhaEdicao.emit('incerta');
        if (this.conflito()) this.falhaEdicao.emit('conflito');
        if (!this.evento && status === 409) {
          if (problema?.codigo === 'EVENTO_IDEMPOTENCIA_SEM_RESPOSTA_ORIGINAL' && typeof problema?.eventoId === 'string') {
            this.eventoExistenteId.set(problema.eventoId);
          } else {
            this.rejeitado.set(true);
          }
        }
        // Rejeições explícitas permitem corrigir o formulário; rede/5xx/409 preservam a operação.
        if (!this.evento && [400, 401, 403, 404].includes(status)) { this.api.cadastroPendente.set(null); this.confirmando = false; this.confirmado = false; }
      } });
  }
  corrigirRejeitado(): void {
    if (!this.rejeitado() || this.salvando()) return;
    this.api.cadastroPendente.set(null); this.rejeitado.set(false); this.confirmando = false; this.confirmado = false;
  }
  consultarExistente(): void {
    if (!this.eventoExistenteId() || this.salvando()) return;
    this.salvando.set(true); this.ocupacao.emit(true);
    this.api.obter(this.eventoExistenteId()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.salvando.set(false); this.ocupacao.emit(false); }))
      .subscribe({ next: e => { this.api.cadastroPendente.set(null); this.salvo.emit(e); }, error: e => this.erro.set(erroEvento(e)) });
  }
}
