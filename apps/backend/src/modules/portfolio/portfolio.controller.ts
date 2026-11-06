import { Request, Response } from 'express';
import { portfolioService, PortfolioService } from './portfolio.service';
import { sendSuccess } from '../../utils/response';

export class PortfolioController {
  constructor(private readonly service: PortfolioService = portfolioService) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user.id;
    const summary = await this.service.getPortfolioSummary(userId);
    sendSuccess(res, summary, 'Portfolio summary retrieved successfully');
  };
}

export const portfolioController = new PortfolioController();
