import React, { useContext, useEffect, useState } from 'react';
import axios from 'axios';

import { Table } from 'flowbite-react';
import { Button } from '@mui/material';

import useAuth from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useMediaQuery';

import StudentsRow from '../studentsRow/StudentsRow';
import SitesDropdown from '../sitesDropdown/SitesDropdown';
import LoadingSpinner from '../loadingSpinner/LoadingSpinner';
import Pagination from '../pagination/pagination';
import { API_BASE_URL, ROLES } from '../../constants/index';
import EditModal from '../editModal/editModal';

import './StudentsTable.css';
import Link from 'next/link';
import DeleteModal from '../deleteModal/DeleteModal';
import { MealSiteContext } from '../mealSiteProvider/MealSiteProvider';
import { logErrorMonitoring } from '@/utils';

const StudentsTable = () => {
  const { updateCountsOnStudentDeletion } = useContext(MealSiteContext);
  const [students, setStudents] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [studentsPerPage, setStudentsPerPage] = useState(10); // You can adjust this number
  const indexOfLastStudent = currentPage * studentsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;

  const { isMobile } = useBreakpoint();
  //const isMobile = useIsMobile();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [openModal, setOpenModal] = useState(undefined);

  let authObj = useAuth();
  let auth = authObj.auth;

  const paginate = (pageNumber) => {
    // Calculate the total number of pages based on the filtered students
    const totalNumberOfPages = Math.ceil(
      filteredStudents.length / studentsPerPage
    );

    // Ensures the page number stays within valid bounds
    const newPageNumber = Math.max(1, Math.min(pageNumber, totalNumberOfPages));
    setCurrentPage(newPageNumber);
  };

  const filteredStudents = selectedSite
    ? students.filter((student) => student.site === selectedSite)
    : students;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSite, students]);

  const currentStudents = filteredStudents.slice(
    indexOfFirstStudent,
    indexOfLastStudent
  );

  const handleRowClick = (student) => {
    setSelectedStudent(student);
    setIsEditModalOpen(true);
  };

  useEffect(() => {
    // console.log("isEditModalOpen", isEditModalOpen);
  }, [isEditModalOpen]);

  const handleDeleteModalOpen = (student) => {
    setSelectedStudent(student);
    setIsDeleteModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const handleDeleteModalClose = () => {
    setIsDeleteModalOpen(false);
    document.body.style.overflow = 'auto';
  };

  const handleEdit = async (originalStudent, editedStudentData, onSuccess) => {
    // Check if the student is being moved to a different site
    if (originalStudent.site !== editedStudentData.site) {
      // Call function to uncheck checkboxes before transferring the student
      updateCountsOnStudentDeletion(originalStudent.id);
    }

    setOpenModal('pop-up');
    setStudentsPerPage(10);

    const formattedData = {
      actionType: 'edit',
      values: [
        originalStudent.name,
        originalStudent.site,
        originalStudent.id,
        editedStudentData.name,
        editedStudentData.age,
        editedStudentData.site,
      ],
    };

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

      // Checking if the response is OK (status in the range 200-299)
      if (response.ok) {
        const responseData = await response.json();

        // Check if the response indicates a successful edit
        if (responseData.result === 'success') {
          onSuccess('success');
        } else {
          onSuccess('error', responseData.message); // Pass the error message from API
        }
      } else {
        // Handle cases where response is not OK
        onSuccess('error', 'Failed to edit student. Try again later.');
      }

      fetchAllData();
    } catch (error) {
      logErrorMonitoring({
        function_name: 'handleEdit - StudentsTable',
        error: error,
        row_error: error?.stack,
      });
      // Handle network or unexpected errors
      onSuccess('error', 'Network or unexpected error occurred.');
      setOpenModal('error');

      fetchAllData();
    }
  };

  const GAS_URL = API_BASE_URL;

  useEffect(() => {
    fetchAllData();
  }, []);

  // acabo de crear esta funcion ahora hay que mandarsela a los hijos para que la puedan correr
  const fetchAllData = () => {
    Promise.all([
      axios.get(GAS_URL + '?type=students'),
      axios.get(GAS_URL + '?type=sites'),
    ])
      .then(([studentsResponse, sitesResponse]) => {
        // console.log("Students data:", studentsResponse.data);
        if (auth.role !== ROLES.Admin) {
          const students = studentsResponse.data.filter(
            (item) => item.site === auth.assignedSite
          );
          const sites = sitesResponse.data.filter(
            (item) => item.name === auth.assignedSite
          );
          setStudents(students);
          setSites(sites);
          setLoading(false);
        } else {
          setStudents(studentsResponse.data);
          setSites(sitesResponse.data);
          setLoading(false);
        }
      })
      .catch((error) => {
        logErrorMonitoring({
          function_name: 'fetchAllData - StudentsTable',
          error: error,
          row_error: error?.stack,
        });
        console.error('Error:', error);
        setLoading(false);
      });
  };

  return (
    <div className="bg-gray-100 p-0 m-0 box-border flex justify-center items-center">
      <div className="mt-5 mb-12 sm:w-4/5 min-h-[800px] pb-20 table-container">
        <div className="flex w-full justify-between items-center mt-[60px] mb-[30px] min-h-[50px] flex-col md:flex-row">
          <div className="w-full flex justify-end md:justify-start md:w-auto px-4 sm:px-0">
            <Link href="/mealCount">
              <Button
                variant="contained"
                className="font-bold bg-[#46DC8C] rounded-[13px] min-w-[140px] min-h-[40px] shadow-none text-base"
                style={{
                  color: '#000000',
                  textTransform: 'capitalize',
                  fontWeight: 'bold',
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
          </div>
          {/* This div will center the dropdown and button below the Meal Count button on mobile */}
          <div className="flex flex-row justify-between m-auto px-4 sm:px-0 items-center w-full mt-4 md:justify-end md:mt-0 md:flex-row md:items-center text-base gap-4">
            {auth.role !== ROLES.Admin && (
              <h2 className="title pr-4">{auth.assignedSite}</h2>
            )}
            {auth.role === ROLES.Admin && (
              <SitesDropdown
                sites={sites}
                onSiteSelected={setSelectedSite}
                selectedSite={selectedSite}
                className="mb-4 md:mb-0 md:mr-4 text-base md:text-2xl h-auto md:h-28"
              />
            )}
            <Link href="/addStudent">
              <Button
                className=" font-bold bg-[#5D24FF] rounded-[13px] min-w-[140px] min-h-[40px] shadow-none"
                variant="contained"
                style={{
                  fontSize: '14px',
                  textTransform: 'capitalize',
                  fontWeight: 'bold',
                  backgroundColor: '#5D24FF',
                  borderRadius: '13px',
                  minWidth: '140px',
                  minHeight: '40px',
                  boxShadow: 'none',
                }}
              >
                Add Student
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center h-96">
            <LoadingSpinner />
            <h2 className="mt-4 text-center text-md text-gray-900">
              Loading Students...
            </h2>
          </div>
        ) : (
          <>
            <div className="sm:block hidden w-full">
              <table className="w-full">
                <thead className="text-left ">
                  <tr>
                    <th className="uppercase text-black text-base font-semibold leading-loose bg-white border-b-2 border-[#1E1E1E] w-3/12 p-2 pl-6">
                      Student Name
                    </th>
                    <th className="uppercase text-black text-base font-semibold leading-loose  bg-white border-b-2 border-[#1E1E1E] w-1/5 p-2 pl-6">
                      Age
                    </th>
                    {auth.role === ROLES.Admin && (
                      <th className="uppercase text-black text-base font-semibold leading-loose  bg-white border-b-2 border-[#1E1E1E] w-1/5 p-2 pl-6">
                        Site
                      </th>
                    )}
                    {/* Edit cell */}
                    <th className="text-black text-base font-bold leading-loose  bg-white border-b-2 border-[#1E1E1E]  w-1/8 md:table-cell p-2 pl-6">
                      <span className="sr-only">Edit</span>
                    </th>
                    <th className="text-black text-base font-bold leading-loose bg-white border-b-2 border-[#1E1E1E]  w-1/8 md:table-cell p-2 pl-6">
                      <span className="sr-only">Delete</span>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {currentStudents
                    .filter(
                      (student) =>
                        !selectedSite || student.site === selectedSite
                    )
                    .map((student) => (
                      <StudentsRow
                        student={student}
                        key={student.id}
                        showSiteColumn={auth.role === ROLES.Admin}
                        birthdate={student.birthdate}
                        onDeleteModalOpen={handleDeleteModalOpen}
                        fetchAllData={fetchAllData}
                        // handleEdit={(editedStudent) => handleEdit(student, editedStudent)}
                      />
                    ))}
                </tbody>
              </table>
            </div>
            <div className="block sm:hidden ">
              {/* Mobile-friendly list */}
              {currentStudents
                .filter(
                  (student) => !selectedSite || student.site === selectedSite
                )
                .map((student) => (
                  <div
                    className="flex flex-col p-4 border-b bg-white rounded-lg mt-2 text-lg relative"
                    key={student.id}
                  >
                    <span className="font-bold bg-white rounded-lg text-xl mb-2 block">
                      {student.name}
                    </span>
                    <span className="text-lg">Age: {student.age}</span>
                    {auth.role === ROLES.Admin && (
                      <span className="text-lg">Site: {student.site}</span>
                    )}
                    <div className="flex justify-end font-semibold mt-2">
                      <Button
                        onClick={() => {
                          if (isMobile) {
                            handleRowClick(student);
                          }
                        }}
                        style={{
                          fontWeight: 'semibold',
                          color: '#5D24FF',
                          fontSize: '1.2rem',
                          marginRight: '10px', // Ajusta el espaciado entre los botones
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => {
                          if (isMobile) {
                            handleDeleteModalOpen(student);
                          }
                        }}
                        style={{
                          fontWeight: 'semibold',
                          color: '#E02424',
                          fontSize: '1.2rem',
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            <Pagination
              studentsPerPage={studentsPerPage}
              totalStudents={filteredStudents.length}
              paginate={paginate}
              currentPage={currentPage}
            />
          </>
        )}
        {isEditModalOpen && (
          <EditModal
            student={selectedStudent}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleEdit}
            openModal={openModal}
            sites={sites}
          />
        )}
        {isDeleteModalOpen && (
          <div className="bg-gray-500 bg-opacity-75 fixed inset-0">
            <DeleteModal
              isOpen={isDeleteModalOpen}
              onClose={() => handleDeleteModalClose()}
              student={selectedStudent}
              fetchAllData={fetchAllData}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentsTable;
