import "./globals.css";

export const metadata = {
  title: "Dirty P Fantasy Football",
  description: "Dirty P Fantasy Football league history",

  icons: {
    icon: "/dirty-p-logo.png",
    apple: "/dirty-p-logo.png",
  },

  appleWebApp: {
    capable: true,
    title: "Dirty P",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
