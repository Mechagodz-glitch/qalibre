import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { entityConfigList } from './core/entity-config';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly datasetRoutePrefixes = entityConfigList.map((config) => `/${config.route}`);
  private readonly currentUrl = signal(this.router.url || '/');

  protected readonly primaryNav = [
    { label: 'Dashboard', route: '/', exact: true, pageKey: 'dashboard', icon: 'dashboard' },
    { label: 'Generator', route: '/test-generator', exact: true, pageKey: 'generator', icon: 'generator' },
    { label: 'Generation Runs', route: '/test-generator/runs', exact: true, pageKey: 'generationRuns', icon: 'runs' },
    { label: 'Test Suites', route: '/test-generator/review', exact: true, pageKey: 'testSuites', icon: 'suites' },
    { label: 'Manual Execution', route: '/manual-execution', exact: true, pageKey: 'manualExecution', icon: 'execution' },
    { label: 'Knowledge Base', route: '/knowledge-base', exact: true, pageKey: 'knowledgeBase', icon: 'knowledge' },
    { label: 'Testcase Library', route: '/test-generator/export', exact: true, pageKey: 'exports', icon: 'exports' },
    { label: 'Admin', route: '/admin', exact: true, pageKey: 'admin', icon: 'admin' },
  ];

  protected readonly visiblePrimaryNav = computed(() =>
    this.primaryNav.filter((item) => this.auth.canAccessPage(item.pageKey) || item.pageKey === 'dashboard'),
  );

  protected readonly currentUser = this.auth.currentUser;
  protected readonly authLoading = this.auth.loading;
  protected readonly showShell = computed(() => {
    const url = this.currentUrl();
    return !url.startsWith('/login') && !url.startsWith('/auth/callback');
  });

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
  }

  protected isNavActive(route: string) {
    const url = this.router.url;

    if (route === '/') {
      return url === '/';
    }

    if (route === '/test-generator') {
      return url === '/test-generator' || (url.startsWith('/test-generator') && !url.startsWith('/test-generator/review') && !url.startsWith('/test-generator/runs') && !url.startsWith('/test-generator/export'));
    }

    if (route === '/test-generator/review') {
      return url.startsWith('/test-generator/review');
    }

    if (route === '/knowledge-base') {
      return url.startsWith('/knowledge-base') || this.datasetRoutePrefixes.some((prefix) => url.startsWith(prefix));
    }

    if (route === '/manual-execution') {
      return url.startsWith('/manual-execution');
    }

    if (route === '/test-generator/export') {
      return url.startsWith('/test-generator/export');
    }

    if (route === '/test-generator/runs') {
      return url.startsWith('/test-generator/runs');
    }

    if (route === '/admin') {
      return url.startsWith('/admin');
    }
    return url.startsWith(route);
  }

  protected async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
