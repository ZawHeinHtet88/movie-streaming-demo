import "./globals.css";

export const metadata = {
  title: "Local HLS Studio",
  description: "Upload a video, convert it to HLS, and play it locally."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
