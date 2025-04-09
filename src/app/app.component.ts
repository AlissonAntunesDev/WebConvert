import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.mjs';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'web_convert';
  fileNames: string[] = [];
  isDragging: boolean = false;
  arquivoSelecionado: boolean = false;
  uploadedFile: File | undefined;
  arquivoConvertido: boolean = false;
  downloadUrl: SafeUrl | null = null;
  formatoSaida = 'xlsx';

  onFileSelected(event: any): void {
    this.fileNames = [];
    if (event.target.files) {
      for (let file of event.target.files) {
        this.fileNames.push(file.name);
      }
    }
  }

  // @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  // uploadedFile: File | null = null;
  // downloadUrl: SafeUrl | null = null;
  // isDragging: boolean = false;
  // arquivoSelecionado: boolean = false;
  // arquivoConvertido: boolean = false;
  // formatoSaida = 'xlsx';

  constructor(private sanitizer: DomSanitizer) {}



  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      this.uploadedFile = event.dataTransfer.files[0];
    }
    this.arquivoSelecionado = true;
  }

  async processFile(): Promise<void> {
    if (!this.uploadedFile) {
      alert('Please select a PDF file first.');
      return;
    }

    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(this.uploadedFile);
    fileReader.onload = async () => {
      const typedarray = new Uint8Array(fileReader.result as ArrayBuffer);
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      let extractedText = '';

      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        const textContent = await page.getTextContent();
        extractedText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
      }

      
      this.generateXLSX(extractedText);
    };
    this.arquivoConvertido = true;
  }

  generateXLSX(text: string): void {
    const extractedData = this.extractDataFromText(text);
    const worksheet = XLSX.utils.json_to_sheet([extractedData]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    this.downloadUrl = this.sanitizer.bypassSecurityTrustUrl(url);
    this.arquivoConvertido = true;
  }

  extractDataFromText(text: string): any {
    const seiMatch = text.match(/\d+\.\d+\/\d+-\d+/);
    const seiNumber = seiMatch ? seiMatch[0] : 'N/A';
    return { Processo_SEI: seiNumber, Conteudo: text.substring(0, 100) + '...' };
  }

  downloadFile(): void {
    if (this.downloadUrl) {
      const a = document.createElement('a');
      a.href = this.downloadUrl as string;
      a.download = 'processed_file.xlsx';
      a.click();
    }
  }

  extrairNumeroSEI(texto: string): string {
    const padrao = /\d+\.\d+\/\d+-\d+/;
    const resultado = texto.match(padrao);
    return resultado ? resultado[0] : "não encontrado";
  }

  removerQuebrasDeLinhaEmDicionario(dicionario: { [key: string]: string[] }): { [key: string]: string[] } {
    const novoDicionario: { [key: string]: string[] } = {};
    for (const chave in dicionario) {
      if (dicionario.hasOwnProperty(chave)) {
        novoDicionario[chave] = dicionario[chave].map(valor => valor.replace(/\n/g, ''));
      }
    }
    return novoDicionario;
  }

  async extrairTextoPDF(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const pdf = await (await import('pdfjs-dist')).getDocument({ data: new Uint8Array(reader.result as ArrayBuffer) }).promise;
          let texto = '';
          for (let i = 0; i < pdf.numPages; i++) {
            const page = await pdf.getPage(i + 1);
            const textContent = await page.getTextContent();
            texto += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + "\n";
          }
          resolve(texto);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  extrairParecerEmenta(texto: string): { nomeParecer: string; processoSEI: string; ementa: string } {
    const linhas = texto.trim().split("\n");
    const nomeParecer = linhas.find(linha => linha.includes("PARECER"))?.trim() || "";
    let ementaLinhas: string[] = [];
    let processoSEI = "";

    if (nomeParecer) {
      const indiceNomeParecer = linhas.indexOf(nomeParecer);
      for (let i = indiceNomeParecer + 1; i < linhas.length; i++) {
        const linha = linhas[i].trim();
        ementaLinhas.push(linha);
        if (linha.startsWith("Processo SEI")) {
          processoSEI = this.extrairNumeroSEI(linha);
          break;
        }
      }
    }

    const ementa = ementaLinhas.join(' ').trim();
    processoSEI = this.extrairNumeroSEI(ementa) || processoSEI;

    return { nomeParecer, processoSEI, ementa };
  }

  extrairAssinaturasCompletas(texto: string): { nome: string; cargo: string; data: string }[] {
    const padrao = /Documento assinado eletronicamente por\s+([\wÀ-ÿ\s]+?),\s*\n*([\wÀ-ÿ\s\(\)-]+?),\s*\n*em\s*(\d{2}\/\d{2}\/\d{4})/g;
    let matches;
    const assinaturas: { nome: string; cargo: string; data: string }[] = [];
    while ((matches = padrao.exec(texto)) !== null) {
      const nome = matches[1].trim().replace(/\s+/g, ' ');
      const cargo = matches[2].trim().replace(/\s+/g, ' ');
      const data = matches[3];
      assinaturas.push({ nome, cargo, data });
    }
    return assinaturas;
  }

  buscarClassificacaoLAI(texto: string): string {
    const padrao = /\b(ATO PREPARATÓRIO|SIGILO PROFISSIONAL|DOCUMENTO PÚBLICO)\b/i;
    const resultado = texto.match(padrao);
    return resultado ? resultado[0] : "Não encontrada";
  }

  ajustarPlanilha(arquivo: File): void {
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const range = XLSX.utils.decode_range(sheet['!ref']!);

      for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxLength = 10;
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const cell_address = XLSX.utils.encode_cell({ c: C, r: R });
          const cell = sheet[cell_address];
          if (cell && cell.v) {
            maxLength = Math.max(maxLength, cell.v.toString().length);
          }
        }
        sheet['!cols'] = sheet['!cols'] || [];
        sheet['!cols'][C] = { wch: maxLength + 2 };
      }
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = arquivo.name;
      a.click();
      window.URL.revokeObjectURL(url);
    };
    reader.readAsArrayBuffer(arquivo);
  }
}
