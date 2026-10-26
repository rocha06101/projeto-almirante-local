import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadFoto } from './upload-foto';

describe('UploadFoto', () => {
  let component: UploadFoto;
  let fixture: ComponentFixture<UploadFoto>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadFoto],
    }).compileComponents();

    fixture = TestBed.createComponent(UploadFoto);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('aceita WebP e emite o arquivo sem criar prévia dentro da dropzone', () => {
    const arquivo = new File(['imagem'], 'perfil.webp', { type: 'image/webp' });
    const selecionada = vi.fn();
    component.fotoSelecionada.subscribe(selecionada);

    component.onFileSelected({
      target: { files: { item: () => arquivo }, value: 'perfil.webp' },
    } as unknown as Event);

    expect(selecionada).toHaveBeenCalledWith(arquivo);
    expect(fixture.nativeElement.querySelector('.upload-foto-preview')).toBeNull();
  });

  it('recusa formato inválido e arquivo acima de 10 MB', () => {
    const selecionada = vi.fn();
    component.fotoSelecionada.subscribe(selecionada);
    const eventFor = (file: File) => ({
      target: { files: { item: () => file }, value: 'arquivo' },
    }) as unknown as Event;

    component.onFileSelected(eventFor(new File(['pdf'], 'arquivo.pdf', { type: 'application/pdf' })));
    expect(component.erro).toContain('JPEG, PNG ou WebP');
    expect(selecionada).toHaveBeenLastCalledWith(null);

    const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.png', { type: 'image/png' });
    component.onFileSelected(eventFor(largeFile));
    expect(component.erro).toContain('10 MB');
    expect(selecionada).toHaveBeenLastCalledWith(null);
  });
});
