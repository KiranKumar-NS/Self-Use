import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (auth.isLoading()) {
      return new Promise<boolean>((resolve) => {
        const interval = setInterval(() => {
          if (!auth.isLoading()) {
            clearInterval(interval);
            const role = auth.userRole();
            if (role && allowedRoles.includes(role)) {
              resolve(true);
            } else {
              router.navigate(['/dashboard']);
              resolve(false);
            }
          }
        }, 100);
      });
    }

    const role = auth.userRole();
    if (role && allowedRoles.includes(role)) return true;
    return router.createUrlTree(['/dashboard']);
  };
}
