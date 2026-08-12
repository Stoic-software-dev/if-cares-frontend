import {
  LocalizationProvider,
  DatePicker,
  TimePicker,
} from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { MealSiteContext } from '../mealSiteProvider/MealSiteProvider';
import React, { useContext, useEffect, useRef } from 'react';
import dayjs from 'dayjs';

const DateTimePickerMobile = () => {
  const {
    selectedSite,
    datesBySite,
    selectedDate,
    setSelectedDate,
    selectedTime1,
    setSelectedTime1,
    lastTimeIn,
    selectedTime2,
    setSelectedTime2,
    lastTimeOut,
    dateError,
    setDateError,
    time1Error,
    setTime1Error,
    time2Error,
    setTime2Error,
    sitesDataError,
    sitesDataLoading,
    refetchAllMeals,
  } = useContext(MealSiteContext);
  const datePickerRef = useRef(null);
  const timePickerInRef = useRef(null);
  const timePickerOutRef = useRef(null);

  useEffect(() => {
    if (dateError && datePickerRef.current) {
      datePickerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      datePickerRef.current.focus();
    } else if (time1Error && timePickerInRef.current) {
      timePickerInRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      timePickerInRef.current.focus();
    } else if (time2Error && timePickerOutRef.current) {
      timePickerOutRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      timePickerOutRef.current.focus();
    }
  }, [dateError, time1Error, time2Error]);

  const shouldDisableDate = (date) => {
    if (!selectedSite || !datesBySite[selectedSite]) {
      return false;
    }

    const formattedDate = dayjs(date).format('YYYY-MM-DD');
    const validDatesForSite = Object.keys(datesBySite[selectedSite].validDates);
    return !validDatesForSite.includes(formattedDate);
  };

  useEffect(() => {
    if (lastTimeIn) {
      const timeInFormatted = formatTimeForPicker(lastTimeIn);
      setSelectedTime1(timeInFormatted);
    }
    if (lastTimeOut) {
      const timeOutFormatted = formatTimeForPicker(lastTimeOut);
      setSelectedTime2(timeOutFormatted);
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

  return (
    <div className="bg-white rounded-lg p-4 shadow mb-4">
      <div className="flex flex-col gap-4">
        {/* Date picker input */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DemoContainer components={['DatePicker']}>
            <div className={`flex flex-col ${dateError ? 'input-error' : ''}`}>
              <label
                htmlFor="date-picker"
                className="text-gray-700 font-semibold"
              >
                DATE
              </label>
              <DatePicker
                id="date-picker"
                value={selectedDate}
                ref={datePickerRef}
                onChange={(date) => {
                  setSelectedDate(date);
                  setDateError(false); // reset error when a date is selected
                }}
                shouldDisableDate={shouldDisableDate}
                disableFuture
                disabled={!datesBySite[selectedSite]}
                required
              />
              {dateError && (
                <span className="text-red-500 text-sm mt-1">
                  Date is required
                </span>
              )}
              {sitesDataError && (
                <span className="text-red-500 text-sm mt-1">
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
          </DemoContainer>
        </LocalizationProvider>

        {/* Time picker input for 'IN' */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DemoContainer components={['TimePicker']}>
            <div className={`flex flex-col ${time1Error ? 'input-error' : ''}`}>
              <label
                htmlFor="time-picker-in"
                className="text-gray-700 font-semibold"
              >
                IN
              </label>
              <TimePicker
                id="time-picker-in"
                value={selectedTime1}
                ref={timePickerInRef}
                onChange={(time) => {
                  setSelectedTime1(time);
                  setTime1Error(false); // reset error when a time is selected
                }}
                required
              />
              {time1Error && (
                <span className="text-red-500 text-sm mt-1">
                  Time In is required
                </span>
              )}
            </div>
          </DemoContainer>
        </LocalizationProvider>

        {/* Time picker input for 'OUT' */}
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DemoContainer components={['TimePicker']}>
            <div className={`flex flex-col ${time2Error ? 'input-error' : ''}`}>
              <label
                htmlFor="time-picker-out"
                className="text-gray-700 font-semibold"
              >
                OUT
              </label>
              <TimePicker
                id="time-picker-out"
                value={selectedTime2}
                ref={timePickerOutRef}
                onChange={(time) => {
                  setSelectedTime2(time);
                  setTime2Error(false); // reset error when a time is selected
                }}
                required
              />
              {time2Error && (
                <span className="text-red-500 text-sm mt-1">
                  Time Out is required
                </span>
              )}
            </div>
          </DemoContainer>
        </LocalizationProvider>
      </div>
    </div>
  );
};

export default DateTimePickerMobile;
