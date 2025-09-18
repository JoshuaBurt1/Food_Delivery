import React from 'react';
import logoImage from '../assets/logo-no-bg.png';

const Logo = ({ width = 120, height = 'auto' }) => {
  return (
    <img 
      src={logoImage} 
      alt="Company Logo" 
      width={width} 
      height={height} 
      style={{ objectFit: 'contain' }}
    />
  );
};

export default Logo;
