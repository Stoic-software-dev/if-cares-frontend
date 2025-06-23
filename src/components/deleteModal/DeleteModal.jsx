import React, { useContext, useEffect, useRef, useState } from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';
import axios from 'axios';
import LoadingSpinner from '../loadingSpinner/LoadingSpinner';
import DeleteToast from '../deleteToast/DeleteToast';
import { MealSiteContext } from '../mealSiteProvider/MealSiteProvider';
import { API_BASE_URL } from '@/constants';

const DeleteModal = ({ onClose, student, fetchAllData }) => {
  const { updateCountsOnStudentDeletion } = useContext(MealSiteContext);
  const [loading, setLoading] = useState(false);
  const [toastType, setToastType] = useState(null);

  const handleDeleteStudent = async () => {
    setLoading(true);
    updateCountsOnStudentDeletion(student.id);

    const deleteData = {
      actionType: 'delete',
      values: [student.name, student.site, student.id],
    };

    // const PROXY_URL = 'https://happy-mixed-gaura.glitch.me/';
    // const GAS_DELETE_URL = API_BASE_URL;

    try {
      // Making the fetch request using async/await
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(deleteData),
      });

      // Checking if the response is OK (status in the range 200-299)
      if (response.ok) {
        // Assuming that we want to set the response to success only if we get a successful status
        const responseData = await response.json();
        // console.log("Student deleted successfully:", responseData);
        setToastType('success');
      } else {
        // If response is not OK, set the error
        // console.error("Error in deleting student:", response);
        setToastType('error');
      }
    } catch (error) {
      await logErrorMonitoring({
        function_name: 'handleDeleteStudent - DeleteModal',
        error: error,
        row_error: error?.stack,
      });
      // Handle any network or unexpected errors
      // console.error("Error deleting student:", error);
      setToastType('error');
    } finally {
      setLoading(false);
      fetchAllData();
      setTimeout(handleCloseModal, 3000);
    }
  };

  const handleCloseModal = () => {
    onClose && onClose();
  };

  const modalRef = useRef(null);

  useEffect(() => {
    if (modalRef.current) {
      modalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center">
      <div ref={modalRef} className="bg-white rounded-lg p-8 w-80 h-72">
        {toastType ? (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72">
            <DeleteToast type={toastType} />
          </div>
        ) : (
          <>
            <div className="text-center">
              {loading ? (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <LoadingSpinner />
                  <h2 className="mt-4 text-center text-md text-gray-900">
                    Deleting {student.name}...
                  </h2>
                </div>
              ) : (
                <>
                  <HiOutlineExclamationCircle className="mx-auto mb-4 h-14 w-14 text-gray-400 dark:text-gray-200" />
                  <h3 className="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
                    Are you sure you want to <b>delete</b> {student.name}?
                  </h3>
                  <div className="flex justify-center gap-4">
                    <button
                      className="bg-red-600 text-white px-4 py-2 rounded"
                      onClick={handleDeleteStudent}
                    >
                      Yes, I am sure
                    </button>
                    <button
                      className="bg-gray-300 text-gray-700 px-4 py-2 rounded"
                      onClick={handleCloseModal}
                    >
                      No, cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DeleteModal;
