"use client";
import Link from "next/link";
import { useI18n } from "@/components/ui-language-provider";

export default function NotFound() {
  const { t } = useI18n();
  return <main className="not-found"><p className="eyebrow">WORTKARTEN · 404</p>
    <h1>{t("Страница не найдена")}</h1><Link href="/">{t("Вернуться на главную")}</Link>
  </main>;
}
