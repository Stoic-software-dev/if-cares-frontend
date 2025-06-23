'use client';

import React, { useContext, useEffect, useState } from 'react';
import './Welcome.css';
import { Button } from 'flowbite-react';
import withAuth from '@/hoc/hocauth';
import useAuth from '@/hooks/useAuth';
import { API_BASE_URL, ROLES } from '../constants/index';
import Link from 'next/link';

import axios from 'axios';
import WelcomeCalendar from '@/components/welcomeCalendar/WelcomeCalendar';
import SitesDropdown from '@/components/sitesDropdown/SitesDropdown';
import LoadingSpinner from '@/components/loadingSpinner/LoadingSpinner';
import FileDownloadButton from '@/components/fileDownloadButton/FileDownloadButton';
import { MealSiteContext } from '@/components/mealSiteProvider/MealSiteProvider';
import { logErrorMonitoring } from '@/utils';

const Welcome = () => {
  const { auth } = useAuth();
  const { name, lastname, role, assignedSite } = auth;
  const { sitesData, sitesDataLoading } = useContext(MealSiteContext);

  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(
    role === ROLES.Admin ? '' : assignedSite
  );

  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const GAS_URL = API_BASE_URL;

  useEffect(() => {
    axios
      .get(GAS_URL + '?type=sites')
      .then((response) => {
        setSites(response.data);
      })
      .catch((error) => {
        console.error('Error fetching data:', error);
        logErrorMonitoring({
          function_name: 'fetchSites - Welcome',
          error: error,
          row_error: error?.stack,
        });
      });
  }, []);

  useEffect(() => {
    setLoadingFiles(true);
    axios
      .get(API_BASE_URL + '?type=listFiles')
      .then((response) => {
        setFiles(response.data);
        setLoadingFiles(false);
      })
      .catch((error) => {
        console.error('Error fetching files:', error);
        logErrorMonitoring({
          function_name: 'fetchListFiles - Welcome',
          error: error,
          row_error: error?.stack,
        });
        setLoadingFiles(false);
      });
  }, []);

  return (
    <div className="welcome-body">
      <div className="welcome-buttons-container">
        <Link href="/mealCount">
          <Button
            variant="contained"
            className="text-transform[capitalize] text-normal font-bold bg-[#46DC8C] text-black rounded-[13px] min-w-[140px] min-h-[40px] shadow-none meal-count-btn"
            style={{
              textTransform: 'capitalize',
              backgroundColor: '#46DC8C',
              borderRadius: '13px',
              minWidth: '140px',
              minHeight: '40px',
              boxShadow: 'none',
            }}
          >
            Meal Count
          </Button>
        </Link>
        <div className="hidden sm:block">
          <h3 className="welcome-text">Welcome Back,</h3>
          <h5 className="full-name-text flex justify-center">
            {name + ' ' + lastname}
          </h5>
        </div>
        <Link href="/home">
          <Button
            variant="contained"
            className="text-transform[capitalize] text-normal font-bold bg-[#5D24FF] text-white rounded-[13px] min-w-[140px] min-h-[40px] shadow-none meal-count-btn"
            style={{
              textTransform: 'capitalize',
              backgroundColor: '#5D24FF',
              borderRadius: '13px',
              minWidth: '140px',
              minHeight: '40px',
              boxShadow: 'none',
            }}
          >
            Roster
          </Button>
        </Link>
      </div>
      <div className="mb-28">
        <div className="flex w-full justify-center">
          <div className="welcome-text-container sm:hidden">
            <h3 className="welcome-text">Welcome Back,</h3>
            <h5 className="full-name-text flex justify-center">
              {name + ' ' + lastname}
            </h5>
          </div>
        </div>
        <div className="relative w-full flex md:items-center justify-center">
          <div className="mt-10 md:mt-4 flex justify-center md:justify-end w-full md:w-4/5">
            <div className="flex md:items-center">
              <FileDownloadButton files={files} loadingFiles={loadingFiles} />
            </div>
            <Link
              href="/request"
              className={`flex items-center justify-center gap-1 text-black text-sm text-transform[capitalize] font-bold bg-[#FACA1F] rounded-[13px] min-w-[70px] md:min-w-[140px] min-h-[40px] shadow-none ${
                role === ROLES.Admin ? 'mr-4' : ''
              }`}
            >
              <button
                type="button"
                className="flex flex-col md:flex-row items-center justify-center md:gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4 md:w-6 md:h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                <span className="text-xs md:text-sm">Request</span>
              </button>
            </Link>
            {role === ROLES.Admin && (
              <div className="flex items-center">
                <SitesDropdown
                  sites={sites}
                  onSiteSelected={setSelectedSite}
                  selectedSite={selectedSite}
                  className="text-base md:text-2xl h-auto md:h-28 relative"
                />
              </div>
            )}
          </div>
        </div>
        {sitesDataLoading ? (
          <div className="flex flex-col justify-center items-center h-96">
            <LoadingSpinner />
            <h2 className="mt-4">Loading Dates...</h2>
          </div>
        ) : (
          <>
            <div className="welcome-calendar-container">
              {Object.keys(sitesData)
                .filter(
                  (siteName) => !selectedSite || siteName === selectedSite
                )
                .map((siteName) => (
                  <WelcomeCalendar
                    key={siteName}
                    siteName={siteName}
                    siteData={sitesData[siteName]}
                  />
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default withAuth(Welcome);
