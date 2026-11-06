import { Router } from 'express';
import { instrumentQuerySchema } from '@tradegrid/validation';
import {
  instrumentController as defaultInstrumentController,
  InstrumentController,
} from './instrument.controller';
import { validateQuery } from '../../middleware/validate.middleware';

export function createInstrumentRouter(
  controller: InstrumentController = defaultInstrumentController
): Router {
  const router = Router();

  // Public/Authenticated list and search instruments
  router.get('/', validateQuery(instrumentQuerySchema), controller.list);
  router.get('/meta/sectors', controller.getSectors);
  router.get('/meta/exchanges', controller.getExchanges);
  router.get('/:symbol', controller.getBySymbol);

  return router;
}

export const instrumentRouter = createInstrumentRouter();
