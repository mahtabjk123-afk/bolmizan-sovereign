export interface ServiceWorkerEnvironment {
    production: boolean;
    secureContext: boolean;
    supported: boolean;
}

export function shouldRegisterServiceWorker(environment: ServiceWorkerEnvironment): boolean {
    return environment.production && environment.secureContext && environment.supported;
}

export function registerServiceWorker(production: boolean): void {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const shouldRegister = shouldRegisterServiceWorker({
        production,
        secureContext: window.isSecureContext,
        supported: 'serviceWorker' in navigator,
    });
    if (!shouldRegister) return;

    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
            console.warn('Offline app-shell registration failed.', error);
        });
    }, { once: true });
}
