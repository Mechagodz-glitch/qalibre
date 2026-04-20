import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <section class="empty-state">
      <h3>{{ title() }}</h3>
      <p>{{ description() }}</p>
    </section>
  `,
  styles: [
    `
      .empty-state {
        padding: 2rem;
        text-align: center;
        border-radius: 1rem;
        border: 1px dashed rgba(17, 44, 83, 0.2);
        background: rgba(255, 255, 255, 0.78);
        color: #29415c;
      }

      h3 {
        margin: 0 0 0.35rem;
      }

      p {
        margin: 0;
      }
    `,
  ],
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
}
