import { TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast';
import { ToastService } from '../../../core/services/toast.service';

describe('ToastComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [ToastService],
    }).compileComponents();
  });

  it('renderiza a mensagem e o botão de fechar do toast', () => {
    const fixture = TestBed.createComponent(ToastComponent);
    const service = TestBed.inject(ToastService);
    service.success('Cadastro salvo com sucesso.');
    fixture.detectChanges();

    const message = fixture.nativeElement.querySelector('.toast__message') as HTMLElement;
    const closeButton = fixture.nativeElement.querySelector('.toast__close') as HTMLButtonElement;

    expect(message.textContent).toContain('Cadastro salvo com sucesso.');
    expect(closeButton.getAttribute('aria-label')).toContain('Fechar notificação');
    expect(closeButton.textContent?.trim()).toBe('×');
  });

  it('aplica a classe e o role adequados para cada tipo', () => {
    const fixture = TestBed.createComponent(ToastComponent);
    const service = TestBed.inject(ToastService);
    service.error('Falha ao salvar.');
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.toast') as HTMLElement;
    expect(toast.classList.contains('toast--error')).toBe(true);
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('renderiza ações e fecha o toast antes de executá-las', () => {
    const fixture = TestBed.createComponent(ToastComponent);
    const service = TestBed.inject(ToastService);
    const onClick = vi.fn();
    service.warning('CPF está vazio.', {
      duration: 0,
      actions: [{ label: 'Editar CPF', onClick }],
    });
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector('.toast__action') as HTMLButtonElement;
    expect(action.textContent?.trim()).toBe('Editar CPF');
    action.click();

    expect(service.toasts()).toHaveLength(0);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
