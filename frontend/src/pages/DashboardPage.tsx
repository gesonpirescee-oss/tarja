import { Box, Typography, Grid, Card, CardContent } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../services/api';

const DashboardPage = () => {
  const [stats, setStats] = useState({
    totalDocuments: 0,
    processedDocuments: 0,
    pendingReview: 0,
    totalDetections: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [documentsRes, complianceRes] = await Promise.all([
          api.get('/documents?limit=1'),
          api.get('/audit/compliance'),
        ]);

        const documents = documentsRes.data.data.documents;
        const compliance = complianceRes.data.data.statistics;

        setStats({
          totalDocuments: compliance.totalDocuments || 0,
          processedDocuments: compliance.totalProcessed || 0,
          pendingReview: 0, // TODO: Calculate from documents
          totalDetections: compliance.totalDetections || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total de Documentos
              </Typography>
              <Typography variant="h4">{stats.totalDocuments}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Processados
              </Typography>
              <Typography variant="h4">{stats.processedDocuments}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Aguardando Revisão
              </Typography>
              <Typography variant="h4">{stats.pendingReview}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Detecções Totais
              </Typography>
              <Typography variant="h4">{stats.totalDetections}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
