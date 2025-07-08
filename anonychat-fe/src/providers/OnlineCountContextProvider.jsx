import React, { useState, useMemo } from 'react';
import { OnlineCountContext } from '@context/OnlineCountContext';

export default function OnlineCountContextProvider({ children }) {
  const [onlineCount, setOnlineCount] = useState(0);
  const value = useMemo(() => ({ onlineCount, setOnlineCount }), [onlineCount]);
  return <OnlineCountContext.Provider value={value}>{children}</OnlineCountContext.Provider>;
}
