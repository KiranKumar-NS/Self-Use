import {
  ChangeDetectionStrategy, Component, ElementRef, SecurityContext, afterRenderEffect, inject, input, output, untracked, viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface RichTextChange {
  html: string;
  text: string;
}

const TEXT_COLORS = ['#1e293b', '#dc2626', '#d97706', '#16a34a', '#2563eb', '#7c3aed'];

/**
 * Dependency-free rich text editor (contenteditable + execCommand).
 * Content is reloaded only when `docKey` changes, so typing never resets the caret.
 * Output HTML is limited to tags Angular's sanitizer keeps (no inline styles):
 * colour uses <font color>, highlight uses <mark>, checklists are <ul class="checklist">.
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rte">
      <div class="toolbar" (mousedown)="$event.preventDefault()">
        <button type="button" matTooltip="Heading" (click)="block('H2')"><b>H1</b></button>
        <button type="button" matTooltip="Sub-heading" (click)="block('H3')"><b>H2</b></button>
        <button type="button" matTooltip="Normal text" (click)="block('P')"><mat-icon>notes</mat-icon></button>
        <span class="sep"></span>
        <button type="button" matTooltip="Bold (Ctrl+B)" (click)="cmd('bold')"><mat-icon>format_bold</mat-icon></button>
        <button type="button" matTooltip="Italic (Ctrl+I)" (click)="cmd('italic')"><mat-icon>format_italic</mat-icon></button>
        <button type="button" matTooltip="Underline (Ctrl+U)" (click)="cmd('underline')"><mat-icon>format_underlined</mat-icon></button>
        <button type="button" matTooltip="Strikethrough" (click)="cmd('strikeThrough')"><mat-icon>strikethrough_s</mat-icon></button>
        <button type="button" matTooltip="Highlight" (click)="highlight()"><mat-icon>ink_highlighter</mat-icon></button>
        <span class="colors">
          @for (c of colors; track c) {
            <button type="button" class="swatch" [style.background]="c" [matTooltip]="'Text colour'" (click)="cmd('foreColor', c)"></button>
          }
        </span>
        <span class="sep"></span>
        <button type="button" matTooltip="Bulleted list" (click)="cmd('insertUnorderedList')"><mat-icon>format_list_bulleted</mat-icon></button>
        <button type="button" matTooltip="Numbered list" (click)="cmd('insertOrderedList')"><mat-icon>format_list_numbered</mat-icon></button>
        <button type="button" matTooltip="Checklist" (click)="checklist()"><mat-icon>checklist</mat-icon></button>
        <button type="button" matTooltip="Quote" (click)="block('BLOCKQUOTE')"><mat-icon>format_quote</mat-icon></button>
        <button type="button" matTooltip="Divider" (click)="cmd('insertHorizontalRule')"><mat-icon>horizontal_rule</mat-icon></button>
        <button type="button" matTooltip="Link" (click)="link()"><mat-icon>link</mat-icon></button>
        <button type="button" matTooltip="Clear formatting" (click)="clearFormat()"><mat-icon>format_clear</mat-icon></button>
        <span class="sep"></span>
        <button type="button" matTooltip="Undo (Ctrl+Z)" (click)="cmd('undo')"><mat-icon>undo</mat-icon></button>
        <button type="button" matTooltip="Redo (Ctrl+Y)" (click)="cmd('redo')"><mat-icon>redo</mat-icon></button>
      </div>
      <div #area class="area note-content" contenteditable="true" spellcheck="true"
        [attr.data-placeholder]="placeholder()"
        (input)="emit()" (paste)="onPaste($event)" (click)="onClick($event)"></div>
    </div>
  `,
  styles: [`
    .rte { border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); display: flex; flex-direction: column; min-height: 0; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 4px 6px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-alt); border-radius: 8px 8px 0 0; position: sticky; top: 0; z-index: 1; }
    .toolbar button { border: none; background: transparent; cursor: pointer; height: 32px; min-width: 32px; padding: 0 4px; border-radius: 6px; color: var(--color-text-subtle); display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; }
    .toolbar button:hover { background: var(--color-border); color: var(--color-text); }
    .toolbar mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .sep { width: 1px; height: 20px; background: var(--color-border); margin: 0 4px; }
    .colors { display: inline-flex; gap: 2px; margin-left: 2px; }
    .toolbar .swatch { min-width: 16px; width: 16px; height: 16px; padding: 0; border-radius: 50%; border: 1px solid var(--color-border); }
    .area { flex: 1; min-height: 320px; padding: 12px 16px; outline: none; overflow-wrap: anywhere; line-height: 1.6; font-size: 0.95rem; color: var(--color-text); }
    .area:empty::before { content: attr(data-placeholder); color: var(--color-text-muted); pointer-events: none; }
  `],
})
export class RichTextEditorComponent {
  private sanitizer = inject(DomSanitizer);

  /** Changing this reloads `html` into the editor (e.g. switching notes). */
  docKey = input.required<string>();
  html = input<string>('');
  placeholder = input<string>('Start writing…');
  changed = output<RichTextChange>();

  private area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  readonly colors = TEXT_COLORS;

  constructor() {
    afterRenderEffect(() => {
      this.docKey();
      const el = this.area().nativeElement;
      const html = untracked(() => this.html());
      el.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    });
  }

  focus(): void {
    this.area().nativeElement.focus();
  }

  cmd(command: string, value?: string): void {
    this.area().nativeElement.focus();
    document.execCommand(command, false, value);
    this.emit();
  }

  block(tag: 'H2' | 'H3' | 'P' | 'BLOCKQUOTE'): void {
    this.cmd('formatBlock', `<${tag}>`);
  }

  highlight(): void {
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    if (!text) return;
    this.cmd('insertHTML', `<mark>${escapeHtml(text)}</mark>&#8203;`);
  }

  checklist(): void {
    this.area().nativeElement.focus();
    document.execCommand('insertUnorderedList');
    const ul = this.closestInArea(window.getSelection()?.anchorNode ?? null, 'UL');
    if (ul) ul.classList.add('checklist');
    this.emit();
  }

  link(): void {
    const url = prompt('Link address (https://…)');
    if (!url) return;
    const safe = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    this.cmd('createLink', safe);
  }

  clearFormat(): void {
    this.cmd('removeFormat');
    this.cmd('formatBlock', '<P>');
  }

  /** Paste as plain text so web/WhatsApp formatting doesn't bloat the note. */
  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain');
    if (text == null) return;
    event.preventDefault();
    document.execCommand('insertText', false, text);
    this.emit();
  }

  /** Clicking the box area of a checklist item toggles it. */
  onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && (event.ctrlKey || event.metaKey)) {
      window.open((target as HTMLAnchorElement).href, '_blank', 'noopener');
      return;
    }
    if (target.tagName !== 'LI' || !target.parentElement?.classList.contains('checklist')) return;
    if (event.clientX - target.getBoundingClientRect().left > 0) return; // box sits in the left gutter
    target.classList.toggle('checked');
    this.emit();
  }

  emit(): void {
    const el = this.area().nativeElement;
    // Browsers leave a stray <br> behind when everything is deleted.
    const text = (el.innerText || '').replace(/​/g, '').trim();
    this.changed.emit({ html: text ? el.innerHTML : '', text });
  }

  private closestInArea(node: Node | null, tag: string): HTMLElement | null {
    const root = this.area().nativeElement;
    let cur: Node | null = node;
    while (cur && cur !== root) {
      if (cur instanceof HTMLElement && cur.tagName === tag) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
