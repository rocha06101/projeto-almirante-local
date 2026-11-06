import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ToastService();
  });

  afterEach(() => {
    service.clear();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('cria um toast de sucesso com duração padrão', () => {
    service.success('Usuário atualizado com sucesso.');

    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0].type).toBe('success');
    expect(service.toasts()[0].duration).toBe(4000);
    expect(service.toasts()[0].position).toBe('top-center');
  });

  it('cria um toast de erro com mensagem personalizada', () => {
    service.error('Não foi possível salvar.', { duration: 6000, position: 'bottom-left' });

    expect(service.toasts()[0].type).toBe('error');
    expect(service.toasts()[0].message).toBe('Não foi possível salvar.');
    expect(service.toasts()[0].position).toBe('bottom-left');
  });

  it('aplica cores personalizadas e mantém a mensagem', () => {
    service.show({
      message: 'Operação personalizada.',
      type: 'info',
      backgroundColor: '#673AB7',
      textColor: '#FFFFFF',
      position: 'top-center',
    });

    expect(service.toasts()[0].backgroundColor).toBe('#673AB7');
    expect(service.toasts()[0].textColor).toBe('#FFFFFF');
    expect(service.toasts()[0].message).toBe('Operação personalizada.');
  });

  it('remove toasts automaticamente e limpa temporizadores', () => {
    const id = service.warning('Aviso importante.', { duration: 1000 });
    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(service.toasts()).toHaveLength(0);
    expect(service.toasts()).toEqual([]);
    expect(service['timeouts'].has(id)).toBe(false);
  });

  it('fecha manualmente e respeita o limite de três toasts por posição', () => {
    service.show({ message: '1', type: 'success', position: 'top-right' });
    service.show({ message: '2', type: 'success', position: 'top-right' });
    service.show({ message: '3', type: 'success', position: 'top-right' });
    service.show({ message: '4', type: 'success', position: 'top-right' });

    expect(service.toasts().filter(item => item.position === 'top-right')).toHaveLength(3);
    const queued = service['queue'].get('top-right');
    expect(queued?.[0].message).toBe('4');

    service.dismiss(service.toasts()[0].id);
    expect(service.toasts().filter(item => item.position === 'top-right')).toHaveLength(3);
    expect(service.toasts().map(item => item.message)).toContain('4');
  });

  it('permite limpar todos os toasts de uma vez', () => {
    service.success('Primeiro');
    service.info('Segundo');

    service.clear();
    expect(service.toasts()).toHaveLength(0);
  });
});
