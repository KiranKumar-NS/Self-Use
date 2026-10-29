import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/** Styles for note HTML set via innerHTML (not reachable by emulated encapsulation). Scoped by `.note-content`. */
export const NOTE_CONTENT_CSS = `
  .note-content h2 { font-size: 1.35rem; font-weight: 700; margin: 0.8em 0 0.4em; }
  .note-content h3 { font-size: 1.1rem; font-weight: 600; margin: 0.7em 0 0.3em; }
  .note-content p, .note-content div { margin: 0 0 0.4em; }
  .note-content ul, .note-content ol { margin: 0 0 0.5em; padding-left: 1.6em; }
  .note-content blockquote { margin: 0.5em 0; padding: 0.4em 0.9em; border-left: 3px solid #94a3b8; background: rgba(148,163,184,0.12); border-radius: 0 6px 6px 0; }
  .note-content mark { background: #fde68a; color: inherit; padding: 0 2px; border-radius: 2px; }
  .note-content a { color: #2563eb; text-decoration: underline; }
  .note-content hr { border: none; border-top: 1px solid #cbd5e1; margin: 1em 0; }
  .note-content ul.checklist { list-style: none; padding-left: 1.8em; }
  .note-content ul.checklist > li { position: relative; }
  .note-content ul.checklist > li::before {
    content: ''; position: absolute; left: -1.5em; top: 0.25em; width: 1em; height: 1em;
    border: 2px solid #64748b; border-radius: 3px; box-sizing: border-box; cursor: pointer;
  }
  .note-content ul.checklist > li.checked { color: #78879b; text-decoration: line-through; }
  .note-content ul.checklist > li.checked::before {
    background: #16a34a; border-color: #16a34a;
    content: '✓'; color: #fff; font-size: 0.75em; line-height: 1.1em; text-align: center; font-weight: 700;
  }
`;

@Component({
  selector: 'app-note-content-styles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: '',
  styles: [NOTE_CONTENT_CSS],
})
export class NoteContentStylesComponent {}
