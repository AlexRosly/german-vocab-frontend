import "./globals.css";
import { UiLanguageProvider } from "@/components/ui-language-provider";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><UiLanguageProvider>{children}</UiLanguageProvider></body>
    </html>
  );
}
