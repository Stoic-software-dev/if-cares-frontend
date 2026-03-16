import React, { useEffect, useState } from 'react';
import useAuth from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/loadingSpinner/LoadingSpinner';

const withAuth = (WrappedComponent) => {
  const ComponentWithAuth = (props) => {
    const { auth } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      setMounted(true);
    }, []);

    useEffect(() => {
      if (mounted && !auth) {
        router.push('/auth/login');
      }
    }, [auth, mounted]);

    if (!mounted || !auth) {
      return (
        <div className="flex flex-col justify-center items-center h-screen">
          <LoadingSpinner />
          <p>Loading...</p>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };

  ComponentWithAuth.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name})`;

  return ComponentWithAuth;
};

export default withAuth;
