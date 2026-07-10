import { ChangeDetectionStrategy, Component, OnInit, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { TagService } from '../../../core/services/tag.service';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatChipsModule, MatAutocompleteModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="full-width">
      <mat-label>Tags (optional)</mat-label>
      <mat-chip-grid #chipGrid>
        @for (tag of tags(); track tag) {
          <mat-chip-row (removed)="removeTag(tag)">
            {{ tag }}
            <button matChipRemove><mat-icon>cancel</mat-icon></button>
          </mat-chip-row>
        }
      </mat-chip-grid>
      <input matInput
        [matChipInputFor]="chipGrid"
        [matChipInputSeparatorKeyCodes]="separatorKeys"
        [matChipInputAddOnBlur]="true"
        (matChipInputTokenEnd)="addCustomTag($event)"
        [matAutocomplete]="tagAuto"
        [(ngModel)]="inputValue"
        (ngModelChange)="filterSuggestions()"
        [placeholder]="placeholder()" />
      <mat-autocomplete #tagAuto="matAutocomplete" (optionSelected)="addSuggestedTag($event)">
        @for (s of filtered(); track s) {
          <mat-option [value]="s">{{ s }}</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  `,
  styles: [`
    .full-width { width: 100%; }
  `],
})
export class TagInputComponent implements OnInit {
  tags = model<string[]>([]);
  placeholder = input('Add tags...');

  private tagService = inject(TagService);

  readonly separatorKeys = [ENTER, COMMA];
  inputValue = signal('');
  filtered = signal<string[]>([]);
  private allSuggestions: string[] = [];

  async ngOnInit() {
    this.allSuggestions = await this.tagService.getTags();
    this.filterSuggestions();
  }

  filterSuggestions() {
    const term = this.inputValue().trim().toLowerCase();
    const selected = new Set(this.tags().map((t) => t.toLowerCase()));
    let results = this.allSuggestions.filter((s) => !selected.has(s));
    if (term) {
      results = results.filter((s) => s.includes(term));
    }
    this.filtered.set(results);
  }

  addCustomTag(event: MatChipInputEvent) {
    const value = (event.value || '').trim().toLowerCase();
    if (value && !this.tags().includes(value)) {
      this.tags.update((tags) => [...tags, value]);
    }
    event.chipInput.clear();
    this.inputValue.set('');
    this.filterSuggestions();
  }

  addSuggestedTag(event: MatAutocompleteSelectedEvent) {
    const value = event.option.value as string;
    if (value && !this.tags().includes(value)) {
      this.tags.update((tags) => [...tags, value]);
    }
    this.inputValue.set('');
    this.filterSuggestions();
  }

  removeTag(tag: string) {
    this.tags.update((tags) => tags.filter((t) => t !== tag));
    this.filterSuggestions();
  }
}
