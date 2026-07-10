import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady();

  if (auth.currentUser()) {
    if (auth.userProfile()?.isActive === false) {
      auth.logout();
      return router.createUrlTree(['/auth/login']);
    }
    return true;
  }
  return router.createUrlTree(['/auth/login']);
};
