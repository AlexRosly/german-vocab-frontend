export type GoogleIdentityApi = {
  initialize: (options: { client_id: string; nonce: string; callback: (response: { credential?: string }) => void; auto_select: boolean; ux_mode: "popup" }) => void;
  renderButton: (parent: HTMLElement, options: { type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; shape: "rectangular"; width: number; locale: string }) => void;
};
declare global { interface Window { google?: { accounts?: { id?: GoogleIdentityApi } }; } }
let loading: Promise<GoogleIdentityApi> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<GoogleIdentityApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
    const fail = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Не удалось загрузить Google-вход")); };
    const timer = window.setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      const api = window.google?.accounts?.id;
      if (api) resolve(api); else fail();
    };
    document.head.append(script);
  }).catch(error => { loading = null; throw error; });
  return loading;
}
