import "./globals.css";

export const metadata = {
  title: "Dirty P Fantasy Football",
  description: "Dirty P Fantasy Football league history",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
