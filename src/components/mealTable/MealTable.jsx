import MealTableRow from '../mealTableRow/MealTableRow';
import React, { useContext, useEffect, useState } from 'react';
import MealTableCount from '../mealTableZCount/MealTableCount';
import './MealTable.css';
import dayjs from 'dayjs';
//date select
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
//time select
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { MealSiteContext } from '../mealSiteProvider/MealSiteProvider';

const MealTable = () => {
  const [showMessage, setShowMessage] = useState('');
  const {
    studentData,
    selectedSite,
    lastTimeIn,
    lastTimeOut,
    datesBySite,
    selectedDate,
    setSelectedDate,
    selectedDateCache,
    setSelectedDateCache,
    selectedTime1,
    setSelectedTime1,
    selectedTime2,
    setSelectedTime2,
    selectedCheckboxData,
    globalCounts,
    dateError,
    setDateError,
    time1Error,
    setTime1Error,
    time2Error,
    setTime2Error,
    handleNextClick,
    dateValidationError,
    topRef,
    sitesDataError,
    sitesDataLoading,
    refetchAllMeals,
  } = useContext(MealSiteContext);

  const validStudentData = Array.isArray(studentData) ? studentData : [];

  useEffect(() => {
    if (lastTimeIn) {
      const timeInFormatted = formatTimeForPicker(lastTimeIn);
      setSelectedTime1(timeInFormatted);
      // console.log(timeInFormatted);
    }
    if (lastTimeOut) {
      const timeOutFormatted = formatTimeForPicker(lastTimeOut);
      setSelectedTime2(timeOutFormatted);
      // console.log(timeOutFormatted);
    }
  }, [lastTimeIn, lastTimeOut]);

  function formatTimeForPicker(dateTimeStr) {
    // Extract the time part using a regular expression
    const timeMatch = dateTimeStr.match(/\d{2}:\d{2}:\d{2}/);
    if (!timeMatch) return null;

    let [hours, minutes] = timeMatch[0].split(':').map(Number);

    // Create a dayjs object with the time, assuming the date is today
    const date = dayjs().hour(hours).minute(minutes).second(0);

    return date;
  }

  const shouldDisableDate = (date) => {
    if (!selectedSite || !datesBySite[selectedSite]) {
      // If no site is selected or if there's no data for the selected site
      return false; // Do not disable any dates
    }

    const formattedDate = dayjs(date).format('YYYY-MM-DD');
    const validDatesForSite = Object.keys(datesBySite[selectedSite].validDates);
    return !validDatesForSite.includes(formattedDate);
  };

  useEffect(() => {
    if (selectedDate !== selectedDateCache) {
      setSelectedDateCache(selectedDate);
    }
  }, [selectedDate]);

  // save functionality
  const handleSave = () => {
    if (!selectedSite) {
      setShowMessage('site');
      setTimeout(() => {
        setShowMessage('');
      }, 3000);
      return;
    }
    if (!selectedDate) {
      setShowMessage('date');
      setTimeout(() => {
        setShowMessage('');
      }, 3000);
      return;
    }

    const formattedDate = formatDateForLocalStorage(selectedDate);

    // Retrieve existing data from localStorage
    const savedMealCounts =
      JSON.parse(localStorage.getItem('savedMealCounts')) || [];

    // Find if there's an existing entry for the selected site and date
    const existingIndex = savedMealCounts.findIndex(
      (item) =>
        item.selectedSite === selectedSite &&
        item.selectedDate === formattedDate
    );

    const newEntry = {
      selectedSite,
      selectedDate: formattedDate,
      data: selectedCheckboxData,
    };

    if (existingIndex !== -1) {
      // Replace the existing entry
      savedMealCounts[existingIndex] = newEntry;
    } else {
      // Add the new entry
      savedMealCounts.push(newEntry);
    }

    // Save the updated array back to localStorage
    localStorage.setItem('savedMealCounts', JSON.stringify(savedMealCounts));
    setShowMessage('success');
    setTimeout(() => {
      setShowMessage('');
    }, 3000);
  };

  const formatDateForLocalStorage = (date) => {
    return dayjs(date).format('YYYY-MM-DD');
  };

  const errorIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18 18 6M6 6l12 12"
      />
    </svg>
  );

  const successIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 12.75 6 6 9-13.5"
      />
    </svg>
  );

  const questionMarkIcon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
      />
    </svg>
  );

  return (
    <>
      <div ref={topRef}></div>
      <table className="w-full table-fixed">
        <thead>
          <tr>
            <th className="uppercase text-left text-black text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] p-4 pl-6">
              Date
            </th>
            <th className="uppercase text-left text-black text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] p-4 pl-6">
              In
            </th>
            <th className="uppercase text-left text-black text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] p-4 pl-6">
              Out
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <td className="bg-[#FFFFFF] p-6 pl-6">
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DemoContainer components={['DatePicker']}>
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <div
                        className={
                          dateError || dateValidationError
                            ? 'border border-red-600 rounded-md'
                            : ''
                        }
                      >
                        <DatePicker
                          className="w-full"
                          value={selectedDate}
                          onChange={(date) => {
                            setSelectedDate(date);
                            setDateError(false); // reset error when a date is selected
                            // postSelectedDate(date); // Make the POST request with the new date
                          }}
                          shouldDisableDate={shouldDisableDate}
                          required
                          error={Boolean(dateValidationError)}
                          helperText={dateValidationError}
                          disableFuture
                          disabled={!datesBySite[selectedSite]}
                        />
                      </div>
                      {(dateError || dateValidationError) && (
                        <span className="text-xs text-red-600 ml-3 mt-1">
                          {dateValidationError || 'Date is required'}
                        </span>
                      )}
                      {sitesDataError && (
                        <span className="text-xs text-red-600 ml-3 mt-1">
                          Available dates could not be loaded.{' '}
                          <button
                            type="button"
                            onClick={refetchAllMeals}
                            disabled={sitesDataLoading}
                            className="underline font-semibold"
                          >
                            Retry
                          </button>
                        </span>
                      )}
                    </div>
                    {/* {isLoading && (
                      <div  className='ml-4'>
                        <LoadingSpinner />
                      </div>
                    )} */}
                  </div>
                </DemoContainer>
              </LocalizationProvider>
            </td>
            <td className="bg-[#FFFFFF] p-6 pl-6">
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DemoContainer components={['TimePicker']}>
                  <div className="flex flex-col">
                    <div
                      className={
                        time1Error ? 'border border-red-600 rounded-md' : ''
                      }
                    >
                      <TimePicker
                        className="w-full"
                        value={selectedTime1}
                        onChange={(time) => {
                          setSelectedTime1(time);
                          setTime1Error(false); // reset error when a time is selected
                        }}
                        required
                        // minTime={minTime}
                        // maxTime={maxTime}
                      />
                    </div>
                    {time1Error && (
                      <span className="text-xs text-red-600 ml-3 mt-1">
                        Time In is required
                      </span>
                    )}
                  </div>
                </DemoContainer>
              </LocalizationProvider>
            </td>
            <td className="bg-[#FFFFFF] p-6 pl-6">
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DemoContainer components={['TimePicker']}>
                  <div className="flex flex-col">
                    <div
                      className={
                        time2Error ? 'border border-red-600 rounded-md' : ''
                      }
                    >
                      <TimePicker
                        className="w-full"
                        value={selectedTime2}
                        onChange={(time) => {
                          setSelectedTime2(time);
                          setTime2Error(false); // reset error when a time is selected
                        }}
                        required
                        // minTime={minTime}
                        // maxTime={maxTime}
                      />
                    </div>
                    {time2Error && (
                      <span className="text-xs text-red-600 ml-3 mt-1">
                        Time Out is required
                      </span>
                    )}
                  </div>
                </DemoContainer>
              </LocalizationProvider>
            </td>
          </tr>
        </tbody>
      </table>

      <br />
      <table className="w-full">
        <thead className="p-6">
          <tr>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] px-4 pl-6">
              #
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] p-4 pl-6 text-left">
              Name of Participant
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] w-[150px] p-4">
              <div className='flex items-center justify-center'>
                At
                <button className="relative group pl-2">
                  {questionMarkIcon}
                  <span className="group-hover:opacity-100 group-hover:visible transition-opacity bg-white px-1 text-sm text-black rounded-md absolute -translate-x-1/3 translate-y-full opacity-0 invisible mx-auto z-50 top-[-10px]">
                    <div className="flex flex-col p-2 text-xs">
                      <span className="truncate">
                        AT must be checked for the other meals to activate
                      </span>
                    </div>
                  </span>
                </button>
              </div>
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] w-[150px] p-4">
              Brk
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] w-[150px] p-4">
              Lu
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] w-[150px] p-4">
              Snk
            </th>
            <th className="uppercase text-black md:text-base font-semibold leading-relaxed bg-[#C7F4DC] border-b-2 border-[#CACACA] w-[150px] p-4">
              Sup
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {validStudentData.map((student) => (
            <MealTableRow
              student={student}
              selectedSite={selectedSite}
              selectedDate={selectedDate}
              datesBySite={datesBySite}
              key={student.id}
            />
          ))}
        </tbody>
      </table>
      <br />

      <MealTableCount
        attendanceCount={globalCounts.attendance}
        breakfastCount={globalCounts.breakfast}
        lunchCount={globalCounts.lunch}
        snackCount={globalCounts.snack}
        supperCount={globalCounts.supper}
      />
      <br />
      <div className="flex w-full justify-between items-center mb-20">
        <div className="flex flex-col items-start font-bold gap-2">
          <button
            className="flex items-center gap-2 bg-[#FACA1F] rounded-[13px] px-4 md:px-6 min-h-[40px] shadow-none"
            onClick={handleSave}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="25"
              height="25"
              viewBox="0 0 32 32"
            >
              <path
                fill="currentColor"
                d="m27.71 9.29l-5-5A1 1 0 0 0 22 4H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V10a1 1 0 0 0-.29-.71M12 6h8v4h-8Zm8 20h-8v-8h8Zm2 0v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8H6V6h4v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.41l4 4V26Z"
              />
            </svg>
            Save for Later
          </button>
          {showMessage && showMessage == 'success' && (
            <span className="absolute mt-12 text-xs text-green-600 flex items-center gap-1">
              {successIcon} Meal count saved!
            </span>
          )}
          {showMessage && showMessage == 'site' && (
            <span className="absolute mt-12 text-xs text-red-600 flex items-center gap-1">
              {errorIcon}
              Select site to save
            </span>
          )}
          {showMessage && showMessage == 'date' && (
            <span className="absolute mt-12 text-xs text-red-600 flex items-center gap-1">
              {errorIcon}
              Select date to save
            </span>
          )}
        </div>
        <button
          className="text-black font-bold bg-[#46DC8C] text-sm self-center"
          style={{
            borderRadius: '13px',
            minWidth: '140px',
            minHeight: '40px',
            boxShadow: 'none',
          }}
          onClick={() => handleNextClick(validStudentData)}
        >
          Next
        </button>
      </div>
    </>
  );
};

export default MealTable;
