import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-upload-foto',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-foto.html',
  styleUrls: ['./upload-foto.scss'],
})
export class UploadFoto {
  @Output() fotoSelecionada = new EventEmitter<File>();
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  isDragOver = false;
  erro: string | null = null;

  private readonly allowedTypes = ['image/jpeg', 'image/png'];
  private readonly maxSizeBytes = 2 * 1024 * 1024;

  onContainerClick(): void {
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
    this.isDragOver = true;
  }

  handleDragOver(event: DragEvent): void {
    this.preventDefaults(event);
    this.isDragOver = true;
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
    if (!file) {
      return;
    }

    if (!this.allowedTypes.includes(file.type)) {
      this.erro = 'Apenas JPG ou PNG são permitidos.';
      return;
    }

    if (file.size > this.maxSizeBytes) {
      this.erro = 'O arquivo ultrapassa o tamanho máximo de 2MB.';
      return;
    }

    this.erro = null;
    this.fotoSelecionada.emit(file);
  }

  private preventDefaults(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
