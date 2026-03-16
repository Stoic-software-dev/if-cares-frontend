'use client'

import { useEffect, useCallback, useContext } from 'react'
import { createContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MealSiteContext } from '@/components/mealSiteProvider/MealSiteProvider'
import { API_BASE_URL } from '@/constants'

const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const storedUserJson = typeof window !== 'undefined' ? window.localStorage.getItem("user"): ""
  const localStorageValue = storedUserJson ? JSON.parse(storedUserJson) : null;
  const [auth, setAuth] = useState(localStorageValue)
  const [authReady, setAuthReady] = useState(!localStorageValue)
  const router  = useRouter()
  const { resetAllStates } = useContext(MealSiteContext)

  // Centralized logout function
  const logout = useCallback(() => {
    resetAllStates(); // Clear all MealSite state first
    localStorage.removeItem('user');
    setAuth(null);
    setAuthReady(true);
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

  // Refresh user data from backend on mount
  useEffect(() => {
    if (!localStorageValue || !localStorageValue.email) {
      setAuthReady(true);
      return;
    }

    const refreshUserData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}?type=refreshUser&email=${encodeURIComponent(localStorageValue.email)}`);
        const data = await response.json();
        if (data.result === 'success' && data.data) {
          const updatedUser = { ...localStorageValue, assignedSite: data.data.assignedSite, role: data.data.role };
          setAuth(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      } catch (error) {
        // Silent fail - keep using cached data
      } finally {
        setAuthReady(true);
      }
    };

    refreshUserData();
  }, [])

  useEffect(() => {
    if (authReady && !auth) {
      router.push('/auth/login');
    }

  }, [auth, authReady, router])


  return (
    <AuthContext.Provider value={{ auth, setAuth, logout }}>
      {authReady ? children : null}
    </AuthContext.Provider>
  )
}

export default AuthContext