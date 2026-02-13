import { PDFDocument, rgb } from 'pdf-lib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { Detection } from '@prisma/client';

interface RedactionResult {
  outputPath: string;
  hash: string;
  success: boolean;
}

/**
 * Aplica tarja em um documento PDF
 */
export const redactPDF = async (
  originalPath: string,
  detections: Detection[],
  outputPath: string
): Promise<RedactionResult> => {
  try {
    // Garantir que o diretório de saída existe
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Ler o PDF original
    const pdfBytes = readFileSync(originalPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pages = pdfDoc.getPages();
    
    // Agrupar detecções por página
    const detectionsByPage = new Map<number, Detection[]>();
    detections.forEach((detection) => {
      const pageNum = detection.pageNumber || 1;
      if (!detectionsByPage.has(pageNum)) {
        detectionsByPage.set(pageNum, []);
      }
      detectionsByPage.get(pageNum)!.push(detection);
    });

    // Aplicar tarja em cada página
    detectionsByPage.forEach((pageDetections, pageNum) => {
      const pageIndex = pageNum - 1;
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];
        const { height } = page.getSize();

        pageDetections.forEach((detection) => {
          // Se temos bounding box, usar coordenadas exatas
          if (detection.boundingBox && typeof detection.boundingBox === 'object') {
            const bbox = detection.boundingBox as any;
            const x = bbox.x || 0;
            const y = height - (bbox.y + (bbox.height || 0)); // PDF usa coordenadas de baixo para cima
            const w = bbox.width || 100;
            const h = bbox.height || 20;

            // Desenhar retângulo preto sobre a área
            page.drawRectangle({
              x,
              y,
              width: w,
              height: h,
              color: rgb(0, 0, 0),
              borderColor: rgb(0, 0, 0),
            });
          } else {
            // Fallback: usar posição aproximada baseada no índice do texto
            // Isso é menos preciso, mas funciona quando não temos coordenadas
            const estimatedY = height - (detection.startIndex % 1000) * 0.5;
            page.drawRectangle({
              x: 50,
              y: estimatedY - 10,
              width: 200,
              height: 20,
              color: rgb(0, 0, 0),
            });
          }
        });
      }
    });

    // Salvar PDF tarjado
    const redactedPdfBytes = await pdfDoc.save();
    writeFileSync(outputPath, redactedPdfBytes);

    // Calcular hash do arquivo gerado
    const hash = createHash('sha256').update(redactedPdfBytes).digest('hex');

    logger.info(`PDF redacted successfully: ${outputPath}`);

    return {
      outputPath,
      hash,
      success: true
    };
  } catch (error) {
    logger.error('Error redacting PDF', error);
    throw error;
  }
};

/**
 * Aplica tarja em uma imagem
 */
export const redactImage = async (
  originalPath: string,
  detections: Detection[],
  outputPath: string
): Promise<RedactionResult> => {
  try {
    // Garantir que o diretório de saída existe
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Carregar imagem
    let image = sharp(originalPath);
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Criar composição de tarjas
    const composites: any[] = [];

    detections.forEach((detection) => {
      if (detection.boundingBox && typeof detection.boundingBox === 'object') {
        const bbox = detection.boundingBox as any;
        const x = Math.max(0, Math.min(bbox.x || 0, width));
        const y = Math.max(0, Math.min(bbox.y || 0, height));
        const w = Math.min(bbox.width || 100, width - x);
        const h = Math.min(bbox.height || 20, height - y);

        // Criar retângulo preto para a tarja
        const redactionRect = Buffer.from(
          `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/></svg>`
        );

        composites.push({
          input: redactionRect,
          left: Math.floor(x),
          top: Math.floor(y),
        });
      } else {
        // Fallback: aplicar blur na área aproximada
        // Usar posição estimada baseada no índice do texto
        const estimatedX = 50;
        const estimatedY = (detection.startIndex % 1000) * 0.5;
        const estimatedW = 200;
        const estimatedH = 20;

        const redactionRect = Buffer.from(
          `<svg width="${estimatedW}" height="${estimatedH}"><rect width="${estimatedW}" height="${estimatedH}" fill="black"/></svg>`
        );

        composites.push({
          input: redactionRect,
          left: Math.floor(estimatedX),
          top: Math.floor(estimatedY),
        });
      }
    });

    // Aplicar todas as tarjas
    if (composites.length > 0) {
      image = image.composite(composites);
    }

    // Salvar imagem tarjada
    await image.toFile(outputPath);

    // Calcular hash do arquivo gerado
    const redactedImageBytes = readFileSync(outputPath);
    const hash = createHash('sha256').update(redactedImageBytes).digest('hex');

    logger.info(`Image redacted successfully: ${outputPath}`);

    return {
      outputPath,
      hash,
      success: true
    };
  } catch (error) {
    logger.error('Error redacting image', error);
    throw error;
  }
};

/**
 * Aplica tarja em um documento (PDF ou imagem)
 */
export const redactDocument = async (
  originalPath: string,
  mimeType: string,
  detections: Detection[],
  outputDir: string,
  documentId: string
): Promise<RedactionResult> => {
  const fileExtension = mimeType.includes('pdf') ? 'pdf' : 
                       mimeType.includes('png') ? 'png' : 
                       mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'pdf';
  
  const outputPath = join(outputDir, `${documentId}_redacted.${fileExtension}`);

  if (mimeType === 'application/pdf') {
    return redactPDF(originalPath, detections, outputPath);
  } else if (mimeType.startsWith('image/')) {
    return redactImage(originalPath, detections, outputPath);
  } else {
    throw new Error(`Unsupported file type for redaction: ${mimeType}`);
  }
};
