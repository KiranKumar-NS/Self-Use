import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models';

@Directive({ selector: '[appRoleVisible]', standalone: true })
export class RoleVisibleDirective {
  private readonly auth = inject(AuthService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  readonly appRoleVisible = input.required<UserRole[]>();

  private isRendered = false;

  constructor() {
    effect(() => {
      const roles = this.appRoleVisible();
      const hasRole = this.auth.hasRole(roles);

      if (hasRole && !this.isRendered) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.isRendered = true;
      } else if (!hasRole && this.isRendered) {
        this.viewContainer.clear();
        this.isRendered = false;
      }
    });
  }
}
