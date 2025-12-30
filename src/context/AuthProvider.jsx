'use client'

import { useEffect, useCallback, useContext } from 'react'
import { createContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MealSiteContext } from '@/components/mealSiteProvider/MealSiteProvider'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const storedUserJson = typeof window !== 'undefined' ? window.localStorage.getItem("user"): ""
  const localStorageValue = storedUserJson ? JSON.parse(storedUserJson) : null;
  const [auth, setAuth] = useState(localStorageValue)
  const router  = useRouter()
  const { resetAllStates } = useContext(MealSiteContext)

  // Centralized logout function
  const logout = useCallback(() => {
    resetAllStates(); // Clear all MealSite state first
    localStorage.removeItem('user');
    setAuth(null);
    router.push('/auth/login');
  }, [resetAllStates, router])

  // Check session expiration
  useEffect(() => {
    const checkSessionExpiration = () => {
      const storedUserJson = window.localStorage.getItem('user');
      if (!storedUserJson) return;

      const user = JSON.parse(storedUserJson);
      if (user && user.expirationTime) {
        const currentTime = new Date().getTime();
        if (currentTime > user.expirationTime) {
          logout(); // Clear session and redirect
        }
      }
    };

    // Check immediately on mount
    checkSessionExpiration();

    // Check every 5 minutes
    const interval = setInterval(checkSessionExpiration, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [logout])

  useEffect(() => {
    if (!auth) {
      router.push('/auth/login');
    }

  }, [auth, router])


  return (
    <AuthContext.Provider value={{ auth, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext