import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Grid,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { Visibility, FilterList, Clear } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import DocumentUpload from '../components/DocumentUpload';

interface Document {
  id: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  createdAt: string;
}

const DocumentsPage = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [filters, setFilters] = useState({
    status: '',
    fileType: '',
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({ status: '', fileType: '', search: '' });
  };

  const fetchDocuments = async () => {
    try {
      const params: any = {};
      if (filters.status) params.status = filters.status;
      if (filters.fileType) params.fileType = filters.fileType;
      if (filters.search) params.search = filters.search;

      const response = await api.get('/documents', { params });
      setDocuments(response.data.data.documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
      UPLOADED: 'default',
      PROCESSING: 'info',
      DETECTION_COMPLETE: 'primary',
      REVIEW_PENDING: 'warning',
      REDACTED: 'success',
    };
    return colors[status] || 'default';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleUploadSuccess = () => {
    fetchDocuments();
    setTabValue(0); // Voltar para a lista após upload
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Documentos
      </Typography>

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="Lista de Documentos" />
        <Tab label="Novo Upload" />
      </Tabs>

      {tabValue === 0 && (
        <Box>
          {/* Filtros */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FilterList />
                <Typography variant="h6">Filtros</Typography>
              </Box>
              <Box>
                <Button
                  size="small"
                  onClick={() => setShowFilters(!showFilters)}
                  sx={{ mr: 1 }}
                >
                  {showFilters ? 'Ocultar' : 'Mostrar'} Filtros
                </Button>
                {(filters.status || filters.fileType || filters.search) && (
                  <Button
                    size="small"
                    startIcon={<Clear />}
                    onClick={clearFilters}
                  >
                    Limpar
                  </Button>
                )}
              </Box>
            </Box>

            {showFilters && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Buscar"
                    placeholder="Nome do arquivo..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={filters.status}
                      label="Status"
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                    >
                      <MenuItem value="">Todos</MenuItem>
                      <MenuItem value="UPLOADED">Enviado</MenuItem>
                      <MenuItem value="PROCESSING">Processando</MenuItem>
                      <MenuItem value="DETECTION_COMPLETE">Detecção Completa</MenuItem>
                      <MenuItem value="REVIEW_PENDING">Aguardando Revisão</MenuItem>
                      <MenuItem value="REDACTED">Tarjado</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tipo de Arquivo</InputLabel>
                    <Select
                      value={filters.fileType}
                      label="Tipo de Arquivo"
                      onChange={(e) => handleFilterChange('fileType', e.target.value)}
                    >
                      <MenuItem value="">Todos</MenuItem>
                      <MenuItem value="pdf">PDF</MenuItem>
                      <MenuItem value="png">PNG</MenuItem>
                      <MenuItem value="jpg">JPG</MenuItem>
                      <MenuItem value="jpeg">JPEG</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            )}
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nome do Arquivo</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Tamanho</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Data de Upload</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhum documento encontrado. Faça upload de um documento para começar.
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>{doc.originalFileName}</TableCell>
                    <TableCell>{doc.fileType.toUpperCase()}</TableCell>
                    <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell>
                      <Chip label={doc.status} color={getStatusColor(doc.status)} size="small" />
                    </TableCell>
                    <TableCell>{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/documents/${doc.id}`)}
                      >
                        <Visibility />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </Box>
      )}

      {tabValue === 1 && (
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
          <DocumentUpload onUploadSuccess={handleUploadSuccess} />
        </Box>
      )}
    </Box>
  );
};

export default DocumentsPage;
