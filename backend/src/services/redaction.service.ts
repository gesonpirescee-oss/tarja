import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { Detection } from '@prisma/client';
import pdfParse from 'pdf-parse';

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

    // Extrair texto do PDF para encontrar posições
    const pdfTextData = await pdfParse(pdfBytes);
    const fullText = pdfTextData.text || '';
    const totalPages = pdfTextData.numpages || pages.length;
    
    // Dividir texto por página (aproximado) para busca
    const pageTexts: string[] = [];
    const avgCharsPerPage = fullText.length / totalPages;
    
    for (let i = 0; i < totalPages; i++) {
      const start = Math.floor(i * avgCharsPerPage);
      const end = i === totalPages - 1 ? fullText.length : Math.floor((i + 1) * avgCharsPerPage);
      pageTexts.push(fullText.substring(start, end));
    }
    
    logger.info(`PDF has ${totalPages} pages, ${detections.length} detections to process`);
    
    // Aplicar tarja apenas nas páginas que têm detecções aprovadas
    logger.info(`Processing ${detectionsByPage.size} pages with detections out of ${pages.length} total pages`);
    
    let redactionsApplied = 0;
    let redactionsSkipped = 0;
    
    detectionsByPage.forEach((pageDetections, pageNum) => {
      const pageIndex = pageNum - 1;
      if (pageIndex >= 0 && pageIndex < pages.length && pageDetections.length > 0) {
        const page = pages[pageIndex];
        const { width, height } = page.getSize();
        const pageText = pageTexts[pageIndex] || '';

        logger.info(`Page ${pageNum}: Applying ${pageDetections.length} redactions`);

        pageDetections.forEach((detection) => {
          const detectionText = detection.text.trim();
          
          // Verificar se a detecção realmente pertence a esta página usando startIndex
          const detectionStartIndex = detection.startIndex || 0;
          const pageStartIndex = Math.floor((pageNum - 1) * avgCharsPerPage);
          const pageEndIndex = pageNum === totalPages ? fullText.length : Math.floor(pageNum * avgCharsPerPage);
          
          // Se a detecção não está nesta página, pular (não aplicar tarja)
          if (detectionStartIndex < pageStartIndex || detectionStartIndex >= pageEndIndex) {
            logger.info(`Skipping detection "${detectionText}" - index ${detectionStartIndex} not in page ${pageNum} range (${pageStartIndex}-${pageEndIndex})`);
            return;
          }
          
          // APENAS aplicar tarja se tivermos bounding box preciso
          // Sem bounding box, não podemos garantir posicionamento correto
          if (detection.boundingBox && typeof detection.boundingBox === 'object') {
            const bbox = detection.boundingBox as any;
            
            // Validar que o bounding box tem valores válidos
            if (!bbox.x && bbox.x !== 0) {
              logger.warn(`Invalid bounding box for "${detectionText}" on page ${pageNum}: missing x coordinate`);
              return;
            }
            if (!bbox.y && bbox.y !== 0) {
              logger.warn(`Invalid bounding box for "${detectionText}" on page ${pageNum}: missing y coordinate`);
              return;
            }
            
            const x = bbox.x || 0;
            const y = height - (bbox.y + (bbox.height || 0)); // PDF usa coordenadas de baixo para cima
            const w = bbox.width || 100;
            const h = bbox.height || 20;
            
            // Validar que as coordenadas estão dentro dos limites da página
            if (x < 0 || x >= width || y < 0 || y >= height) {
              logger.warn(`Bounding box out of bounds for "${detectionText}" on page ${pageNum}: x=${x}, y=${y}, page size=${width}x${height}`);
              return;
            }

            logger.info(`Redacting "${detectionText}" with bounding box: x=${x.toFixed(1)}, y=${y.toFixed(1)}, w=${w.toFixed(1)}, h=${h.toFixed(1)} on page ${pageNum}`);
            
            // Desenhar retângulo preto sobre a área
            page.drawRectangle({
              x: Math.max(0, Math.min(x, width - w)),
              y: Math.max(0, Math.min(y, height - h)),
              width: Math.min(w, width - Math.max(0, Math.min(x, width - w))),
              height: Math.min(h, height - Math.max(0, Math.min(y, height - h))),
              color: rgb(0, 0, 0),
              borderColor: rgb(0, 0, 0),
            });
            
            redactionsApplied++;
          } else {
            // SEM bounding box: NÃO aplicar tarja para evitar posicionamento incorreto
            // A estimativa de posição baseada em texto não é confiável o suficiente
            logger.warn(`Skipping redaction for "${detectionText}" on page ${pageNum}: no bounding box available. Position estimation is not reliable enough to avoid incorrect placement.`);
            redactionsSkipped++;
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
    logger.info(`Redaction summary: ${redactionsApplied} applied, ${redactionsSkipped} skipped (no bounding box)`);
    
    if (redactionsSkipped > 0) {
      logger.warn(`⚠️  ${redactionsSkipped} detections were not redacted because they lack bounding box coordinates. These detections were identified but cannot be safely redacted without precise position information.`);
    }

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
