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
import { custosBloqueados, erroEvento, nomeEvento } from '../eventos.utils';

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
  readonly referencias = signal<EventoDto[]>([]);
  readonly carregandoReferencias = signal(false);
  readonly erroReferencias = signal('');
  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly conflito = signal(false);
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
      membros: [...this.modelo.membros].sort(), seguroAtivo: this.seguroAtivo, motivo: this.motivo });
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
  selecionarGrupo(grupo: GrupoParticipantes, marcado: boolean): void {
    if (!this.podeSelecionarMembros()) return;
    const selecionados = new Set(this.modelo.membros);
    for (const id of this.idsPorGrupo()[grupo]) {
      if (marcado) {
        this.membrosExibidos.add(id);
        selecionados.add(id);
      } else {
        this.membrosExibidos.delete(id);
        selecionados.delete(id);
      }
    }
    this.modelo.membros = [...selecionados];
  }
  selecionarMembro(id: string, marcado: boolean): void {
    if (!this.podeSelecionarMembros()) return;
    this.membrosExibidos.add(id);
    this.modelo.membros = marcado ? [...new Set([...this.modelo.membros, id])] : this.modelo.membros.filter(m => m !== id);
  }
  podeSelecionarMembros(): boolean {
    return this.podeSalvar() && this.acesso.tem('membros.consultar') && !this.bloqueado() &&
      !this.carregandoMembros() && !this.erroMembros();
  }
  bloqueado(): boolean { return custosBloqueados(this.evento); }
  removeMembros(): boolean { return !!this.evento?.membros.some(id => !this.modelo.membros.includes(id)); }
  cancelaCobrancas(): boolean {
    return !!this.evento?.lancamentos.length && this.evento.valorPorMembro > 0 && this.porMembro() === 0;
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
    if (!this.podeSalvar() || this.salvando()) return;
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
    if ((this.removeMembros() || this.cancelaCobrancas()) && !this.motivo.trim()) {
      this.erro.set('Informe o motivo da remoção de participantes ou do cancelamento das cobranças.'); return;
    }
    const valores = [this.valorSeguro(), this.modelo.transporte.ehGratis ? 0 : this.modelo.transporte.valor,
      this.modelo.alimentacao.individual ? 0 : this.modelo.alimentacao.valor];
    if (valores.some(v => v == null || !Number.isFinite(v) || v < 0 || Math.abs(v * 100 - Math.round(v * 100)) > 0.00001) || !Number.isSafeInteger(Math.round(this.total() * 100))) {
      this.erro.set('Informe custos válidos, positivos ou zero, com até duas casas decimais.'); return;
    }
    this.confirmando = true; this.confirmado = false;
  }
  salvar(): void {
    if (!this.confirmando || !this.confirmado || this.salvando() || this.conflito() || this.eventoExistenteId() || !this.podeSalvar()) return;
    this.erro.set(''); this.salvando.set(true); this.ocupacao.emit(true);
    const { eventoReferenciaId, ...base } = this.modelo;
    const conteudo = { ...structuredClone(base), ...this.normalizarTextos(), local: base.local.trim(), membros: [...new Set(base.membros)].sort(),
      seguroObrigatorio: this.valorSeguro(),
      transporte: { ...base.transporte, valor: base.transporte.ehGratis ? 0 : base.transporte.valor },
      alimentacao: { ...base.alimentacao, valor: base.alimentacao.individual ? 0 : base.alimentacao.valor } };
    let requisicao;
    if (this.evento) {
      const informarMotivo = this.removeMembros() || this.cancelaCobrancas();
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
      }, error: (e: HttpErrorResponse) => {
        const mensagem = erroEvento(e); this.erro.set(mensagem); this.toast.error(mensagem);
        this.conflito.set(!!this.evento && e.status === 409);
        if (!this.evento && e.status === 409) {
          if (e.error?.codigo === 'EVENTO_IDEMPOTENCIA_SEM_RESPOSTA_ORIGINAL' && typeof e.error?.eventoId === 'string') {
            this.eventoExistenteId.set(e.error.eventoId);
          } else {
            this.rejeitado.set(true);
          }
        }
        // Rejeições explícitas permitem corrigir o formulário; rede/5xx/409 preservam a operação.
        if (!this.evento && [400, 401, 403, 404].includes(e.status)) { this.api.cadastroPendente.set(null); this.confirmando = false; this.confirmado = false; }
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
