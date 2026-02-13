import { useState, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Box, IconButton, Typography, Paper, Chip, Tooltip } from '@mui/material';
import { ZoomIn, ZoomOut, NavigateBefore, NavigateNext } from '@mui/icons-material';
import { api } from '../services/api';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configurar worker do PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Detection {
  id: string;
  type: string;
  text: string;
  pageNumber?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  riskLevel: string;
  confidence: number;
  isApproved?: boolean;
  isRejected?: boolean;
}

interface PDFViewerProps {
  documentId: string;
  detections: Detection[];
  onDetectionClick?: (detection: Detection) => void;
}

const PDFViewer = ({ documentId, detections, onDetectionClick }: PDFViewerProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Construir URL da API com token de autenticação
  const getPdfUrl = useCallback(async () => {
    try {
      // Obter token do localStorage
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        const token = authData.state?.accessToken;
        if (token) {
          // Usar a URL base da API
          const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';
          return `${API_BASE_URL}/api/${API_VERSION}/documents/${documentId}/view?token=${token}`;
        }
      }
      // Fallback: usar URL relativa (funciona se proxy estiver configurado)
      return `/api/v1/documents/${documentId}/view`;
    } catch {
      return `/api/v1/documents/${documentId}/view`;
    }
  }, [documentId]);

  const [pdfUrl, setPdfUrl] = useState<string>('');

  useEffect(() => {
    getPdfUrl().then(setPdfUrl);
  }, [getPdfUrl]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError('');
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    setError('Erro ao carregar PDF: ' + error.message);
    setLoading(false);
  }, []);

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.2));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  // Filtrar detecções da página atual
  const pageDetections = detections.filter(
    (detection) => (detection.pageNumber || 1) === pageNumber
  );

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'HIGH':
        return '#f44336';
      case 'MEDIUM':
        return '#ff9800';
      case 'LOW':
        return '#4caf50';
      default:
        return '#2196f3';
    }
  };

  if (error) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Controles */}
      <Paper
        sx={{
          p: 1,
          mb: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={goToPrevPage} disabled={pageNumber <= 1} size="small">
            <NavigateBefore />
          </IconButton>
          <Typography variant="body2">
            Página {pageNumber} de {numPages}
          </Typography>
          <IconButton onClick={goToNextPage} disabled={pageNumber >= numPages} size="small">
            <NavigateNext />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={zoomOut} size="small">
            <ZoomOut />
          </IconButton>
          <Typography variant="body2">{Math.round(scale * 100)}%</Typography>
          <IconButton onClick={zoomIn} size="small">
            <ZoomIn />
          </IconButton>
        </Box>

        <Typography variant="body2" color="text.secondary">
          {pageDetections.length} detecção(ões) nesta página
        </Typography>
      </Paper>

      {/* Visualizador PDF */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: 'grey.100',
          p: 2,
          overflow: 'auto',
          maxHeight: '80vh',
        }}
      >
        <Box sx={{ position: 'relative' }}>
          {pdfUrl && (
            <Document
              file={{
                url: pdfUrl,
                httpHeaders: {
                  Authorization: `Bearer ${JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.accessToken || ''}`,
                },
              }}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography>Carregando PDF...</Typography>
                </Box>
              }
            >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            >
              {/* Overlay de detecções */}
              {pageDetections.map((detection) => {
                if (!detection.boundingBox) return null;

                const bbox = detection.boundingBox;
                const isApproved = detection.isApproved;
                const isRejected = detection.isRejected;

                return (
                  <Tooltip
                    key={detection.id}
                    title={`${detection.type}: ${detection.text} (${detection.confidence}%)`}
                    arrow
                  >
                    <Box
                      onClick={() => onDetectionClick?.(detection)}
                      sx={{
                        position: 'absolute',
                        left: `${bbox.x}px`,
                        top: `${bbox.y}px`,
                        width: `${bbox.width}px`,
                        height: `${bbox.height}px`,
                        border: `2px solid ${getRiskColor(detection.riskLevel)}`,
                        backgroundColor: isApproved
                          ? 'rgba(76, 175, 80, 0.3)'
                          : isRejected
                          ? 'rgba(244, 67, 54, 0.2)'
                          : `${getRiskColor(detection.riskLevel)}40`,
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: `${getRiskColor(detection.riskLevel)}60`,
                          zIndex: 10,
                        },
                      }}
                    >
                      {isApproved && (
                        <Chip
                          label="✓"
                          size="small"
                          color="success"
                          sx={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            height: 20,
                            fontSize: '0.7rem',
                          }}
                        />
                      )}
                      {isRejected && (
                        <Chip
                          label="✗"
                          size="small"
                          color="error"
                          sx={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            height: 20,
                            fontSize: '0.7rem',
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Page>
            </Document>
          )}
        </Box>
      </Box>

      {/* Lista de detecções da página */}
      {pageDetections.length > 0 && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Detecções na Página {pageNumber}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {pageDetections.map((detection) => (
              <Box
                key={detection.id}
                onClick={() => onDetectionClick?.(detection)}
                sx={{
                  p: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Chip
                    label={detection.type}
                    size="small"
                    sx={{
                      backgroundColor: getRiskColor(detection.riskLevel),
                      color: 'white',
                    }}
                  />
                  {detection.isApproved && <Chip label="Aprovado" color="success" size="small" />}
                  {detection.isRejected && <Chip label="Rejeitado" color="error" size="small" />}
                </Box>
                <Typography variant="body2" fontWeight="bold">
                  {detection.text}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Confiança: {detection.confidence}% | Risco: {detection.riskLevel}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default PDFViewer;
