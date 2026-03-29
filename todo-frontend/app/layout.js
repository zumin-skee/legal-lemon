import { Special_Elite, Oswald, Caveat } from "next/font/google";
import "./globals.css";

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  subsets: ["latin"],
  weight: ["400"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata = {
  title: "Task Pad",
  description: "Your daily task pad",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${specialElite.variable} ${oswald.variable} ${caveat.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
