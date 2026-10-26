import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-upload-foto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-foto.html',
  styleUrls: ['./upload-foto.scss'],
})
export class UploadFoto {
  @Output() fotoSelecionada = new EventEmitter<File | null>();
  @Input() disabled = false;
  @Input() enviando = false;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  isDragOver = false;
  erro: string | null = null;

  private readonly allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  private readonly maxSizeBytes = 10 * 1024 * 1024;

  onContainerClick(): void {
    if (this.disabled || this.enviando) {
      return;
    }
    this.erro = null;
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.processFile(file);
    input.value = '';
  }

  handleDragEnter(event: DragEvent): void {
    this.preventDefaults(event);
    this.isDragOver = !this.disabled && !this.enviando;
  }

  handleDragOver(event: DragEvent): void {
    this.preventDefaults(event);
    this.isDragOver = !this.disabled && !this.enviando;
  }

  handleDragLeave(event: DragEvent): void {
    this.preventDefaults(event);
    this.isDragOver = false;
  }

  handleDrop(event: DragEvent): void {
    this.preventDefaults(event);
    this.isDragOver = false;
    const file = event.dataTransfer?.files?.item(0) ?? null;
    this.processFile(file);
  }

  private processFile(file: File | null): void {
    if (!file || this.disabled || this.enviando) {
      return;
    }

    if (!this.allowedTypes.includes(file.type)) {
      this.erro = 'Selecione uma imagem JPEG, PNG ou WebP.';
      this.limparSelecao();
      return;
    }

    if (file.size > this.maxSizeBytes) {
      this.erro = 'O arquivo ultrapassa o limite de 10 MB.';
      this.limparSelecao();
      return;
    }

    this.erro = null;
    this.fotoSelecionada.emit(file);
  }

  private limparSelecao(): void {
    this.fotoSelecionada.emit(null);
  }

  private preventDefaults(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
