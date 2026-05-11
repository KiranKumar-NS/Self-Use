import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoading()) {
    return new Promise<boolean>((resolve) => {
      const interval = setInterval(() => {
        if (!auth.isLoading()) {
          clearInterval(interval);
          if (auth.currentUser()) {
            resolve(true);
          } else {
            router.navigate(['/auth/login']);
            resolve(false);
          }
        }
      }, 100);
    });
  }

  if (auth.currentUser()) return true;
  return router.createUrlTree(['/auth/login']);
};
