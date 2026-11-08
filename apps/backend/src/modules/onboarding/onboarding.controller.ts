import { Request, Response, NextFunction } from 'express';
import { OnboardingService, defaultOnboardingService } from './onboarding.service';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../middleware/error.middleware';

export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService = defaultOnboardingService) {}

  /**
   * GET /api/v1/onboarding/guide
   * Returns complete onboarding guide overview. If authenticated, attaches user's dynamic progress.
   */
  getGuide = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const guide = await this.onboardingService.getGuide(userId);
      sendSuccess(res, guide, 'TRADEGRID User Onboarding Guide retrieved');
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/onboarding/acknowledge-disclaimer
   * Records that the authenticated user acknowledged the virtual trading disclaimer.
   */
  acknowledgeDisclaimer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to acknowledge disclaimer');
      }

      const result = await this.onboardingService.acknowledgeDisclaimer(userId);
      sendSuccess(res, result, 'Virtual trading disclaimer acknowledged successfully');
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/onboarding/checklist
   * Returns dynamic proficiency checklist for the authenticated user.
   */
  getChecklist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required to view checklist progress');
      }

      const checklist = await this.onboardingService.getChecklist(userId);
      sendSuccess(res, checklist, 'User onboarding checklist progress retrieved');
    } catch (err) {
      next(err);
    }
  };
}

export const defaultOnboardingController = new OnboardingController();
