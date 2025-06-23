import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '@/constants';
import LoadingSpinner from '../loadingSpinner/LoadingSpinner';
import { logErrorMonitoring } from '@/utils';

function FileDownloadButton({ files, loadingFiles }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleMenuClick = () => {
    setIsModalOpen(true);
    setError('');
  };

  const handleFileSelection = (fileId) => {
    setSelectedFiles((prevSelected) => {
      if (prevSelected.includes(fileId)) {
        return prevSelected.filter((id) => id !== fileId);
      } else {
        return [...prevSelected, fileId];
      }
    });
    setError('');
  };

  const handleDownloadSelected = () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file to download.');
      return;
    }

    setIsDownloading(true);
    selectedFiles.forEach((fileId) => {
      axios
        .get(API_BASE_URL + '?type=downloadSelectedPdf&fileId=' + fileId)
        .then((response) => {
          const data = response.data;
          const byteCharacters = atob(data.bytes);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const fileBlob = new Blob([byteArray], { type: data.mimeType });
          const link = document.createElement('a');
          link.href = window.URL.createObjectURL(fileBlob);
          link.download = data.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        })
        .catch((error) => {
          console.error('Download error:', error);
          logErrorMonitoring({
            function_name: 'handleDownloadSelected - FileDownloadButton',
            error: error,
            row_error: error?.stack,
          });
        })
        .finally(() => {
          setIsDownloading(false);
          setIsModalOpen(false);
          setSelectedFiles([]);
        });
    });
  };

  useEffect(() => {
    // Disable background scrolling when the modal is open
    if (isModalOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }

    // Cleanup function to ensure the class is removed when the component is unmounted
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isModalOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={handleMenuClick}
        className="flex flex-col md:flex-row items-center justify-center md:gap-2 text-white text-sm text-transform[capitalize] font-semibold bg-[#5D24FF] rounded-[13px] min-w-[70px] md:min-w-[140px] min-h-[40px] shadow-none mr-4"
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
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        <span className="text-xs md:text-sm">Menu</span>
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg">
            <div className="relative bg-white rounded-lg shadow">
              <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t">
                <h3 className="text-xl font-medium text-gray-900">
                  Select Files to Download
                </h3>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)} // Close the modal
                  className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center"
                >
                  <svg
                    className="w-3 h-3"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                  >
                    <path
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                  </svg>
                  <span className="sr-only">Close modal</span>
                </button>
              </div>

              {loadingFiles ? (
                <div className="h-36 flex items-center justify-center">
                  <div className="flex items-center gap-4">
                    <LoadingSpinner />
                    <span>Loading Files . . .</span>
                  </div>
                </div>
              ) : (
                <>
                  <ul className="py-4 px-6">
                    {files.map((file) => (
                      <li key={file.id} className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          style={{ accentColor: '#6BE3A3' }}
                          value={file.id}
                          onChange={() => handleFileSelection(file.id)}
                          className="mr-2 w-4 h-4 rounded-md"
                        />
                        {file.name}
                      </li>
                    ))}
                    {error && (
                      <span className="text-red-600 text-xs mt-1 pl-1">
                        {error}
                      </span>
                    )}
                  </ul>

                  <div className="flex justify-end px-6 pb-6">
                    <button
                      onClick={handleDownloadSelected}
                      disabled={isDownloading}
                      className="text-black font-bold bg-[#46DC8C] rounded-lg px-6 py-2"
                    >
                      {isDownloading
                        ? 'Downloading...'
                        : 'Download Selected Files'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileDownloadButton;
