'use client';
import { API_BASE_URL } from '@/constants';
import axios from 'axios';
import React, { createContext, useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import { logErrorMonitoring } from '@/utils';

export const MealSiteContext = createContext();

export const MealSiteProvider = ({ children }) => {
  const [selectedSite, setSelectedSite] = useState('');
  const [siteData, setSiteData] = useState('');

  const [isDataFetched, setIsDataFetched] = useState(false);

  const [lastTimeIn, setLastTimeIn] = useState(null);
  const [lastTimeOut, setLastTimeOut] = useState(null);

  const [studentData, setStudentData] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateCache, setSelectedDateCache] = useState(null);
  const [selectedTime1, setSelectedTime1] = useState(null);
  const [selectedTime2, setSelectedTime2] = useState(null);
  const [selectedCheckboxData, setSelectedCheckboxData] = useState({});
  const [globalCounts, setGlobalCounts] = useState({
    attendance: 0,
    breakfast: 0,
    lunch: 0,
    snack: 0,
    supper: 0,
  });

  const resetGlobalCounts = () => {
    setGlobalCounts({
      attendance: 0,
      breakfast: 0,
      lunch: 0,
      snack: 0,
      supper: 0,
    });
  };

  const resetSelectedCheckboxData = () => {
    setSelectedCheckboxData({});
  };

  const resetSelectedDate = () => {
    setSelectedDate(null);
  };

  const resetDateValidationError = () => {
    setDateValidationError('');
  };

  const [formattedData, setFormattedData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [time1Error, setTime1Error] = useState(false);
  const [time2Error, setTime2Error] = useState(false);
  const [dateValidationError, setDateValidationError] = useState('');

  const updateGlobalCount = (category, isChecked) => {
    setGlobalCounts((prevCounts) => ({
      ...prevCounts,
      [category]: isChecked
        ? prevCounts[category] + 1
        : prevCounts[category] - 1,
    }));
  };

  const handleCheckboxChange = (studentNumber, checkboxState) => {
    setSelectedCheckboxData((prevState) => ({
      ...prevState,
      [studentNumber]: checkboxState,
    }));
  };

  // if we delete a student, uncheck his checkboxes first
  const updateCountsOnStudentDeletion = (studentId) => {
    const studentCheckboxState = selectedCheckboxData[studentId];
    if (studentCheckboxState) {
      ['attendance', 'breakfast', 'lunch', 'snack', 'supper'].forEach(
        (category) => {
          if (studentCheckboxState[category]) {
            updateGlobalCount(category, false);
          }
        }
      );
    }
  };

  // como hay una saved Meal en el local Storage updateamos los counts
  const updateCountsForSavedMeal = (data) => {
    Object.keys(data).forEach((studentId) => {
      // Check if the student exists in the studentData array
      const studentExists = studentData.some(
        (student) => student.id === studentId
      );

      // Skip if the student does not exist in studentData
      if (!studentExists) return;

      // Pass the relevant data for each student to the function
      updateCountsOnSavedMealCounts(studentId, data[studentId]);
    });
  };

  // Modify the function to accept the student's data directly
  const updateCountsOnSavedMealCounts = (studentId, studentData) => {
    // Use the studentData instead of selectedCheckboxData
    if (studentData) {
      ['attendance', 'breakfast', 'lunch', 'snack', 'supper'].forEach(
        (category) => {
          if (studentData[category]) {
            updateGlobalCount(category, true);
          }
        }
      );
    }
  };

  const formatDateForLocalStorage = (date) => {
    return dayjs(date).format('YYYY-MM-DD');
  };
  // funcion que checkea
  const checkSavedMealCounts = () => {
    if (selectedSite && selectedDate) {
      const formattedDate = formatDateForLocalStorage(selectedDate);

      // Retrieve existing data from localStorage
      const savedMealCounts =
        JSON.parse(localStorage.getItem('savedMealCounts')) || [];

      // Find if there's an existing entry for the selected site and date
      const matchingEntry = savedMealCounts.find(
        (item) =>
          item.selectedSite === selectedSite &&
          item.selectedDate === formattedDate
      );

      // If a matching entry is found, set the checkbox data
      if (matchingEntry) {
        setSelectedCheckboxData(matchingEntry.data);
        return matchingEntry.data;
      }
    }
    return false;
  };

  const topRef = useRef(null); // Create a ref for the top of the component

  const resetAllStates = () => {
    setSelectedSite('');
    setSiteData('');
    setIsDataFetched(false);

    setLastTimeIn(null);
    setLastTimeOut(null);

    setStudentData('');
    setSelectedDate(null);
    setSelectedTime1(null);
    setSelectedTime2(null);
    setSelectedCheckboxData({});

    setGlobalCounts({
      attendance: 0,
      breakfast: 0,
      lunch: 0,
      snack: 0,
      supper: 0,
    });

    resetGlobalCounts(); // If this function already resets globalCounts, you can use this alone
    resetSelectedCheckboxData(); // If this function already resets selectedCheckboxData, you can use this alone
    resetSelectedDate(); // If this function already resets selectedDate, you can use this alone
    resetDateValidationError(); // If this function already resets dateValidationError, you can use this alone

    setFormattedData([]);
    setIsModalOpen(false);
    setDateError(false);
    setTime1Error(false);
    setTime2Error(false);
    setDateValidationError('');
  };

  const handleNextClick = (validStudentData) => {
    setDateError(!selectedDate);
    setTime1Error(!selectedTime1);
    setTime2Error(!selectedTime2);

    if (
      dateValidationError ||
      !selectedDate ||
      !selectedTime1 ||
      !selectedTime2
    ) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    // Initialize an array to store the formatted data for each student
    const formattedData = validStudentData.map((student) => {
      const validStudentData = [student.number, student.name, student.age];

      // Check if selectedCheckboxData exists for this student
      if (selectedCheckboxData[student.id]) {
        // Add checkbox values to the array
        validStudentData.push(
          selectedCheckboxData[student.id].attendance,
          selectedCheckboxData[student.id].breakfast,
          selectedCheckboxData[student.id].lunch,
          selectedCheckboxData[student.id].snack,
          selectedCheckboxData[student.id].supper
        );
      } else {
        // If selectedCheckboxData doesn't exist, add false values for checkboxes
        validStudentData.push(false, false, false, false, false);
      }

      return validStudentData;
    });

    // console.log(formattedData)

    setFormattedData(formattedData);

    setIsModalOpen(true);
  };

  const [datesBySite, setDatesBySite] = useState({});

  // //get request
  // useEffect(() => {
  //   const GAS_URL = API_BASE_URL;
  //   axios
  //     .get(GAS_URL + '?type=mealCountDays')
  //     .then((response) => {
  //       // console.log('Data received:', response.data);
  //       // setDatesBySite(response.data);
  //       console.log('mealCountDays')
  //       console.log(response.data)
  //     })
  //     .catch((error) => {
  //       // console.error('Error fetching data:', error);
  //     });
  // }, []);

  const [sitesData, setSitesData] = useState({});
  const [sitesDataLoading, setSitesDataLoading] = useState(false);

  useEffect(() => {
    setSitesDataLoading(true);
    axios
      .get(API_BASE_URL + '?type=allMeals')
      .then((response) => {
        // console.log('Data received:', response.data);
        setSitesData(response.data);
        setDatesBySite(response.data);
        // console.log('homeDates')
        // console.log(response.data)
        setSitesDataLoading(false);
      })
      .catch((error) => {
        // console.error('Error fetching data:', error);
        logErrorMonitoring({
          function_name: 'fetchAllMeals - MealSiteProvider',
          error: error,
          row_error: error?.stack,
        });
        setSitesDataLoading(false);
      });
  }, []);

  return (
    <MealSiteContext.Provider
      value={{
        selectedSite,
        setSelectedSite,
        siteData,
        setSiteData,
        isDataFetched,
        setIsDataFetched,
        studentData,
        setStudentData,
        selectedDate,
        setSelectedDate,
        selectedDateCache,
        setSelectedDateCache,
        selectedTime1,
        setSelectedTime1,
        selectedTime2,
        setSelectedTime2,
        selectedCheckboxData,
        setSelectedCheckboxData,
        updateCountsForSavedMeal,
        updateCountsOnSavedMealCounts,
        checkSavedMealCounts,
        handleCheckboxChange,
        updateCountsOnStudentDeletion,
        updateGlobalCount,
        globalCounts,
        resetGlobalCounts,
        resetSelectedCheckboxData,
        resetSelectedDate,
        resetDateValidationError,
        formattedData,
        setFormattedData,
        isModalOpen,
        setIsModalOpen,
        dateError,
        setDateError,
        datesBySite,
        time1Error,
        setTime1Error,
        time2Error,
        setTime2Error,
        handleNextClick,
        lastTimeIn,
        setLastTimeIn,
        lastTimeOut,
        setLastTimeOut,
        dateValidationError,
        setDateValidationError,
        topRef,
        resetAllStates,
        sitesData,
        sitesDataLoading,
      }}
    >
      {children}
    </MealSiteContext.Provider>
  );
};
