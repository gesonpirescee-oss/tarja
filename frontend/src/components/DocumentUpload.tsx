import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Alert,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { api } from '../services/api';

interface DocumentUploadProps {
  onUploadSuccess?: () => void;
}

const DocumentUpload = ({ onUploadSuccess }: DocumentUploadProps) => {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    purpose: '',
    legalBasis: '',
    retentionDays: '30',
  });

  const legalBases = [
    { value: 'consent', label: 'Consentimento do titular' },
    { value: 'contract', label: 'Execução de contrato' },
    { value: 'legal_obligation', label: 'Cumprimento de obrigação legal' },
    { value: 'public_policy', label: 'Política pública' },
    { value: 'legitimate_interest', label: 'Legítimo interesse' },
    { value: 'credit_protection', label: 'Proteção do crédito' },
  ];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setOpen(true);
      setError('');
      setSuccess(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
  });

  const handleUpload = async () => {
    if (!formData.purpose || !formData.legalBasis) {
      setError('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      setError('Por favor, selecione um arquivo');
      return;
    }

    const file = fileInput.files[0];
    setUploading(true);
    setProgress(0);
    setError('');
    setSuccess(false);

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      uploadData.append('purpose', formData.purpose);
      uploadData.append('legalBasis', formData.legalBasis);
      uploadData.append('retentionDays', formData.retentionDays);

      await api.post('/documents/upload', uploadData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgress(percentCompleted);
          }
        },
      });

      setSuccess(true);
      setProgress(100);
      
      setTimeout(() => {
        setOpen(false);
        setFormData({ purpose: '', legalBasis: '', retentionDays: '30' });
        setUploading(false);
        setProgress(0);
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao fazer upload do documento');
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setOpen(false);
      setFormData({ purpose: '', legalBasis: '', retentionDays: '30' });
      setError('');
      setSuccess(false);
    }
  };

  return (
    <>
      <Paper
        {...getRootProps()}
        sx={{
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover',
          },
        }}
      >
        <input {...getInputProps()} />
        <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive ? 'Solte o arquivo aqui' : 'Arraste e solte um arquivo aqui'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          ou clique para selecionar
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Formatos suportados: PDF, PNG, JPG (máx. 50MB)
        </Typography>
      </Paper>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Informações do Documento</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success">Documento enviado com sucesso!</Alert>
            )}

            <TextField
              label="Finalidade do Processamento"
              fullWidth
              required
              multiline
              rows={3}
              value={formData.purpose}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, purpose: e.target.value })}
              placeholder="Descreva a finalidade do processamento deste documento..."
            />

            <TextField
              label="Base Legal"
              fullWidth
              required
              select
              value={formData.legalBasis}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, legalBasis: e.target.value })}
            >
              {legalBases.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Prazo de Retenção (dias)"
              fullWidth
              type="number"
              value={formData.retentionDays}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, retentionDays: e.target.value })}
              inputProps={{ min: 1 }}
            />

            {uploading && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Enviando... {progress}%
                </Typography>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={uploading || !formData.purpose || !formData.legalBasis}
          >
            {uploading ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DocumentUpload;
