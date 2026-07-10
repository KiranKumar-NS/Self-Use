import { Pipe, PipeTransform } from '@angular/core';
import { ValidationErrors } from '@angular/forms';

/**
 * Maps ValidationErrors to a user-facing message so mat-error text matches
 * the actual failure (previously every error rendered as "Required").
 * Usage: <mat-error>{{ amountModel.errors | errorMessage }}</mat-error>
 */
@Pipe({ name: 'errorMessage', standalone: true })
export class ErrorMessagePipe implements PipeTransform {
  transform(errors: ValidationErrors | null | undefined): string {
    if (!errors) return '';
    if (errors['required']) return 'Required';
    if (errors['min']) return `Must be at least ${errors['min'].min}`;
    if (errors['max']) return `Must be at most ${errors['max'].max}`;
    if (errors['email']) return 'Invalid email address';
    if (errors['minlength']) return `Minimum ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `Maximum ${errors['maxlength'].requiredLength} characters`;
    if (errors['pattern']) return 'Invalid format';
    if (errors['matDatepickerParse']) return 'Invalid date';
    if (errors['matDatepickerMax']) return 'Date cannot be in the future';
    if (errors['matDatepickerMin']) return 'Date is too early';
    return 'Invalid value';
  }
}
