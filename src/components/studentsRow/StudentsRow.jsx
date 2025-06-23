'use client';

import { Button, Table } from 'flowbite-react';
import './StudentsRow.css';
import DeleteModal from '../deleteModal/DeleteModal';
import { useContext, useState } from 'react';
import SitesSelect from '../sitesSelect/SitesSelect';
import axios from 'axios';
import SavingModal from '../savingModal/SavingModal';
import { useEffect } from 'react';
import { MealSiteContext } from '../mealSiteProvider/MealSiteProvider';
import { API_BASE_URL } from '@/constants';
import { logErrorMonitoring } from '@/utils';

export default function StudentsRow({
  student,
  showSiteColumn,
  birthdate,
  onDeleteModalOpen,
  onDelete,
  fetchAllData,
}) {
  const { updateCountsOnStudentDeletion } = useContext(MealSiteContext);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedStudent, setEditedStudent] = useState({
    name: student.name,
    age: student.age,
    site: student.site,
  });
  const [openModal, setOpenModal] = useState(undefined);

  const [loading, setLoading] = useState(false);
  const [toastType, setToastType] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  const disableAgeInput = birthdate !== '';

  const handleDeleteClick = () => {
    onDeleteModalOpen(student);
  };

  const handleDelete = () => {
    onDelete(student);
  };

  useEffect(() => {
    if (toastType) {
      setOpenModal(toastType);
      // Reset the toast after a delay
      const timer = setTimeout(() => {
        setOpenModal(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [toastType, toastMessage]);

  // age cell style modifications
  const ageCellStyle = showSiteColumn
    ? 'row-style' // Default style class
    : 'row-style-big'; // Apply a different style when site column is not shown

  const handleEditStudent = async () => {
    setLoading(true);

    // Check if the student is being moved to a different site
    if (student.site !== editedStudent.site) {
      // Call function to uncheck checkboxes before transferring the student
      updateCountsOnStudentDeletion(student.id);
    }

    setOpenModal('pop-up');

    const formattedData = {
      actionType: 'edit',
      values: [
        student.name,
        student.site,
        student.id,
        editedStudent.name,
        editedStudent.age,
        editedStudent.site,
      ],
    };

    // const PROXY_URL = 'https://happy-mixed-gaura.glitch.me/';
    // const GAS_URL = API_BASE_URL;

    try {
      // Making the fetch request using async/await
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(formattedData),
      });

      if (response.ok) {
        const responseData = await response.json();

        if (responseData.result === 'success') {
          setToastType('success');
          setToastMessage('Student edited successfully.');
        } else {
          setToastType('error');
          setToastMessage(
            responseData.message ||
              'Student could not be updated. Try again later.'
          );
        }
      } else {
        setToastType('error');
        setToastMessage('An error occurred. Try again later.');
      }
    } catch (error) {
      // Handle network or unexpected errors
      logErrorMonitoring({
        function_name: 'handleEditStudent - StudentsRow',
        error: error,
        row_error: error?.stack,
      });
      setToastType('error');
      setToastMessage('An error occurred. Try again later.');
    } finally {
      setLoading(false);
      setOpenModal(toastType);
      fetchAllData();
      setTimeout(() => {
        setOpenModal(null); // Hide the toast after a few seconds
      }, 3000);
    }
  };

  return (
    <>
      <SavingModal
        openModal={openModal}
        setOpenModal={setOpenModal}
        loading={loading}
        type={toastType} // Passed to SavingModal
        message={toastMessage} // Passed to SavingModal
      />

      <tr className="bg-white">
        <td className="text-black text-sm font-medium leading-relaxed p-4 pl-6">
          {isEditing ? (
            <input
              type="text"
              className="border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:border-violet-500 h-14 w-full"
              value={editedStudent.name}
              onChange={(e) =>
                setEditedStudent({ ...editedStudent, name: e.target.value })
              }
            />
          ) : (
            student.name
          )}
        </td>
        <td className="text-black text-sm font-normal leading-relaxed p-4 pl-6 max-w-[100px]">
          {isEditing ? (
            <input
              type="number"
              // className="border rounded-md px-3 py-2 w-full focus:border-violet-500 focus:outline-none"
              className="border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:border-violet-500 h-14 w-full min-w-[70px]"
              value={editedStudent.age}
              onChange={(e) =>
                setEditedStudent({ ...editedStudent, age: e.target.value })
              }
              disabled={disableAgeInput}
            />
          ) : (
            student.age
          )}
        </td>
        {showSiteColumn && (
          <td className="text-black text-sm font-normal leading-relaxed p-4 pl-6">
            {isEditing ? (
              <SitesSelect
                isStudentsRow={true}
                className="bg-white"
                selectedSiteValue={editedStudent.site}
                onSiteSelected={(site) =>
                  setEditedStudent((prevStudent) => ({
                    ...prevStudent,
                    site: site,
                  }))
                }
              />
            ) : (
              student.site
            )}
          </td>
        )}
        <td>
          <div className="flex flex-row justify-end items-center">
            {isEditing && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5 cursor-pointer mr-0 md:mr-2"
                onClick={() => setIsEditing(false)}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            )}
            <p
              className="flex justify-end items-center"
              onClick={() => {
                if (isEditing) {
                  handleEditStudent();
                }
                setIsEditing(!isEditing);
              }}
            >
              <span className="inline-block w-20 rounded-lg border border-[#5D24FF] text-[#5D24FF] text-sm text-center leading-relaxed py-2 px-3 ml-2 cursor-pointer hover:text-white hover:bg-[#5D24FF]">
                {isEditing ? 'Save' : 'Edit'}
              </span>
            </p>
          </div>
        </td>
        <td>
          <p className="flex justify-center items-center">
            <button
              className="w-20 text-center rounded-lg border border-[#EA4336] text-[#EA4336] text-sm leading-relaxed py-2 px-3 ml-2 cursor-pointer hover:text-white hover:bg-[#EA4336]"
              onClick={handleDeleteClick}
            >
              Delete
            </button>
          </p>
        </td>
      </tr>
    </>
  );
}
