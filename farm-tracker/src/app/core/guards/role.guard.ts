import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.whenReady();

    const role = auth.userRole();
    if (role && allowedRoles.includes(role)) return true;
    return router.createUrlTree(['/dashboard']);
  };
}
