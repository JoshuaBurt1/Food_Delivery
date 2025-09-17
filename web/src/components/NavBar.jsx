import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../index.css"; // Assuming this contains styles for .navbar, .dropdown, etc.

export default function NavBar({ onSelectRole }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const roles = [
    { label: "User", value: "user" },
    { label: "Restaurant Manager", value: "restaurant" },
    { label: "Courier", value: "courier" },
  ];

  // Toggle dropdown open/close
  const toggleDropdown = () => setIsOpen((prev) => !prev);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle selecting a role
  const handleRoleClick = (value) => {
    onSelectRole(value);        // Pass role to App
    navigate("/login");         // Go to login page
    setIsOpen(false);           // Close dropdown
  };

  return (
    <div className="navbar">
      {/* Home Link */}
      <Link to="/" className="nav-home-link">
        Home
      </Link>

      {/* Dropdown */}
      <div className="dropdown" ref={dropdownRef}>
        <button className="dropdown-button" onClick={toggleDropdown}>
          Login as: <span className="arrow">▾</span>
        </button>

        {isOpen && (
          <ul className="dropdown-menu">
            {roles.map((role) => (
              <li
                key={role.value}
                className="dropdown-item"
                onClick={() => handleRoleClick(role.value)}
              >
                {role.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
