import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Chip,
  Grid,
  Tabs,
  Tab,
} from '@mui/material';
import { api } from '../services/api';
import PDFViewer from '../components/PDFViewer';

const DocumentReviewPage = () => {
  const { id } = useParams();
  const [document, setDocument] = useState<any>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (id) {
      fetchDocument();
      fetchDetections();
    }
  }, [id]);

  const fetchDocument = async () => {
    try {
      const response = await api.get(`/documents/${id}`);
      setDocument(response.data.data.document);
    } catch (error) {
      console.error('Error fetching document:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetections = async () => {
    try {
      const response = await api.get(`/documents/${id}/detections`);
      setDetections(response.data.data.detections);
    } catch (error) {
      console.error('Error fetching detections:', error);
    }
  };

  const handleDetectionAction = async (detectionId: string, action: string) => {
    try {
      await api.put(`/documents/${id}/detections/${detectionId}`, { action });
      fetchDetections();
    } catch (error) {
      console.error('Error updating detection:', error);
    }
  };

  if (loading) {
    return <Typography>Carregando...</Typography>;
  }

  const handleDetectionClick = (detection: any) => {
    // Scroll para a detecção na lista ou destacar
    const element = document.getElementById(`detection-${detection.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.backgroundColor = 'rgba(25, 118, 210, 0.1)';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
    }
  };

  const isPDF = document?.mimeType === 'application/pdf';

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Revisão de Documento
      </Typography>

      {document && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6">{document.originalFileName}</Typography>
          <Typography variant="body2" color="text.secondary">
            Status: {document.status} | Tipo: {document.mimeType}
          </Typography>
        </Paper>
      )}

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label={isPDF ? 'Visualizar PDF' : 'Documento'} />
        <Tab label={`Detecções (${detections.length})`} />
      </Tabs>

      {tabValue === 0 && (
        <Box>
          {isPDF && id ? (
            <PDFViewer
              documentId={id}
              detections={detections}
              onDetectionClick={handleDetectionClick}
            />
          ) : (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography>
                Visualização de imagens será implementada em breve.
                <br />
                Por enquanto, use a aba de detecções para revisar.
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {tabValue === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Detecções ({detections.length})
          </Typography>

      {detections.length === 0 ? (
        <Alert severity="info">Nenhuma detecção encontrada neste documento.</Alert>
      ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {detections.map((detection) => (
              <Paper
                key={detection.id}
                id={`detection-${detection.id}`}
                sx={{ p: 2, transition: 'background-color 0.3s' }}
              >
              <Typography variant="body1" fontWeight="bold">
                {detection.type} - {detection.text}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Confiança: {detection.confidence}% | Risco: {detection.riskLevel}
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                {!detection.isApproved && !detection.isRejected && (
                  <>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() => handleDetectionAction(detection.id, 'APPROVED')}
                    >
                      Aprovar
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      onClick={() => handleDetectionAction(detection.id, 'REJECTED')}
                    >
                      Rejeitar
                    </Button>
                  </>
                )}
                {detection.isApproved && (
                  <Chip label="Aprovado" color="success" size="small" />
                )}
                {detection.isRejected && (
                  <Chip label="Rejeitado" color="error" size="small" />
                )}
              </Box>
              </Paper>
            ))}
          </Box>

          {detections.some((d) => d.isApproved) && (
        <Box sx={{ mt: 3 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={async () => {
              try {
                await api.post(`/documents/${id}/redact`);
                alert('Tarja aplicada com sucesso!');
                fetchDocument();
              } catch (error) {
                console.error('Error applying redaction:', error);
              }
            }}
          >
              Aplicar Tarja
            </Button>
          </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default DocumentReviewPage;
