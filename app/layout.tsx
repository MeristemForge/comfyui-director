import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://comfyui-director.wujin-developer.chatgpt.site'),
  title: '导演台 · ComfyUI 视频工作台',
  description: '面向 H3 与多视频模型的轻量 ComfyUI 导演工作台',
  openGraph: {
    title: '导演台 · ComfyUI 视频工作台',
    description: '面向 H3 与多视频模型的轻量 ComfyUI 视频导演工作台',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '导演台 · ComfyUI 视频工作台',
    description: '面向 H3 与多视频模型的轻量 ComfyUI 视频导演工作台',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
