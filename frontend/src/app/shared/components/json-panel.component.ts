import { Component, input } from '@angular/core';

@Component({
  selector: 'app-json-panel',
  standalone: true,
  template: `
    <section class="json-panel">
      @if (title()) {
        <header>{{ title() }}</header>
      }
      <pre>{{ value() }}</pre>
    </section>
  `,
  styles: [
    `
      .json-panel {
        border-radius: 1rem;
        overflow: hidden;
        border: 1px solid rgba(18, 53, 102, 0.12);
        background: #0d1d39;
        color: #eef5ff;
      }

      header {
        padding: 0.75rem 1rem;
        font-weight: 700;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      pre {
        margin: 0;
        padding: 1rem;
        overflow: auto;
        font-size: 0.88rem;
        line-height: 1.5;
      }
    `,
  ],
})
export class JsonPanelComponent {
  readonly title = input('');
  readonly value = input.required<string>();
}
