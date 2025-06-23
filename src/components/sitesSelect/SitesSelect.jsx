import React, { useState, useEffect } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from "@mui/material";
import axios from "axios";
import useAuth from "../../hooks/useAuth";
import { API_BASE_URL, ROLES } from "../../constants";
import { logErrorMonitoring } from "@/utils";

const SitesSelect = ({
  onSiteSelected,
  error,
  helperText,
  selectedSiteValue,
  isStudentsRow,
}) => {
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState("");

  const { auth } = useAuth()

  const isUser = auth.role !== ROLES.Admin
  // console.log(isUser)

  useEffect(() => {
    // Set default site for normal users
    if (auth.role !== ROLES.Admin && auth.assignedSite) {
      setSelectedSite(auth.assignedSite);
      if (onSiteSelected) onSiteSelected(auth.assignedSite);
    }
  }, [auth]);

  useEffect(() => {
    setSelectedSite(selectedSiteValue);
  }, [selectedSiteValue]);

  useEffect(() => {
    axios
      .get(
        API_BASE_URL + "?type=sites"
      )
      .then((response) => {
        if (auth.role !== ROLES.Admin) {
          const sites = response.data.filter(item => item.name === auth.assignedSite)
          setSites(sites);
        } else {
          setSites(response.data)
        }
      })
      .catch((error) => {
        console.error("Error fetching sites:", error);
        logErrorMonitoring({
          function_name: 'fetchSites - SitesSelect',
          error: error,
          row_error: error?.stack,
        });
      });
  }, []);

  const handleChange = (event) => {
    setSelectedSite(event.target.value);
    if (onSiteSelected) onSiteSelected(event.target.value);
  };

  return (
    <FormControl fullWidth error={error}>
      <InputLabel
        
        style={{
          // conditional styling based on the page
          display: isStudentsRow ? "none" : "inherit",
        }}
        id="sites-select-label"
      >
        Site
      </InputLabel>
      <Select
        labelId="sites-select-label"
        id="sites-select"
        value={selectedSite}
        label="site"
        onChange={handleChange}
        disabled={isUser}
        style={{
          // conditional styling based on the page
          backgroundColor: isStudentsRow ? "#FFFFFF" : "inherit",
          // border: isStudentsRow ? "solid #e2e8f0 1px" : "inherit",
          // borderRadius: isStudentsRow ? "0.375rem" : "inherit"
          // display: disableSites ? 'none' : 'inline-block'
          cursor: isUser ? 'not-allowed' : 'default',
        }}
      >
        {sites.map((site) => (
          <MenuItem key={site.spreadsheetId} value={site.name}>
            {site.name}
          </MenuItem>
        ))}
      </Select>
      {error && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

export default SitesSelect;
