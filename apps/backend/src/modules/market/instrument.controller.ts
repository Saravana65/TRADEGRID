import { Request, Response, NextFunction } from 'express';
import { instrumentService, InstrumentService } from './instrument.service';
import { sendSuccess } from '../../utils/response';

export class InstrumentController {
  constructor(private readonly service: InstrumentService = instrumentService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.listInstruments(req.query as any);
      sendSuccess(res, result, 'Instruments retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getBySymbol = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { symbol } = req.params;
      const exchange = req.query.exchange as string | undefined;
      const instrument = await this.service.getInstrumentBySymbol(symbol, exchange);
      sendSuccess(res, { instrument }, `Instrument ${symbol.toUpperCase()} retrieved successfully`, 200);
    } catch (error) {
      next(error);
    }
  };

  getSectors = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sectors = await this.service.getSectors();
      sendSuccess(res, { sectors }, 'Sectors retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  getExchanges = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const exchanges = await this.service.getExchanges();
      sendSuccess(res, { exchanges }, 'Exchanges retrieved successfully', 200);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const instrument = await this.service.createInstrument(req.body);
      sendSuccess(
        res,
        { instrument },
        `Instrument ${instrument.symbol} created successfully on ${instrument.exchange}`,
        201
      );
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const instrument = await this.service.updateInstrument(id, req.body);
      sendSuccess(res, { instrument }, `Instrument #${id} updated successfully`, 200);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = parseInt(req.params.id, 10);
      const { marketStatus } = req.body;
      const instrument = await this.service.updateInstrumentStatus(id, marketStatus);
      sendSuccess(res, { instrument }, `Instrument #${id} status changed to ${marketStatus}`, 200);
    } catch (error) {
      next(error);
    }
  };
}

export const instrumentController = new InstrumentController();
