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
          
          // Se temos bounding box, usar coordenadas exatas
          if (detection.boundingBox && typeof detection.boundingBox === 'object') {
            const bbox = detection.boundingBox as any;
            const x = bbox.x || 0;
            const y = height - (bbox.y + (bbox.height || 0)); // PDF usa coordenadas de baixo para cima
            const w = bbox.width || 100;
            const h = bbox.height || 20;

            logger.info(`Redacting with bounding box: x=${x}, y=${y}, w=${w}, h=${h}`);
            
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
            // Tentar encontrar o texto na página específica usando o startIndex relativo à página
            const detectionStartIndex = detection.startIndex || 0;
            const pageStartIndex = Math.floor((pageNum - 1) * avgCharsPerPage);
            const relativeIndex = detectionStartIndex - pageStartIndex;
            
            // Se o índice relativo está fora dos limites da página, não aplicar tarja aqui
            if (relativeIndex < 0 || relativeIndex >= pageText.length) {
              logger.warn(`Detection "${detectionText}" relative index ${relativeIndex} out of page ${pageNum} bounds (0-${pageText.length}), skipping`);
              return;
            }
            
            // Limpar o texto da detecção para melhor matching
            const cleanDetectionText = detectionText.replace(/[^\w@.-]/g, '');
            const cleanPageText = pageText.replace(/[^\w@.-]/g, ' ');
            
            // Buscar o texto na página (case insensitive)
            const searchText = cleanDetectionText.toLowerCase();
            const pageTextLower = cleanPageText.toLowerCase();
            let textIndex = pageTextLower.indexOf(searchText);
            
            // Se não encontrou exato, tentar buscar uma substring menor
            if (textIndex < 0 && detectionText.length > 5) {
              const shortText = detectionText.substring(0, Math.min(10, detectionText.length)).toLowerCase();
              textIndex = pageTextLower.indexOf(shortText);
            }
            
            if (textIndex >= 0) {
              // Calcular posição baseada na posição do texto encontrado na página
              // Assumir layout padrão com margens
              const charsBefore = textIndex;
              
              // Estimar linhas e colunas (assumindo ~70-90 caracteres por linha)
              const avgCharsPerLine = Math.max(60, Math.min(100, Math.floor(width / 8))); // Ajustar baseado na largura da página
              const linesBefore = Math.floor(charsBefore / avgCharsPerLine);
              const charsInLine = charsBefore % avgCharsPerLine;
              
              // Calcular Y (PDF usa coordenadas de baixo para cima)
              // Margem superior padrão: ~50-80px, altura de linha: ~12-16px
              const topMargin = 70;
              const lineHeight = 14;
              const estimatedY = height - (topMargin + (linesBefore * lineHeight) + lineHeight);
              
              // Calcular largura baseada no comprimento do texto
              // Assumir ~6-8 pixels por caractere (fonte padrão)
              const charWidth = 7;
              const estimatedWidth = Math.min(detectionText.length * charWidth + 10, width - 100); // +10 para margem
              
              // Calcular X baseado na posição na linha
              const estimatedX = 50 + (charsInLine * charWidth);
              
              logger.info(`Redacting "${detectionText}" at position: x=${estimatedX.toFixed(1)}, y=${estimatedY.toFixed(1)}, w=${estimatedWidth.toFixed(1)} (found at index ${textIndex} in page ${pageNum})`);
              
              // Aplicar tarja com validação de limites
              const finalX = Math.max(50, Math.min(estimatedX, width - estimatedWidth - 50));
              const finalY = Math.max(0, Math.min(estimatedY, height - lineHeight));
              const finalWidth = Math.max(50, Math.min(estimatedWidth, width - finalX - 50));
              const finalHeight = Math.max(12, lineHeight);
              
              page.drawRectangle({
                x: finalX,
                y: finalY,
                width: finalWidth,
                height: finalHeight,
                color: rgb(0, 0, 0),
                borderColor: rgb(0, 0, 0),
              });
            } else {
              // Se não encontrou o texto, não aplicar tarja (melhor do que aplicar no lugar errado)
              logger.warn(`Could not find text "${detectionText}" in page ${pageNum} text, skipping redaction to avoid incorrect placement`);
            }
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
