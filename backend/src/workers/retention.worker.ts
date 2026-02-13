import { Worker } from 'bullmq';
import { executeRetentionPolicies, sendExpirationNotifications } from '../services/retention.service';
import { logger } from '../utils/logger';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined
};

// Worker para executar políticas de retenção diariamente
const retentionWorker = new Worker(
  'retention-policies',
  async (job) => {
    logger.info('Executing retention policies job');

    try {
      // Enviar notificações primeiro (7 dias antes)
      await sendExpirationNotifications(7);

      // Executar expurgo
      const result = await executeRetentionPolicies();

      logger.info('Retention policies job completed', result);

      return result;
    } catch (error) {
      logger.error('Error in retention policies job', error);
      throw error;
    }
  },
  {
    connection: redisConfig
  }
);

retentionWorker.on('completed', (job) => {
  logger.info(`Retention job ${job.id} completed`);
});

retentionWorker.on('failed', (job, err) => {
  logger.error(`Retention job ${job?.id} failed:`, err);
});

logger.info('Retention worker started');

// Agendar execução diária
import { Queue } from 'bullmq';

const retentionQueue = new Queue('retention-policies', {
  connection: redisConfig
});

// Agendar job diário às 2h da manhã
const scheduleDailyRetention = async () => {
  // Remover jobs antigos
  await retentionQueue.clean(0, 100, 'completed');
  await retentionQueue.clean(0, 100, 'failed');

  // Adicionar job recorrente (usando cron pattern)
  // Por enquanto, adicionar job único que será re-agendado
  await retentionQueue.add(
    'daily-retention',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // Diariamente às 2h
        tz: 'America/Sao_Paulo'
      }
    }
  );

  logger.info('Daily retention job scheduled');
};

// Executar imediatamente na inicialização (para testes)
if (process.env.NODE_ENV === 'development') {
  scheduleDailyRetention().catch(console.error);
} else {
  scheduleDailyRetention().catch(console.error);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down retention worker');
  await retentionWorker.close();
  await retentionQueue.close();
  process.exit(0);
});

export { retentionWorker, retentionQueue };
