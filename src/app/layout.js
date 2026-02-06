'use client'
 
import { usePathname } from 'next/navigation';
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { AuthProvider } from '../context/AuthProvider'
import { MealSiteProvider } from '@/components/mealSiteProvider/MealSiteProvider'
import Header from '../components/header/Header'
import { If, Then } from 'react-if';



const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  const pathname = usePathname();

  return (
    <html lang="en" suppressHydrationWarning={true}>
      <MealSiteProvider>
        <AuthProvider>
          <body className={inter.className} suppressHydrationWarning={true}>
            <If condition={!pathname.includes('login')}>
              <Then>
                <Header />
              </Then>
            </If>
              {children}
            <Script
              src="https://clients-button-widget-production.up.railway.app/widget/feedback-widget.js"
              data-api-url="https://clients-button-widget-production.up.railway.app"
              data-project="STOIC"
              data-epic="STOIC-8"
              data-client-email="kenya@ifcares.org"
              strategy="lazyOnload"
            />
          </body>
        </AuthProvider>
      </MealSiteProvider>
    </html>
  );
}
