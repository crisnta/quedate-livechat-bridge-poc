import "./globals.css";
export const metadata = {
  title: { default: "Quédate · Centro Operacional", template: "%s · Quédate" },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
