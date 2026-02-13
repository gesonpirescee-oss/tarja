import { createWorker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
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
    const data = await pdfParse(dataBuffer);

    const pages = [];
    for (let i = 0; i < data.numpages; i++) {
      pages.push({
        pageNumber: i + 1,
        text: data.text || ''
      });
    }

    return {
      text: data.text || '',
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
