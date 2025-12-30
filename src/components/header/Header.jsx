'use client';
import { useEffect, useState } from 'react';
import useAuth from '../../hooks/useAuth';
import './Header.css';
import Link from 'next/link';

const Header = () => {
  const { auth, logout } = useAuth();

  const [authData, setAuthData] = useState(null);
  useEffect(() => {
    if (auth != null) {
      setAuthData(auth);
    }
  }, [auth]);

  return authData == null ? (
    <></>
  ) : (
    <header className="fixed md:relative z-10 bottom-0 w-full h-16 md:h-14 bg-[#5D24FF] shadow text-white flex justify-center">
      <div className='h-16 md:h-14 flex items-center justify-between md:justify-end px-4 w-full md:px-0 md:w-4/5'>
      <div className='mr-4 md:mr-0' style={{ flexGrow: 1 }}>
        <Link className="justify-self-start " href="/">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
            />
          </svg>
        </Link>
      </div>
      <div className="text-sm ml-2 md:ml-0 sm:text-base md:text-xs text-left md:text-right">
        <p>{`${authData.name} ${authData.lastname}`}</p>
        <p className="truncate w-48 xs:w-auto xs:no-truncate">
          {authData.email}
        </p>
      </div>

      <div
        className="ml-4 flex items-center space-x-2 text-lg sm:text-base hover:text-slate-400 hover:cursor-pointer"
        onClick={logout}
      >
        <span className="mt-1">Logout</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6 mt-[6px] ml-2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
          />
        </svg>
      </div>
      </div>
    </header>
  );
};

export default Header;
