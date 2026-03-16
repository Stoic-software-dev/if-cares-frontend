import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ROLES } from '../../constants/index';
import useAuth from '../../hooks/useAuth';
import LoadingSpinner from '../loadingSpinner/LoadingSpinner';
import SavingToast from '../savingToast/SavingToast';

const Input = ({ label, id, value, onChange, disabled, classes }) => {
  return (
    <div className={`space-y-8  sm:space-y-0 sm:divide-y sm:divide-gray-900/10 ${classes}`}>
      <div className="sm:grid sm:grid-cols-3 sm:items-start sm:gap-4 sm:py-6">
        <label
          htmlFor="first-name"
          className="text-left block text-sm font-medium leading-6 text-gray-900 sm:pt-1.5"
        >
          {label}
        </label>
        <div className="mt-1 sm:col-span-2 sm:mt-0">
          <input
            value={value}
            onChange={onChange}
            type="text"
            name={id}
            id={id}
            disabled={disabled}
            className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 focus:outline-none sm:max-w-xs sm:text-sm sm:leading-6"
          />
        </div>
      </div>
    </div>
  );
};

const SelectInput = ({ label, id, value, options, onChange }) => {
  return (
    <div className="mb-10 mt-5 space-y-8 sm:space-y-0 sm:divide-y sm:divide-gray-900/10 sm:pb-0">
      <div className="sm:grid sm:grid-cols-3 sm:items-start sm:gap-4 sm:py-6">
        <label
          htmlFor={id}
          className="text-left block text-sm font-medium leading-6 text-gray-900 ml-1"
        >
          {label}
        </label>
        <div className="mt-1 sm:col-span-2 sm:mt-0">
          <select
            value={value}
            onChange={onChange}
            name={id}
            id={id}
            className="block w-full rounded-md border-0 p-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 focus:outline-none sm:max-w-xs sm:text-sm sm:leading-6"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default function EditModal({ student, isOpen, onClose, onSave, sites }) {
  const [editedStudent, setEditedStudent] = useState({ ...student });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [openModal, setOpenModal] = useState('');

  const optionsFromAPI = sites.map((option) => ({
    label: option.name,
    value: option.name,
    key: option.spreadSheetId,
  }));

  let authObj = useAuth();
  let auth = authObj.auth;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedStudent((prevStudent) => ({
      ...prevStudent,
      [name]: value,
    }));
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center"
        onClose={(e) => {
          if (e && e.target && e.target.matches && !e.target.matches('input')) {
            onClose();
          }
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed flex items-center justify-center inset-0 z-10 overflow-y-auto">
          <div className="flex justify-center p-4 text-center sm:items-center justify-center sm:p-0 w-full">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 w-full sm:max-w-sm sm:p-6">
                <div className='px-6'>
                  <div className="mt-3 text-center sm:mt-5">
                    <form>
                      <Input
                        label="Name"
                        id="name"
                        value={editedStudent.name}
                        onChange={handleChange}
                        classes={''}
                      ></Input>
                      <Input
                        label="Age"
                        id="age"
                        value={editedStudent.age}
                        onChange={handleChange}
                        disabled={student.birthdate != ''}
                        classes={'mt-5'}
                      ></Input>
                      {(auth.role === ROLES.Admin || sites.length > 1) && (
                        <SelectInput
                          label="Site"
                          id="site"
                          value={editedStudent.site}
                          options={optionsFromAPI}
                          onChange={handleChange}
                        />
                      )}
                    </form>
                  </div>
                </div>
                <div className="mt-5 flex gap-10 px-6 pb-4">
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-all"
                    onClick={() => {
                      setLoading(true);
                      setSuccessMessage(true);
                      onSave(student, editedStudent, (status) => {
                        setLoading(false);
                        setOpenModal(status);
                        
                        setTimeout(() => {
                          setSuccessMessage(false);
                          onClose();
                        }, 3000);
                      });
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-gray-300 text-gray-700 px-3 py-2 text-sm font-semibold shadow-sm hover:bg-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-all"
                    onClick={() => onClose()}
                  >
                    Cancel
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
        <div>
          {successMessage && (
            <div
              className={`fixed inset-0 z-50 overflow-y-auto ${
                successMessage ? '' : 'hidden'
              }`}
              aria-labelledby="modal-title"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-center min-h-screen">
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle w-80 h-72">
                  <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    {loading && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <LoadingSpinner />
                        <h2 className="mt-4 text-center text-md text-gray-900">
                          Editing Student...
                        </h2>
                      </div>
                    )}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72">
                      {openModal === 'success' && (
                        <SavingToast type="success" />
                      )}
                      {openModal === 'error' && (
                        <SavingToast
                          type="error"
                          message="Student could not be added. Full name must be unique."
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </Transition.Root>
  );
}
