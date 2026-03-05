import { configService } from './config';

type ThemeType = 'light' | 'dark' | 'system';

class ThemeService {
  private mediaQuery: MediaQueryList | null = null;
  private currentTheme: ThemeType = 'system';
  private appliedTheme: 'light' | 'dark' | null = null;
  private initialized = false;
  private mediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }
  }

  // 初始化主题
  initialize(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      const config = configService.getConfig();
      this.setTheme(config.theme);

      // 监听系统主题变化
      if (this.mediaQuery) {
        this.mediaQueryListener = (e) => {
          if (this.currentTheme === 'system') {
            this.applyTheme(e.matches ? 'dark' : 'light');
          }
        };
        this.mediaQuery.addEventListener('change', this.mediaQueryListener);
      }
    } catch (error) {
      console.error('Failed to initialize theme:', error);
      // 默认使用系统主题
      this.setTheme('system');
    }
  }

  // 设置主题
  setTheme(theme: ThemeType): void {
    const effectiveTheme = theme === 'system'
      ? (this.mediaQuery?.matches ? 'dark' : 'light')
      : theme;

    if (this.currentTheme === theme && this.appliedTheme === effectiveTheme) {
      return;
    }

    console.log(`Setting theme to: ${theme}`);
    this.currentTheme = theme;

    if (theme === 'system') {
      // 如果是系统主题，则根据系统设置应用
      console.log(`System theme detected, using: ${effectiveTheme}`);
    }

    // 直接应用指定主题
    this.applyTheme(effectiveTheme);
  }

  // 获取当前主题
  getTheme(): ThemeType {
    return this.currentTheme;
  }

  // 获取当前有效主题（实际应用的明/暗主题）
  getEffectiveTheme(): 'light' | 'dark' {
    if (this.currentTheme === 'system') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return this.currentTheme;
  }

  // 应用主题到DOM - CSS变量会自动根据.dark/.light class切换
  private applyTheme(theme: 'light' | 'dark'): void {
    // 避免重复应用相同主题
    if (this.appliedTheme === theme) {
      return;
    }

    console.log(`Applying theme: ${theme}`);
    this.appliedTheme = theme;
    const root = document.documentElement;
    const opposite = theme === 'dark' ? 'light' : 'dark';

    // Toggle class on html, body, and #root
    root.classList.add(theme);
    root.classList.remove(opposite);

    document.body.classList.add(theme);
    document.body.classList.remove(opposite);

    const rootElement = document.getElementById('root');
    if (rootElement) {
      rootElement.classList.add(theme);
      rootElement.classList.remove(opposite);
    }

    // Transition animation
    root.style.setProperty('--theme-transition', 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease');
    document.body.style.transition = 'var(--theme-transition)';
  }
}

export const themeService = new ThemeService();
