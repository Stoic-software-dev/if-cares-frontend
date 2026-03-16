'use client';

import React, { useEffect, useState } from 'react';
import { Dropdown } from 'flowbite-react';
import '../studentsTable/StudentsTable.css';

const SitesDropdown = ({
  sites,
  onSiteSelected,
  selectedSite,
  additionalStyles,
  disableAllSites = false,
}) => {
  const [dropdownHeight, setDropdownHeight] = useState(getDropdownHeight());
  function getDropdownHeight() {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640 ? '40px' : '40px'; // Assuming 640px as the breakpoint for phone devices
    }
    // Si window no está definido (ejecución en el lado del servidor), puedes devolver un valor por defecto.
    return '40px'; // O cualquier otro valor predeterminado que desees
  }

  useEffect(() => {
    function handleResize() {
      setDropdownHeight(getDropdownHeight());
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSiteSelection = (siteName) => {
    onSiteSelected(siteName);
  };

  return (
    <Dropdown
      dismissOnClick={true}
      label={selectedSite || 'All Sites'}
      size="xlg"
      style={{
        minWidth: '185px',
        height: dropdownHeight,
        borderRadius: '13px',
        flexShrink: 0,
        color: '#000000',
        backgroundColor: '#FFFFFF',
        padding: '16px',
        ...additionalStyles,
      }}
      className="dropdown-label h-16 md:h-10"
    >
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {!disableAllSites && selectedSite && (
          <Dropdown.Item
            className="meal-count-btn"
            onClick={() => handleSiteSelection('')}
          >
            All Sites
          </Dropdown.Item>
        )}
        {sites.map((site) => (
          <Dropdown.Item
            className="flex items-center justify-start text-left bg-white py-2 px-4 text-sm text-gray-700 cursor-pointer w-full hover:bg-gray-100 focus:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none dark:hover:text-white dark:focus:bg-gray-600 dark:focus:text-white meal-count-btn"
            key={site.spreadsheetId}
            onClick={() => handleSiteSelection(site.name)}
          >
            {site.name}
          </Dropdown.Item>
        ))}
      </div>
    </Dropdown>
  );
};

export default SitesDropdown;
