import "./globals.css";
import AppNavigation from "./components/AppNavigation";

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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
