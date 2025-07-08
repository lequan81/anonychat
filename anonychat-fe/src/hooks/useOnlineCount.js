import { useContext } from 'react';
import { OnlineCountContext } from '@context/OnlineCountContext';

export function useOnlineCount() {
  return useContext(OnlineCountContext);
}
