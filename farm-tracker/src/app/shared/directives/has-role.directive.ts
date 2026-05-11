import { Directive, Input, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { UserRole } from '../../core/models/user.model';

@Directive({ selector: '[appHasRole]', standalone: true })
export class HasRoleDirective {
  private templateRef = inject(TemplateRef<any>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService);
  private hasView = false;

  @Input() set appHasRole(roles: UserRole | UserRole[]) {
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    effect(() => {
      const currentRole = this.authService.userRole();
      const shouldShow = currentRole !== null && allowedRoles.includes(currentRole);

      if (shouldShow && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!shouldShow && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}
