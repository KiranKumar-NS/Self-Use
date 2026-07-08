import { trigger, transition, style, animate, query } from '@angular/animations';

export const routeAnimation = trigger('routeAnimation', [
  transition('* <=> *', [
    query(':enter', [
      style({ opacity: 0 }),
      animate('200ms ease-in', style({ opacity: 1 })),
    ], { optional: true }),
  ]),
]);
