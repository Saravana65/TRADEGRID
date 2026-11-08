import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { ChartingController } from './charting.controller';
import { ChartingService } from './charting.service';
import { KnexChartPreferenceRepository } from './charting.repository';
import { historicalDataService } from '../research/historical-data.service';

const defaultRepo = new KnexChartPreferenceRepository();
const defaultService = new ChartingService(defaultRepo, historicalDataService);
const defaultController = new ChartingController(defaultService);

export function createChartingRouter(controller: ChartingController = defaultController): Router {
  const router = Router();

  // Protected workspace preferences routes
  router.get('/preferences', authenticate, controller.getPreferences);
  router.post('/preferences', authenticate, controller.savePreferences);
  router.delete('/preferences', authenticate, controller.resetPreferences);

  // Market technical calculations (accessible to authenticated users or public market view)
  router.get('/volume-profile', controller.getVolumeProfile);
  router.post('/calculate', controller.calculateIndicators);

  return router;
}

export const chartingRouter = createChartingRouter();
