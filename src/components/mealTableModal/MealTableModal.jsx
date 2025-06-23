import React, { useRef, useState } from 'react';
import { Button, Modal } from 'flowbite-react';
import axios from 'axios';
import SignatureComponent from '../signatureComponent/SignatureComponent';
import LoadingSpinner from '../loadingSpinner/LoadingSpinner';
import ConfirmationToast from '../confirmationToast/ConfirmationToast';
import './MealTableModal.css';
import { API_BASE_URL } from '@/constants';
import dayjs from 'dayjs';
import { logErrorMonitoring } from '@/utils';

const MealTableModal = ({
  isOpen,
  closeModal,
  formattedData,
  selectedDate,
  selectedTime1,
  selectedTime2,
  selectedSite,
}) => {
  // const [openModal, setOpenModal] = useState(false); // State for modal visibility
  const signatureComponentRef = useRef(null); // Initialize ref with null

  const [isSignatureEmpty, setIsSignatureEmpty] = useState(false);

  let signData = '';

  const generateSign = (url) => {
    // Do something with the generated signature URL (url)
    signData = url;
    // setSignatureURL(url);
    // console.log('Generated Signature URL:', url);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [toastType, setToastType] = useState(null);

  const formatDateForLocalStorage = (date) => {
    return dayjs(date).format('YYYY-MM-DD');
  };

  const handleFormSubmit = () => {
    setIsLoading(true);
    // function to format the date
    const formatTime = (selectedTime) => {
      if (selectedTime) {
        const date = new Date(selectedTime.$d); // Convert Dayjs object to a Date object
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const timeOfDay = hours >= 12 ? 'PM' : 'AM';
        const formattedTime = `${hours % 12 || 12}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds
          .toString()
          .padStart(2, '0')} ${timeOfDay}`;
        return formattedTime;
      }
      return '';
    };

    // console.log(formattedData);
    // console.log('Selected Date:', selectedDate.toISOString());
    // Formatear la data para poder enviarla
    // console.log('Selected Time 1:', formatTime(selectedTime1));
    // console.log('Selected Time 2:', formatTime(selectedTime2));

    if (signatureComponentRef.current) {
      const formattedSign = signatureComponentRef.current.generateSign();
      // console.log(formattedSign);
    }

    // console.log(signData);

    if (
      signData ===
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAAtJREFUGFdjYAACAAAFAAGq1chRAAAAAElFTkSuQmCC'
    ) {
      setIsSignatureEmpty(true);
      setIsLoading(false);
      return;
    }

    const formattedDate = selectedDate.toISOString();
    const formattedTime1 = formatTime(selectedTime1);
    const formattedTime2 = formatTime(selectedTime2);

    // remove the saved meal count from the storage
    // Retrieve existing data from localStorage
    const savedMealCounts =
      JSON.parse(localStorage.getItem('savedMealCounts')) || [];

    const dateForStorage = formatDateForLocalStorage(formattedDate);

    // Find the index of the entry with matching site and date
    const matchingIndex = savedMealCounts.findIndex(
      (item) =>
        item.selectedSite === selectedSite &&
        item.selectedDate === dateForStorage
    );

    // If a match is found, remove it from the savedMealCounts
    if (matchingIndex !== -1) {
      savedMealCounts.splice(matchingIndex, 1); // Remove the specific item
      // Update localStorage with the modified array
      localStorage.setItem('savedMealCounts', JSON.stringify(savedMealCounts));
    }

    const dataObject = {
      actionType: 'mealCount',
      values: {
        data: formattedData,
        date: formattedDate,
        timeIn: formattedTime1,
        timeOut: formattedTime2,
        signature: signData,
        site: selectedSite,
      },
    };

    console.log(dataObject);

    fetch(API_BASE_URL, {
      redirect: 'follow',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(dataObject),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        if (data.result == 'success') {
          setIsLoading(false);
          setToastType('success');
          setTimeout(() => {
            window.location.assign('/'); // Send to the root
          }, 4000);
        }
        if (data.result == 'error') {
          setIsLoading(false);
          setToastType('error');
          setTimeout(() => {
            window.location.assign('/'); // Send to the root
          }, 4000);
        }
      })
      .catch((error) => {
        logErrorMonitoring({
          function_name: 'handleFormSubmit - MealTableModal',
          error: error,
          row_error: error?.stack,
        });
        setIsLoading(false);
        console.error(error);
        setToastType('unknown');
        setTimeout(() => {
          window.location.reload(); // Refresh the page
        }, 4000);
      });
  };

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
      <Modal
        show={isOpen}
        size="xl"
        popup
        onClose={closeModal}
        className="min-h-[500px] max-w-[500px] flex items-center justify-center mx-auto"
      >
        <Modal.Header />
        <Modal.Body className="modalBody-container">
          {isLoading ? (
            <div className="loadingSpinner-container">
              <LoadingSpinner />
              <h2 className="mt-4 text-center text-md text-gray-900">
                Sending Data...
              </h2>
            </div>
          ) : toastType ? (
            <div className="container-confirmationToast">
              <ConfirmationToast type={toastType} />
            </div>
          ) : (
            <div className="text-center">
              <h3 className="mb-5 text-base md:text-lg font-normal">
                <b>
                  I certify that the information on this form is true and
                  correct to the best of my knowledge and that I will claim
                  reimbursement only for{' '}
                  <span className="underline">eligible</span> meals served to{' '}
                  <span className="underline">eligible</span> Program
                  participants. I understand that misrepresentation may result
                  in prosecution under applicable state or federal laws.
                </b>
              </h3>

              <SignatureComponent
                onGenerateSign={generateSign}
                ref={signatureComponentRef}
              />

              <br />
              <br />
              <div className="flex justify-center gap-4">
                <button
                  className="border border-[#46DC8C] bg[#ffffff] rounded text-black px-3 py-2 hover:bg-[#46DC8C] hover:font-medium transition-all"
                  onClick={handleFormSubmit}
                >
                  SUBMIT
                </button>
              </div>
              {isSignatureEmpty && (
                <p className=" text-red-600 text-xs my-2">Please Sign</p>
              )}
            </div>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default MealTableModal;
