import "./globals.css";
import { UiLanguageProvider } from "@/components/ui-language-provider";
import { PublicFooter } from "@/components/public-footer";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><UiLanguageProvider>{children}<PublicFooter /></UiLanguageProvider></body>
    </html>
  );
}
