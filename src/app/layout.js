'use client'
 
import { usePathname } from 'next/navigation';
import { Inter } from 'next/font/google'
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
          </body>
        </AuthProvider>
      </MealSiteProvider>
    </html>
  );
}
