'use client';

import './Form.css';
import { Button, TextField } from '@mui/material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import SitesSelect from '../../components/sitesSelect/SitesSelect';
import axios from 'axios';
import LoadingSpinner from '../../components/loadingSpinner/LoadingSpinner';
import React, { useEffect, useState } from 'react';
import FormToast from '../../components/formToast/FormToast';
import withAuth from '@/hoc/hocauth';
// Date picker imports
import { DemoContainer } from '@mui/x-date-pickers/internals/demo';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import Link from 'next/link';
import { API_BASE_URL } from '@/constants';
import { logErrorMonitoring } from '@/utils';

const Form = () => {
  let initialValues = {
    name: '',
    birthdate: null,
    age: '',
    site: '',
    customError: '',
  };

  const [submitting, setSubmitting] = useState(false);
  const [toastType, setToastType] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const handleDateChange = (newValue) => {
    setSelectedDate(newValue);
    setFieldValue('birthdate', newValue);
    setFieldValue('customError', '');
  };

  const onSubmit = async (data) => {
    setSubmitting(true);

    // Format the date
    const formattedDate = selectedDate ? selectedDate.format('YYYY-MM-DD') : '';

    const formattedData = {
      actionType: 'add',
      values: [data.name, data.age, data.site, formattedDate],
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

      // Handling the response
      const responseData = await response.json();

      if (responseData.result === 'success') {
        setToastType('success');
        setShowToast(true); // Show toast message
        setSubmitting(false);
        setFieldValue('name', initialValues.name, false);
        setFieldValue('age', initialValues.age, false);
        setFieldValue('birthdate', initialValues.birthdate, false);
      } else {
        setToastType('error');
        setShowToast(true); // Show toast message
        setToastMessage(responseData.message);
        setSubmitting(false);
      }
    } catch (error) {
      console.error('Error:', error);
      await logErrorMonitoring({
        function_name: 'onSubmit - addStudent',
        error: error,
        row_error: error?.stack,
      });
      setToastType('error');
      setShowToast(true); // Show toast message
      setSubmitting(false);
    }
  };

  const {
    handleSubmit,
    handleChange,
    errors,
    values,
    setFieldValue,
    resetForm,
  } = useFormik({
    initialValues,
    validationSchema: Yup.object({
      name: Yup.string()
        .matches(/^[A-Za-z ]+$/, 'Name can only contain letters and spaces.')
        .required('Please enter a name.'),
      birthdate: Yup.date()
        .nullable()
        .transform((value, originalValue) =>
          originalValue === '' ? null : value
        ),
      age: Yup.number().positive().integer().nullable(),
      site: Yup.string().required('Please select a Site.'),
    }).test(
      'birthdateOrAge',
      'Please enter either an age or a birthdate.',
      function (values) {
        const { birthdate, age } = values;
        if (birthdate || age) {
          return true;
        } else {
          return new Yup.ValidationError(
            'Please enter either an age or a birthdate.',
            null,
            'birthdateOrAge'
          );
        }
      }
    ),
    onSubmit,
    validateOnBlur: false,
    validateOnChange: false,
  });

  const handleSiteSelection = (selectedSite) => {
    setFieldValue('site', selectedSite);
  };

  // Function to clear the birthdate component
  const [cleared, setCleared] = React.useState(false);
  React.useEffect(() => {
    if (cleared) {
      const timeout = setTimeout(() => {
        setCleared(false);
      }, 1500);

      return () => clearTimeout(timeout);
    }
    return () => {};
  }, [cleared]);

  useEffect(() => {
    let toastTimeout;

    if (showToast) {
      toastTimeout = setTimeout(() => {
        setShowToast(false); // Hide toast message after 3 seconds
      }, 3000);
    }

    return () => {
      clearTimeout(toastTimeout); // Clear the timeout if the component unmounts
    };
  }, [showToast]);

  return (
    <div className="body">
      <>
        <div className="flex w-full justify-center items-center mt-[80px] mb-[15px] min-h-[50px] md:mb-[30px]">
          <div className="flex w-4/5 items-center">
            <Link href="/home">
              <Button
                variant="contained"
                size="small"
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
                Back
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <form className="form-container" onSubmit={handleSubmit}>
            <div className="w-full flex items-center justify-center">
              <h2 className="w-4/5 text-xl md:text-2xl self-start not-italic font-extrabold leading-normal">
                Add a New Student
              </h2>
            </div>
            <TextField
              className="text-field"
              name="name"
              label="Full Name"
              value={values.name}
              variant="outlined"
              type="text"
              onChange={handleChange}
              error={!!errors.name}
              helperText={errors.name}
              // disabled={submitting}
            />
            <div className="datepicker-container">
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DemoContainer components={['DatePicker']}>
                  <DatePicker
                    label="Birthdate"
                    className="datepicker-item"
                    value={values.birthdate}
                    onChange={handleDateChange}
                    slotProps={{
                      field: {
                        clearable: true,
                        onClear: () => setCleared(true),
                      },
                    }}
                    disableFuture
                    // disabled={submitting}
                  />
                </DemoContainer>
              </LocalizationProvider>
            </div>
            <TextField
              className="text-field"
              name="age"
              label="Age"
              value={values.age}
              variant="outlined"
              type="number"
              onChange={handleChange}
              error={!!errors.age}
              helperText={errors.age}
              // disabled={submitting}
            />
            {errors.birthdateOrAge && (
              <div className="error-message">{errors.birthdateOrAge}</div>
            )}
            <div className="text-field">
              <SitesSelect
                onSiteSelected={handleSiteSelection}
                error={!!errors.site}
                helperText={errors.site}
                selectedSiteValue={values.site}
              />
            </div>
            <div className="flex items-center justify-start w-11/12 sm:w-4/5">
              <button
                className="text-white capitalize font-bold w-[115px] h-[40px] text-sm rounded-xl bg-[#5D24FF] shadow-lg"
                type="submit"
              >
                Submit
              </button>
              {submitting && (
                <div className="flex ml-4 gap-4 items-center justify-center">
                  <LoadingSpinner />
                  <h2 className=" text-center text-xs text-gray-900 sm:text-base">
                    Adding Student...
                  </h2>
                </div>
              )}

              {showToast && toastType === 'success' && (
                <div className="flex items-center ml-6">
                  <FormToast type={toastType} message={toastMessage} />
                </div>
              )}
              {showToast && toastType === 'error' && (
                <div className="flex items-center ml-6">
                  <FormToast type={toastType} message={toastMessage} />
                </div>
              )}
            </div>
          </form>
        </div>
      </>
    </div>
  );
};

export default withAuth(Form);
