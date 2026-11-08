import { Router } from 'express';
import { OnboardingController, defaultOnboardingController } from './onboarding.controller';
import { authenticate } from '../../middleware/auth.middleware';

export function createOnboardingRouter(
  onboardingController: OnboardingController = defaultOnboardingController
): Router {
  const router = Router();

  // Public/optional auth guide
  router.get('/guide', (req, res, next) => {
    // If auth header is present, authenticate to attach user context, otherwise proceed
    if (req.headers.authorization) {
      authenticate(req, res, () => onboardingController.getGuide(req, res, next));
    } else {
      onboardingController.getGuide(req, res, next);
    }
  });

  // Authenticated actions
  router.post('/acknowledge-disclaimer', authenticate, onboardingController.acknowledgeDisclaimer);
  router.get('/checklist', authenticate, onboardingController.getChecklist);

  return router;
}

export const onboardingRouter = createOnboardingRouter();
