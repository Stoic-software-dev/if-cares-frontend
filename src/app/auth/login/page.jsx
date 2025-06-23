'use client';

import { useRef, useState, useEffect } from 'react';
import axios from 'axios';

import useAuth from '../../../hooks/useAuth';

import LoadingSpinner from '../../../components/loadingSpinner/LoadingSpinner';

import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/constants';
import Image from 'next/image';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { setAuth } = useAuth();
  const router = useRouter();

  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // const from = location.state?.from?.pathname || '/home'
  const PROXY_URL = 'https://happy-mixed-gaura.glitch.me/';

  // const handleSubmit = (e) => {
  //   e.preventDefault();
  //   setError(null);
  //   setLoading(true);
  //   const email = emailRef.current.value;
  //   const password = passwordRef.current.value;

  //   const body = {
  //     actionType: 'login',
  //     email,
  //     password,
  //   };

  //   axios
  //     .post(PROXY_URL + GAS_URL, JSON.stringify(body), {
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'x-requested-with': 'XMLHttpRequest',
  //       },
  //     })
  //     .then(({ data: response }) => {
  //       const { result, message, data } = response;
  //       if (result === 'success') {
  //         const currentTime = new Date().getTime();
  //         const expirationTime =
  //           currentTime + 2 * 60 * 60 * 1000;
  //         setLoading(false);
  //         data.expirationTime = expirationTime
  //         setAuth(data);
  //         localStorage.setItem('user', JSON.stringify(data));
  //         router.push('/');
  //       } else {
  //         setError(message);
  //         setLoading(false);
  //       }
  //     });
  // };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = emailRef.current.value;
    const password = passwordRef.current.value;

    const body = {
      actionType: 'login',
      email,
      password,
    };

    try {
      // Making the fetch request using async/await
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      const { result, message, data: responseData } = data;
      if (result === 'success') {
        const currentTime = new Date().getTime();
        const expirationTime = currentTime + 2 * 60 * 60 * 1000; // 2 hours
        responseData.expirationTime = expirationTime;
        setLoading(false);
        setAuth(responseData);
        localStorage.setItem('user', JSON.stringify(responseData));
        router.push('/');
      } else {
        setError(message);
        setLoading(false);
      }
    } catch (error) {
      // Handle any network or unexpected errors
      await logErrorMonitoring({
        function_name: 'handleSubmit - login',
        error: error,
        row_error: error?.stack,
      });
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    emailRef.current.focus();
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center justify-center px-6 py-8 mx-auto md:h-screen lg:py-0">
        <div className="flex items-center mb-5 text-2xl font-semibold text-gray-900">
          <Image src="/web-logo.png" alt="logo" width={200} height={200} />
        </div>
        <div className="w-full bg-white rounded-lg shadow dark:border md:mt-0 sm:max-w-md xl:p-0 dark:bg-gray-800 dark:border-gray-700">
          <div className="p-6 space-y-4 md:space-y-6 sm:p-8">
            <h2 className="text-xl font-bold leading-tight tracking-tight text-gray-900 md:text-2xl ">
              Sign in to your account
            </h2>
            <form className="space-y-4 md:space-y-6" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block mb-2 text-sm font-medium text-gray-900"
                >
                  Your email
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  name="email"
                  id="email"
                  className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 block w-full p-2.5"
                  placeholder="name@company.com"
                  required=""
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block mb-2 text-sm font-medium text-gray-900"
                >
                  Password
                </label>
                <input
                  ref={passwordRef}
                  type="password"
                  name="password"
                  id="password"
                  placeholder="••••••••"
                  className="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 block w-full p-2.5"
                  required=""
                />
              </div>
              <button
                disabled={loading}
                type="submit"
                className="w-full text-white bg-purple-600 hover:bg-purple-700 focus:ring-4 focus:outline-none focus:ring-purple-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
              >
                Sign in
              </button>
            </form>
            <div className="flex justify-center items-center">
              {loading && <LoadingSpinner />}
              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
