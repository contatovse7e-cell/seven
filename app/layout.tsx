import type { ReactNode } from "react";

export const metadata = { title: "Fábrica de Vídeos" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "0 auto", padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
