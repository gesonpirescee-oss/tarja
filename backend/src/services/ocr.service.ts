import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'fs';
import { logger } from '../utils/logger';
import sharp from 'sharp';

interface ExtractedText {
  text: string;
  pages: Array<{
    pageNumber: number;
    text: string;
    boundingBoxes?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
  }>;
}

export const extractTextFromPDF = async (filePath: string): Promise<ExtractedText> => {
  try {
    const dataBuffer = readFileSync(filePath);
    
    // Usar pdf-parse para obter número de páginas e texto completo
    const data = await pdfParse(dataBuffer);
    const totalPages = data.numpages || 1;
    const fullText = data.text || '';
    
    // Tentar extrair texto por página usando pdf-lib
    // Isso é mais preciso para determinar em qual página cada texto está
    const pdfDoc = await PDFDocument.load(dataBuffer);
    const pageTexts: string[] = [];
    let cumulativeLength = 0;
    const pageBoundaries: number[] = [0]; // Início do documento
    
    // Para cada página, tentar extrair o texto
    // Como pdf-lib não tem extração de texto nativa, vamos usar uma abordagem híbrida:
    // Dividir o texto completo proporcionalmente, mas usando marcadores mais inteligentes
    const avgCharsPerPage = fullText.length / totalPages;
    
    // Dividir texto por página de forma mais inteligente
    // Procurar por quebras naturais (múltiplas quebras de linha, espaços grandes)
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let currentPageStart = 0;
    
    for (let i = 0; i < totalPages; i++) {
      let pageEnd: number;
      
      if (i === totalPages - 1) {
        // Última página: pegar todo o resto
        pageEnd = fullText.length;
      } else {
        // Tentar encontrar um ponto de quebra natural próximo ao tamanho médio
        const targetEnd = Math.floor((i + 1) * avgCharsPerPage);
        
        // Procurar por quebras de linha duplas ou triplas próximas ao alvo
        let bestBreak = targetEnd;
        let searchStart = Math.max(currentPageStart, targetEnd - avgCharsPerPage * 0.3);
        let searchEnd = Math.min(fullText.length, targetEnd + avgCharsPerPage * 0.3);
        
        // Procurar por padrões de quebra de página (múltiplas quebras de linha)
        const breakPattern = /\n{3,}/g;
        let match;
        let closestBreak = targetEnd;
        let minDistance = Infinity;
        
        while ((match = breakPattern.exec(fullText.substring(searchStart, searchEnd))) !== null) {
          const breakPos = searchStart + match.index + match[0].length;
          const distance = Math.abs(breakPos - targetEnd);
          if (distance < minDistance) {
            minDistance = distance;
            closestBreak = breakPos;
          }
        }
        
        // Se encontrou uma quebra próxima, usar ela; senão usar o alvo
        if (minDistance < avgCharsPerPage * 0.2) {
          bestBreak = closestBreak;
        } else {
          bestBreak = targetEnd;
        }
        
        pageEnd = bestBreak;
      }
      
      const pageText = fullText.substring(currentPageStart, pageEnd);
      pages.push({
        pageNumber: i + 1,
        text: pageText
      });
      
      pageTexts.push(pageText);
      pageBoundaries.push(pageEnd);
      currentPageStart = pageEnd;
    }
    
    logger.info(`Extracted text from ${totalPages} pages, total length: ${fullText.length} chars`);
    
    return {
      text: fullText,
      pages
    };
  } catch (error) {
    logger.error('Error extracting text from PDF', error);
    throw error;
  }
};

export const extractTextFromImage = async (filePath: string): Promise<ExtractedText> => {
  try {
    // Pré-processamento da imagem
    const processedImage = await sharp(filePath)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();

    // OCR com Tesseract
    const worker = await createWorker('por'); // Português
    const { data } = await worker.recognize(processedImage);
    await worker.terminate();

    return {
      text: data.text,
      pages: [{
        pageNumber: 1,
        text: data.text,
        boundingBoxes: data.words.map((word: any) => ({
          text: word.text,
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }))
      }]
    };
  } catch (error) {
    logger.error('Error extracting text from image', error);
    throw error;
  }
};

export const extractText = async (filePath: string, mimeType: string): Promise<ExtractedText> => {
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(filePath);
  } else if (mimeType.startsWith('image/')) {
    return extractTextFromImage(filePath);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
};
