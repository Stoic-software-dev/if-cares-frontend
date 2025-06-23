'use client';
import LoadingSpinner from '@/components/loadingSpinner/LoadingSpinner';
import RequestToast from '@/components/requestToast/RequestToast';
import SitesSelect from '@/components/sitesSelect/SitesSelect';
import { API_BASE_URL } from '@/constants';
import withAuth from '@/hoc/hocauth';
import { logErrorMonitoring } from '@/utils';
import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { LocalizationProvider, TimePicker } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import axios from 'axios';
import Link from 'next/link';
import React, { useState } from 'react';

const Page = () => {
  const [requestType, setRequestType] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState(null);
  const [selectedSite, setSelectedSite] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState('success');

  const handleRequestTypeChange = (event) => {
    setRequestType(event.target.value);
    setErrors({ ...errors, requestType: '' });
  };

  const handleAmountChange = (event) => {
    let value = event.target.value;

    // Automatically set the value to 1 if the input is 0 or less
    if (value !== '' && Number(value) <= 0) {
      value = 1;
    }

    setAmount(value);

    // Validate and set errors if the value is invalid
    if (
      value !== '' &&
      (!Number.isInteger(Number(value)) || Number(value) <= 0)
    ) {
      setErrors({ ...errors, amount: 'Please enter a valid amount' });
    } else {
      setErrors({ ...errors, amount: '' });
    }
  };

  const handleTimeChange = (newValue) => {
    setTime(newValue);
    setErrors({ ...errors, time: '' });
  };

  const handleSiteChange = (site) => {
    setSelectedSite(site);
    setErrors({ ...errors, selectedSite: '' });
  };

  const validateForm = () => {
    let formIsValid = true;
    let newErrors = {};

    if (!requestType) {
      newErrors.requestType = 'Please select a Request Type';
      formIsValid = false;
    }

    if (showNumberInput && !amount) {
      newErrors.amount = 'Please introduce an Amount';
      formIsValid = false;
    }

    if (showTimePicker && !time) {
      newErrors.time = 'Please select a Time';
      formIsValid = false;
    }

    if (!selectedSite) {
      newErrors.selectedSite = 'Please select a Site';
      formIsValid = false;
    }

    setErrors(newErrors);
    return formIsValid;
  };

  const formatTime = (selectedTime) => {
    if (selectedTime) {
      const date = new Date(selectedTime.$d); // Convert Dayjs object to a Date object
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();
      const timeOfDay = hours >= 12 ? 'PM' : 'AM';
      const formattedTime = `${hours % 12 || 12}:${minutes
        .toString()
        .padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${timeOfDay}`;
      return formattedTime;
    }
    return '';
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (validateForm()) {
      setLoading(true);
      const formData = {
        requestType,
        amount,
        time: time ? formatTime(time) : '',
        selectedSite,
      };

      const queryParams = new URLSearchParams(formData).toString();
      axios
        .get(`${API_BASE_URL}?type=request&${queryParams}`)
        .then((response) => {
          setLoading(false);
          setToastType('success');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          setRequestType('');
          setAmount('');
          setTime(null);
        })
        .catch((error) => {
          logErrorMonitoring({
            function_name: 'onSubmit - addStudent',
            error: error,
            row_error: error?.stack,
          });
          setLoading(false);
          setToastType('error');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
        });
    }
  };

  const showNumberInput = [
    'Sporks',
    'Meal Increase',
    'Meal Decrease',
    'Condiments',
    'Special Meals',
    'Dietary Restrictions',
    'Amount of milk on hand',
  ].includes(requestType);
  const showTimePicker = requestType === 'Change approved meal service time';
  return (
    <>
      <div className="flex items-center justify-center w-full mt-[85px] mb-[60px] md:my-[80px]">
        <div className="flex items-start justify-start w-4/5">
          <Link href="/">
            <button className="text-transform[capitalize] text-black text-sm font-bold bg-[#FACA1F] rounded-[13px] min-w-[140px] min-h-[40px] shadow-none">
              Back
            </button>
          </Link>
        </div>
      </div>

      <div className="w-full flex justify-center items-center">
        <form
          onSubmit={handleSubmit}
          className=" min-w-[350px] md:min-w-[500px] shadow-2xl rounded-2xl bg-white mb-[80px]"
        >
          <div className="w-full flex justify-center mt-7 md:mt-10">
            <h2 className="w-4/5 text-xl md:text-2xl self-start not-italic font-extrabold leading-normal">
              Submit a New Request
            </h2>
          </div>
          <div className="mt-5 md:mt-10 flex flex-col items-center">
            <div className="w-4/5">
              <FormControl fullWidth error={!!errors.requestType}>
                <InputLabel id="demo-simple-select-label">
                  Request Type
                </InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={requestType}
                  label="Request Type"
                  onChange={handleRequestTypeChange}
                >
                  <MenuItem value={'Sporks'}>Sporks</MenuItem>
                  <MenuItem value={'Meal Increase'}>Meal Increase</MenuItem>
                  <MenuItem value={'Meal Decrease'}>Meal Decrease</MenuItem>
                  <MenuItem value={'Change approved meal service time'}>
                    Change approved meal service time
                  </MenuItem>
                  <MenuItem value={'Condiments'}>Condiments</MenuItem>
                  <MenuItem value={'Special Meals'}>Special Meals</MenuItem>
                  <MenuItem value={'Dietary Restrictions'}>
                    Dietary Restrictions
                  </MenuItem>
                  <MenuItem value={'Amount of milk on hand'}>
                    Amount of milk on hand
                  </MenuItem>
                </Select>
                {errors.requestType && (
                  <FormHelperText error>{errors.requestType}</FormHelperText>
                )}
              </FormControl>
            </div>
            {showNumberInput && (
              <div className="w-4/5 mt-7 md:mt-10">
                <TextField
                  fullWidth
                  name="amount"
                  label="Amount"
                  variant="outlined"
                  type="number"
                  value={amount}
                  onChange={handleAmountChange}
                  error={!!errors.amount}
                  helperText={errors.amount}
                />
              </div>
            )}
            {showTimePicker && (
              <div className="w-4/5 mt-5 md:mt-8">
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <DemoContainer components={['TimePicker']}>
                    <div
                      className={`w-full ${
                        errors.time ? 'border border-red-600 rounded-md' : ''
                      }`}
                    >
                      <TimePicker
                        className="w-full"
                        label="Time"
                        value={time}
                        onChange={handleTimeChange}
                        error={!!errors.selectedSite}
                      />
                    </div>
                  </DemoContainer>
                </LocalizationProvider>
                {errors.time && (
                  <div className="text-red-600 text-xs mt-1 ml-4">
                    {errors.time}
                  </div>
                )}
              </div>
            )}
            <div className="w-4/5 mt-7 md:mt-10">
              <SitesSelect
                onSiteSelected={handleSiteChange}
                selectedSiteValue={selectedSite}
                error={!!errors.selectedSite}
                helperText={errors.selectedSite}
              />
            </div>
          </div>
          <div className="w-full flex justify-center my-5 md:my-10">
            <div className="w-4/5 flex items-start">
              <button
                className=" text-black capitalize font-bold w-[115px] h-[40px] text-sm rounded-xl bg-[#FACA1F] shadow-lg"
                type="submit"
              >
                Submit
              </button>
              {loading && (
                <div className="flex ml-6 gap-6 items-center justify-center">
                  <LoadingSpinner />
                  <span className=" text-center text-xs text-gray-900 md:text-sm">
                    Sending Request...
                  </span>
                </div>
              )}
              {showToast && <RequestToast type={toastType} />}
            </div>
          </div>
        </form>
      </div>
    </>
  );
};

export default withAuth(Page);
