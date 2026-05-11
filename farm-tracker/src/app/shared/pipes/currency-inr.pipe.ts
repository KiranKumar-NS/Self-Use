import { Pipe, PipeTransform } from '@angular/core';
import { formatCurrency } from '../../core/utils/firestore.utils';

@Pipe({ name: 'currencyInr', standalone: true })
export class CurrencyInrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null) return formatCurrency(0);
    return formatCurrency(value);
  }
}
