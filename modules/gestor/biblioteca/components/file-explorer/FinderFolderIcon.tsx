import React from 'react';

interface FinderFolderIconProps {
  className?: string;
}

const FinderFolderIcon: React.FC<FinderFolderIconProps> = ({ className = '' }) => (
  <img
    src="/icons/library-folder.svg"
    alt=""
    className={className}
    draggable={false}
  />
);

export default FinderFolderIcon;
