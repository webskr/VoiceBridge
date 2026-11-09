import React from 'react';
import { ConnectionState } from '../types';

interface ConnectionBadgeProps {
  state: ConnectionState;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ state }) => {
  return (
    <div className={`connection-badge badge-${state}`}>
      <span className="badge-dot" />
      <span>{state}</span>
    </div>
  );
};

